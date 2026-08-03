# FamTutor Engine Roadmap

引擎级整体设计见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。数学领域细节见 [`packages/math/docs/ROADMAP.md`](../packages/math/docs/ROADMAP.md)。

## Product shape

```text
famtutor-engine
├── packages/core     # shipped v0.2.0 — cross-domain runtime contracts
├── packages/math     # shipped v0.2.0 — first domain + live MountedRenderer
├── packages/physics  # future
├── packages/chem     # future
└── …
```

## Near term (Engine v0.2)

| Step | Status |
|---|---|
| **PR1** 发布基线 | **Done** |
| **PR2** `@famtutor/core` + math `DomainRuntime` | **Done** |
| **PR3** Live `MountedRenderer`（rebuild） | **Done** |
| **PR4** `famtutor.render.bundle.v1` | Next |

完成 PR4 后，再推进数学教学生产能力与新学科包。

## Domain backlog (not started)

| Domain | Notes |
|---|---|
| Physics | Forces, kinematics, circuits — separate document protocol |
| Science | Lab / inquiry scenes as needed |
| Computer Science | Algorithm / state-machine visualizations |
| Geography | Maps / spatial layers |
| Chemistry | Molecular / reaction diagrams |
| Biology | Systems / cell models |

## Non-goals (short term)

- Publishing a single `famtutor.engine.document.v1` that merges all subjects
- Replacing CathyGO `cgo.visual.scene.v1` in-place, or embedding CathyGO types in Engine core
- Full 3D / CAS / new domain packages before Render Bundle (PR4) is solid
- Claiming dirty-set native reconciliation or Render Bundle before those land
