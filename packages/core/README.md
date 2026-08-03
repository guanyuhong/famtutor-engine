# @famtutor/core

Cross-domain **runtime contracts** for FamTutor Engine.

This package defines JSON-safe wire types and the stateless `DomainRuntime` interface.
It does **not** contain mathematics, JSXGraph, DOM APIs, or CathyGO/host types.

## What it is

| Concept | Role |
|---|---|
| `DocumentRef` | Domain + schema + documentId + revision |
| `ChangeSet` | Transactional operation batch (`base.revision` is the optimistic lock) |
| `Diagnostic` / `ValidationReport` | Structured expected failures |
| `ApplyResult` | Success or structured failure from `apply` |
| `RenderArtifact` | One-shot SVG/PNG/JSON render result (**not** a host delivery bundle) |
| `DomainRuntime` | Stateless domain executor |
| `RuntimeRegistry` | Register/resolve runtimes by domain |

## State boundary

`DomainRuntime` is **pure/stateless**:

- no DocumentStore
- no persistence
- no undo history
- no idempotency cache
- `apply` must not mutate the input document

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

Live `MountedRenderer` / ChangeSet UI updates are **PR3**, not this package.

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
