# Changelog

## 0.2.0 — 2026-08-03

Contract completeness release:

- `ApplyResult` is a true discriminated union (`ApplySuccess` | `ApplyFailure`) with `next` on success
- `ValidationReport.status` includes `partial` alongside `valid` / `invalid`
- `RenderResult` wraps `RenderArtifact` as `{ ok, artifact | diagnostics }`
- MountedRenderer contracts: `RuntimeEvent`, `InteractionAction`, `MountedRendererState`, `RenderUpdateResult`
- `ChangeSet.metadata` optional; `RuntimeDescriptor.renderers[].modes` (`artifact` | `mounted` | `snapshot`)
- published JSON Schema `$defs` cover the full wire surface

## 0.1.0 — 2026-08-03

Initial release of FamTutor Engine cross-domain runtime contracts:

- `DocumentRef`, `ChangeSet`, `Diagnostic`, `ApplyResult`
- `RenderRequest` / `RenderArtifact` (not Render Bundle)
- `DomainRuntime` (stateless) and `RuntimeRegistry`
- published JSON Schema `famtutor.engine.runtime.v1`
