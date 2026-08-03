# FamTutor Engine

An agent-native engine for building, simulating, rendering, and assessing interactive learning experiences.

面向 Agent 原生的教学内容构建、模拟、渲染与评测引擎。

## Docs

- [Architecture](docs/ARCHITECTURE.md) — engine-level design, three protocol layers, v0.2 PR sequence
- [Roadmap](docs/ROADMAP.md) — near-term Engine v0.2 priorities and domain backlog
- [Math package](packages/math/README.md) — `@famtutor/math-runtime` details

## Positioning

FamTutor Engine is the **domain runtime layer** for interactive learning. Host apps (for example CathyGO Classroom) adapt to Engine protocols — Engine does not need to drop into any specific visual host API.

```text
Intent / Author / Agent
          │
          ▼
   Domain Document (typed, versioned)
          │
          ▼
 Validate · Simulate · Repair · Evidence
          │
     ┌────┴────┐
     ▼         ▼
  Render    Assess
```

## Domains

| Domain | Status | Package |
|---|---|---|
| Mathematics | **Shipped (v0.1)** | [`packages/math`](packages/math) — `@famtutor/math-runtime` |
| Physics | Planned | — |
| Science (general) | Planned | — |
| Computer Science | Planned | — |
| Geography | Planned | — |
| Chemistry | Planned | — |
| Biology | Planned | — |

Each domain owns its document protocol, command/macro catalog, and agent tools. Shared engine conventions (revision, transactions, safe evaluation, evidence) stay consistent across domains.

## Quick start (Math)

From the repo root (workspaces). TypeScript is pinned via `package-lock.json` — prefer `npm ci`:

```bash
npm ci
npm run build
npm test
# full gate (schema, browser, MCP, CLI, pack):
npm run verify
```

Interactive demo:

```bash
cd packages/math
python3 -m http.server 8765
# open http://127.0.0.1:8765/demo/
```

Math CLI / MCP:

```bash
node ./packages/math/bin/famtutor-math.mjs capabilities
node ./packages/math/bin/famtutor-math-mcp.mjs
```

## Math domain (current)

`@famtutor/math-runtime` is the first vertical slice:

- Canonical protocol `famtutor.math.document.v1`
- L0 command catalog + L1 macro expansion (`expand_macro`)
- Safe expression AST (no arbitrary JavaScript)
- Headless evaluate / assert / simulate
- JSXGraph interactive render + Direct SVG
- 9 Agent tools + MCP stdio
- Repair diagnostics (`suggestedFixes`)

Details: [packages/math/README.md](packages/math/README.md) · [packages/math/docs/AGENT_API.md](packages/math/docs/AGENT_API.md)

## Design principles

1. **Domain documents are canonical** — renderers and UI state are not the source of truth.
2. **Agents submit typed operations** — no eval of model-generated JavaScript.
3. **Writes are transactional** — revision locks, dry-run, idempotency, structured errors.
4. **Hosts adapt to Engine** — Classroom / Studio lower Engine documents into their visual contracts.

## License

MIT — see [LICENSE](LICENSE).
