# FamTutor Engine

An agent-native engine for building, simulating, rendering, and assessing interactive learning experiences.

面向 Agent 原生的教学内容构建、模拟、渲染与评测引擎。

## Docs

- [Architecture](docs/ARCHITECTURE.md) — engine-level design, three protocol layers, v0.2 PR sequence
- [Roadmap](docs/ROADMAP.md) — near-term Engine v0.2 priorities and domain backlog
- [Core package](packages/core/README.md) — `@famtutor/core` runtime contracts
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
| Core contracts | **Shipped (v0.2.0)** | [`packages/core`](packages/core) — `@famtutor/core` |
| Mathematics | **Shipped (v0.2.0)** | [`packages/math`](packages/math) — `@famtutor/math-runtime` |
| Physics | Planned | — |
| Science (general) | Planned | — |
| Computer Science | Planned | — |
| Geography | Planned | — |
| Chemistry | Planned | — |
| Biology | Planned | — |

Each domain owns its document protocol, command/macro catalog, and agent tools. Shared engine conventions live in `@famtutor/core` (`DomainRuntime`, `ChangeSet`, diagnostics, `RenderArtifact`).

## Quick start

TypeScript is pinned via `package-lock.json`. Prefer `npm ci` for Node packages:

```bash
npm ci
npm run build
npm test
```

`npm ci` / `npm test` cover Node unit tests for **core then math**. They do **not** install Python Playwright/Chromium.

### Full verify (including browser + pack)

1. Create a venv and install pinned smoke deps:

```bash
python3 -m venv .venv-smoke
.venv-smoke/bin/pip install -r requirements-smoke.txt
.venv-smoke/bin/python -m playwright install chromium
export PLAYWRIGHT_PYTHON="$PWD/.venv-smoke/bin/python"
```

2. Run the full gate:

```bash
npm ci
npm run verify
```

`npm run verify` builds/tests **core then math**, including schema smoke, Chromium+JSXGraph browser smoke, MCP, CLI, and clean-source consumer pack smoke.

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

`@famtutor/math-runtime` implements `@famtutor/core` `DomainRuntime`:

- Canonical protocol `famtutor.math.document.v1`
- Stateless `MathDomainRuntime` + `applyMathChangeSet`
- Stateful `AgentMathRuntime` / `DocumentStore` adapter (dry-run, undo, idempotency)
- L0 command catalog + L1 macro expansion (`expand_macro`)
- Safe expression AST (no arbitrary JavaScript)
- Headless evaluate / assert / simulate
- JSXGraph interactive render + Direct SVG → `RenderResult` / `RenderArtifact`
- **`mountMathRenderer` live MountedRenderer**（首版 **rebuild**；外部 handle 与 entity ID 稳定，不承诺 native object identity）
- 9 Agent tools + MCP stdio
- Repair diagnostics (`suggestedFixes`)

Render Bundle 仍是 **PR4**（未交付）。

Details: [packages/math/README.md](packages/math/README.md) · [packages/core/README.md](packages/core/README.md) · [packages/math/docs/AGENT_API.md](packages/math/docs/AGENT_API.md)

## Design principles

1. **Domain documents are canonical** — renderers and UI state are not the source of truth.
2. **Agents submit typed operations** — no eval of model-generated JavaScript.
3. **Writes are transactional** — revision locks, dry-run, idempotency, structured errors.
4. **Hosts adapt to Engine** — Classroom / Studio lower Engine documents into their visual contracts.

## License

MIT — see [LICENSE](LICENSE).
