# @famtutor/core

Cross-domain **runtime contracts** for FamTutor Engine.

This package defines JSON-safe wire types and the stateless `DomainRuntime` interface,
plus the stateful `MountedRenderer` contract (implemented by domain packages).
It does **not** contain mathematics, JSXGraph, DOM APIs, or CathyGO/host types.

## What it is

| Concept | Role |
|---|---|
| `DocumentRef` | Domain + schema + documentId + revision |
| `ChangeSet` | Transactional operation batch (`base.revision` is the optimistic lock); optional `metadata` |
| `Diagnostic` / `ValidationReport` | Structured expected failures (`valid` \| `partial` \| `invalid`) |
| `ApplyResult` | Discriminated success (`document`+`next`) or failure (current `document`+diagnostics) |
| `RenderResult` / `RenderArtifact` | One-shot render outcome (**not** a host delivery bundle) |
| `DomainRuntime` | Stateless domain executor |
| `MountedRenderer` | Stateful live renderer contract (events, apply serialization, snapshots) |
| `RuntimeRegistry` | Register/resolve runtimes by domain; descriptors are defensively cloned |

## State boundary

`DomainRuntime` is **pure/stateless**:

- no DocumentStore
- no persistence
- no undo history
- no idempotency cache
- `apply` must not mutate the input document

`MountedRenderer` is **stateful** (camera/stage/selection, apply queue, bounded ChangeSet idempotency, events).
Domain packages implement it (for example `mountMathRenderer` in `@famtutor/math-runtime`).

Stateful Agent sessions (for example `AgentMathRuntime` + `DocumentStore`) wrap a domain runtime and own dry-run / commit / undo / idempotency.

## Install

```bash
npm install @famtutor/core
```

## Quick use

```ts
import { RuntimeRegistry, type DomainRuntime } from "@famtutor/core";

const registry = new RuntimeRegistry();
await registry.register(mathRuntime as DomainRuntime<unknown, unknown>);
const resolved = await registry.resolve("math");
```

## RenderArtifact vs RenderBundle

- **RenderArtifact** (this package): single render output for one document revision.
- **RenderBundle** (`famtutor.render.bundle.v1`, PR4): host delivery container with canonical document, assets, compatibility, and fallback SVG.

## Verify

From the monorepo root:

```bash
npm ci
npm run build -w @famtutor/core
npm run test -w @famtutor/core
npm run verify -w @famtutor/core
```

## License

MIT
