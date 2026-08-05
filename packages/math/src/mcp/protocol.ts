import { MathEngineError, asMathEngineError } from "../errors.js";
import type { AgentToolDefinition, JsonValue } from "../types.js";
import { isPlainObject, toJsonValue } from "../util.js";
import { MATH_RUNTIME_VERSION } from "../version.js";
import { AgentMathRuntime } from "../agent/runtime.js";

export const MCP_SERVER_INFO = Object.freeze({
  name: "famtutor-math-runtime",
  version: MATH_RUNTIME_VERSION
});

export const MCP_SUPPORTED_VERSIONS = Object.freeze([
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2024-11-05"
]);

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: Record<string, JsonValue>;
  error?: {
    code: number;
    message: string;
    data?: JsonValue;
  };
}

function toolForMcp(definition: AgentToolDefinition): Record<string, JsonValue> {
  const mutating = ["math_create", "math_apply", "math_simulate"].includes(definition.name);
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    ...(definition.outputSchema ? { outputSchema: definition.outputSchema } : {}),
    annotations: {
      readOnlyHint: !mutating,
      destructiveHint: definition.name === "math_apply",
      idempotentHint: definition.name !== "math_apply" || false,
      openWorldHint: false
    }
  };
}

function textResult(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  // Avoid exceeding typical MCP client message budgets on accidental giant SVG results.
  if (text.length <= 1_500_000) return text;
  return `${text.slice(0, 1_500_000)}\n... [truncated by MCP transport]`;
}

function protocolVersionFrom(request: JsonRpcRequest): string | undefined {
  const meta = request.params?._meta;
  if (!isPlainObject(meta)) return undefined;
  const value = meta["io.modelcontextprotocol/protocolVersion"];
  return typeof value === "string" ? value : undefined;
}

function isModern(request: JsonRpcRequest): boolean {
  const version = protocolVersionFrom(request);
  return request.method === "server/discover" || version === "2026-07-28";
}

function success(id: JsonRpcRequest["id"], result: Record<string, JsonValue>): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function failure(id: JsonRpcRequest["id"], code: number, message: string, data?: JsonValue): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

function validateRequest(message: unknown): JsonRpcRequest {
  if (!isPlainObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    throw new MathEngineError("MCP_INVALID_REQUEST", "Message must be a JSON-RPC 2.0 request or notification.", { retryable: false });
  }
  if (message.params !== undefined && !isPlainObject(message.params)) {
    throw new MathEngineError("MCP_INVALID_PARAMS", "JSON-RPC params must be an object.");
  }
  return message as unknown as JsonRpcRequest;
}

function legacyInitializeResult(request: JsonRpcRequest): Record<string, JsonValue> {
  const requested = typeof request.params?.protocolVersion === "string" ? request.params.protocolVersion : "2025-06-18";
  const selected = MCP_SUPPORTED_VERSIONS.includes(requested) && requested !== "2026-07-28" ? requested : "2025-06-18";
  return {
    protocolVersion: selected,
    capabilities: {
      tools: { listChanged: false }
    },
    serverInfo: MCP_SERVER_INFO,
    instructions: "Create a MathDocument, apply typed construction operations, validate, render, and simulate. Carry documentId and revision explicitly between calls."
  };
}

function modernDiscoverResult(): Record<string, JsonValue> {
  return {
    resultType: "complete",
    supportedVersions: [...MCP_SUPPORTED_VERSIONS],
    capabilities: {
      tools: { listChanged: false }
    },
    _meta: {
      "io.modelcontextprotocol/serverInfo": MCP_SERVER_INFO
    },
    instructions: "Use math_capabilities first when command signatures are unknown. Create a document with math_create, make atomic typed edits with math_apply, then call math_validate, math_render, and math_simulate. State is addressed by explicit documentId/revision handles.",
    ttlMs: 3_600_000,
    cacheScope: "public"
  };
}

export function createMcpRequestHandler(runtime = new AgentMathRuntime()) {
  const toolNames = new Set(runtime.listTools().map(tool => tool.name));

  return async function handleMcpMessage(message: unknown): Promise<JsonRpcResponse | null> {
    let request: JsonRpcRequest;
    try {
      request = validateRequest(message);
    } catch (error) {
      const normalized = asMathEngineError(error, "MCP_INVALID_REQUEST");
      return failure(null, -32600, normalized.message, toJsonValue({ code: normalized.code, path: normalized.path }));
    }

    // Notifications never receive a response.
    if (request.id === undefined || request.id === null) {
      if (["notifications/initialized", "notifications/cancelled", "notifications/progress"].includes(request.method)) return null;
      return null;
    }

    try {
      if (request.method === "server/discover") return success(request.id, modernDiscoverResult());
      if (request.method === "initialize") return success(request.id, legacyInitializeResult(request));
      if (request.method === "ping") return success(request.id, isModern(request) ? { resultType: "complete" } : {});

      if (request.method === "tools/list") {
        const result: Record<string, JsonValue> = {
          tools: runtime.listTools().map(toolForMcp)
        };
        if (isModern(request)) {
          result.resultType = "complete";
          result.ttlMs = 300_000;
          result.cacheScope = "public";
        }
        return success(request.id, result);
      }

      if (request.method === "tools/call") {
        const name = request.params?.name;
        if (typeof name !== "string" || !toolNames.has(name)) {
          return failure(request.id, -32602, `Unknown tool: ${String(name)}`);
        }
        const args = request.params?.arguments ?? {};
        if (!isPlainObject(args)) return failure(request.id, -32602, "tools/call params.arguments must be an object.");
        const called = await runtime.callTool(name, args);
        const toolResult: Record<string, JsonValue> = {
          content: [{ type: "text", text: textResult(called) }],
          structuredContent: toJsonValue(called),
          isError: !called.ok
        };
        if (isModern(request)) toolResult.resultType = "complete";
        return success(request.id, toolResult);
      }

      return failure(request.id, -32601, `Method not found: ${request.method}`);
    } catch (error) {
      const normalized = asMathEngineError(error, "MCP_INTERNAL_ERROR");
      return failure(request.id, -32603, normalized.message, toJsonValue({
        code: normalized.code,
        path: normalized.path,
        retryable: normalized.retryable
      }));
    }
  };
}
