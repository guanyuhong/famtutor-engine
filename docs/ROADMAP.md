# FamTutor Engine Roadmap

## Product shape

FamTutor Engine grows by **domain packages**, not by collapsing every subject into one schema.

```text
famtutor-engine
├── packages/math      # first domain (shipped)
├── packages/physics  # future
├── packages/chem     # future
└── …
```

## Near term

1. Stabilize **math** as the reference domain: L0/L1, repair diagnostics, MCP, render adapters.
2. Document engine-wide conventions (revision, evidence, safe evaluation, agent tool surface).
3. Keep CathyGO / Classroom as **adapters** over math protocols — no forced VisualHandle embed.

## Domain backlog (not started)

| Domain | Notes |
|---|---|
| Physics | Forces, kinematics, circuits — separate document protocol |
| Science | Lab / inquiry scenes as needed |
| Computer Science | Algorithm / state-machine visualizations |
| Geography | Maps / spatial layers |
| Chemistry | Molecular / reaction diagrams |
| Biology | Systems / cell models |

Do not add GeoGebra-style feature parity for its own sake. Prefer Agent reliability: typed ops, validation, simulation, evidence.

## Non-goals (short term)

- Publishing a single `famtutor.engine.document.v1` that merges all subjects
- Replacing CathyGO `cgo.visual.scene.v1` in-place
- Full 3D / CAS before math teaching production is solid
