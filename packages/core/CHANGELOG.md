# Changelog

## Unreleased — internal

- Add the optional, domain-neutral `TextbookCase` type and published `famtutor.case.v1` JSON Schema for offline corpus tooling.

## 0.3.0 — 2026-08-03

Render Bundle delivery contract:

- `famtutor.render.bundle.v1` wire format with canonical document, assets, entrypoint, requirements, fallback SVG, and integrity hash
- `createRenderBundle`, `validateRenderBundle`, `verifyRenderBundleIntegrity`, `checkRenderBundleCompatibility`, and `serializeRenderBundle`
- SHA-256 digests via `canonicalizeJson` / `sha256Content`; published JSON Schema and `./protocol/render-bundle-schema` export
- Default bundle size limits and fail-closed rejection of executable or unsafe SVG payloads

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
