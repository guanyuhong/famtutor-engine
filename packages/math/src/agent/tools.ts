import type { AgentToolDefinition } from "../types.js";

const OBJECT_SCHEMA = { type: "object", additionalProperties: true } as const;

const TOOL_DEFINITIONS = [
  {
    name: "math_capabilities",
    title: "Inspect math runtime capabilities",
    description: "Return supported document schema, renderers, command signatures, limits, and recommended agent workflow.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
                category: { type: "string", enum: ["scalar", "point", "line", "circle", "polygon", "transform", "function", "annotation", "measurement", "conic"] },
        commandPrefix: { type: "string" }
      }
    }
  },
  {
    name: "math_create",
    title: "Create a math document",
    description: "Create and validate a complete MathDocument, or create an empty document skeleton for incremental construction.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        document: OBJECT_SCHEMA,
        documentId: { type: "string" },
        title: { type: "string" },
        locale: { type: "string", default: "zh-CN" },
        purpose: { type: "string", enum: ["exploration", "demonstration", "practice", "assessment", "authoring"] },
        boundingBox: {
          type: "array",
          minItems: 4,
          maxItems: 4,
          items: { type: "number" }
        },
        replace: { type: "boolean", default: false }
      }
    }
  },
  {
    name: "math_apply",
    title: "Apply a transactional patch",
    description: "Apply typed construction, L1 macro expansion, update, assertion, style, interaction, delete, or undo operations atomically with revision checks.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["documentId", "operations"],
      properties: {
        documentId: { type: "string" },
        expectedRevision: { type: "integer", minimum: 1 },
        idempotencyKey: { type: "string" },
        dryRun: { type: "boolean", default: false },
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 128,
          items: {
            type: "object",
            required: ["op"],
            properties: {
              op: {
                type: "string",
                enum: ["construct", "expand_macro", "set_params", "set_entity", "delete", "add_assertion", "remove_assertion", "set_style", "set_interaction", "set_view", "undo"]
              }
            },
            additionalProperties: true
          }
        }
      }
    }
  },
  {
    name: "math_inspect",
    title: "Inspect document semantics and runtime state",
    description: "Inspect selected entities, values, producers, dependencies, dependents, construction order, document summary, or the full document.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["documentId"],
      properties: {
        documentId: { type: "string" },
        entityIds: { type: "array", items: { type: "string" } },
        includeDocument: { type: "boolean" },
        includeValues: { type: "boolean", default: true },
        includeGraph: { type: "boolean", default: true }
      }
    }
  },
  {
    name: "math_validate",
    title: "Validate a math document",
    description: "Run closed-schema, type, command, construction DAG, numerical geometry, and assertion validation.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        documentId: { type: "string" },
        document: OBJECT_SCHEMA
      }
    }
  },
  {
    name: "math_render",
    title: "Render deterministic SVG",
    description: "Render a document to direct, deterministic SVG suitable for previews, PDFs, and server-side generation.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["documentId"],
      properties: {
        documentId: { type: "string" },
        viewId: { type: "string" },
        width: { type: "integer", minimum: 64, maximum: 4096, default: 960 },
        height: { type: "integer", minimum: 64, maximum: 4096, default: 640 },
        stageId: { type: "string" },
        includeSvg: { type: "boolean", default: true }
      }
    }
  },
  {
    name: "math_simulate",
    title: "Simulate interaction",
    description: "Simulate point dragging or scalar changes headlessly and return observations, assertions, events, and degeneracy issues at each frame.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["documentId", "action"],
      properties: {
        documentId: { type: "string" },
        expectedRevision: { type: "integer", minimum: 1 },
        action: {
          type: "object",
          required: ["type", "target"],
          properties: {
            type: { type: "string", enum: ["drag", "set_value"] },
            target: { type: "string" },
            path: { type: "array", items: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } } },
            value: { type: "number" },
            samples: { type: "integer", minimum: 2, maximum: 256 },
            commit: { type: "boolean" }
          },
          additionalProperties: false
        },
        observe: { type: "array", items: { type: "string" } }
      }
    }
  },
  {
    name: "math_export",
    title: "Export document or SVG",
    description: "Export canonical MathDocument JSON or deterministic SVG with a content hash.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["documentId", "format"],
      properties: {
        documentId: { type: "string" },
        format: { type: "string", enum: ["math-document", "svg"] },
        viewId: { type: "string" },
        width: { type: "integer", minimum: 64, maximum: 4096 },
        height: { type: "integer", minimum: 64, maximum: 4096 }
      }
    }
  },
  {
    name: "math_evaluate",
    title: "Evaluate a safe mathematical expression",
    description: "Evaluate the runtime's safe expression language against an optional document and local numeric variables; arbitrary JavaScript is never executed.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["expression"],
      properties: {
        expression: { type: "string" },
        documentId: { type: "string" },
        variables: { type: "object", additionalProperties: { type: "number" } }
      }
    }
  }
];

export const AGENT_TOOL_DEFINITIONS = Object.freeze(TOOL_DEFINITIONS) as unknown as readonly AgentToolDefinition[];

export function agentToolDefinitions(): AgentToolDefinition[] {
  return AGENT_TOOL_DEFINITIONS.map(definition => structuredClone(definition));
}
