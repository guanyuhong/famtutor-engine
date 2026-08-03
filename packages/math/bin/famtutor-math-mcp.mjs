#!/usr/bin/env node
import readline from "node:readline";
import { AgentMathRuntime, createMcpRequestHandler } from "../dist/index.js";

const runtime = new AgentMathRuntime();
const handle = createMcpRequestHandler(runtime);
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  if (!line.trim()) continue;
  try {
    const message = JSON.parse(line);
    const response = await handle(message);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    const response = {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: "Parse error",
        data: String(error?.message ?? error)
      }
    };
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}
