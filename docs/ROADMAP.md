# FamTutor Engine Roadmap

引擎级整体设计见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。数学领域细节见 [`packages/math/docs/ROADMAP.md`](../packages/math/docs/ROADMAP.md)。

## Product shape

FamTutor Engine grows by **domain packages**, not by collapsing every subject into one schema.

```text
famtutor-engine
├── packages/core     # planned — cross-domain runtime contracts
├── packages/math     # first domain (shipped v0.1.x)
├── packages/physics  # future
├── packages/chem     # future
└── …
```

## Near term (Engine v0.2)

优先顺序（不要颠倒）：

1. **发布基线（PR1）** — 固定 TypeScript/lockfile、CI、`npm ci && npm run verify` 全绿、math 可 `npm pack`。
2. **`@famtutor/core`（PR2）** — 跨科 `DomainRuntime` / ChangeSet / diagnostics / render 契约；math 实现之。
3. **Live MountedRenderer（PR3）** — 挂载后 `applyChangeSet` / `replaceDocument`，保留相机/stage/selection。
4. **Render Bundle（PR4）** — `famtutor.render.bundle.v1`，供 CathyGO 等宿主适配，不反向嵌入宿主协议。

完成上述基础后，再推进数学教学生产能力（label、SVG parity、Construction View 等）与新学科包。

## Domain backlog (not started)

| Domain | Notes |
|---|---|
| Physics | Forces, kinematics, circuits — separate document protocol |
| Science | Lab / inquiry scenes as needed |
| Computer Science | Algorithm / state-machine visualizations |
| Geography | Maps / spatial layers |
| Chemistry | Molecular / reaction diagrams |
| Biology | Systems / cell models |

Do not add GeoGebra-style feature parity for its own sake. Prefer Agent reliability: typed ops, validation, simulation, evidence, and live render updates.

## Non-goals (short term)

- Publishing a single `famtutor.engine.document.v1` that merges all subjects
- Replacing CathyGO `cgo.visual.scene.v1` in-place, or embedding CathyGO types in Engine core
- Full 3D / CAS / new domain packages before Engine v0.2 live runtime is solid
- Stacking more L0 math commands before the release baseline and live renderer land
