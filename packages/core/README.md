# @famtutor/core

Cross-domain **runtime contracts** and **Render Bundle** for FamTutor Engine.

## What it is

| Concept | Role |
|---|---|
| `DocumentRef` / `ChangeSet` / `ApplyResult` | Transactional domain apply wire types |
| `RenderArtifact` / `RenderResult` | One-shot render outcome with **SHA-256** digest |
| `MountedRenderer` | Stateful live renderer contract |
| `RenderBundle` (`famtutor.render.bundle.v1`) | Host-neutral delivery JSON: document + requirements + fallback + integrity |
| `canonicalizeJson` / `sha256Utf8` / `sha256Bytes` | Deterministic JSON + real Web Crypto digests |
| `DomainRuntime` / `RuntimeRegistry` | Stateless executors |

## RenderArtifact vs RenderBundle

- **Artifact**: one SVG/PNG/JSON render for a revision.
- **Bundle**: portable package for hosts (CathyGO adapters). No runtime JS, no remote fetch, no dynamic import by `runtime.name`.

Digest rules: document = canonical JSON bytes; artifact/asset = decoded content bytes; bundle integrity = canonical JSON **excluding** the `integrity` field.

## Install

```bash
npm install @famtutor/core
```

Schema exports:

- `@famtutor/core/protocol/runtime-schema`
- `@famtutor/core/protocol/render-bundle-schema`

## License

MIT
