# FamTutor Engine Architecture

本文档是 **引擎级** 整体设计。数学领域内部实现见 [`packages/math/docs/ARCHITECTURE.md`](../packages/math/docs/ARCHITECTURE.md)；路线图见 [`ROADMAP.md`](ROADMAP.md)。

## 1. 产品结论（v0.2 主线）

下一步**不要**继续堆数学命令，也**不要**开始物理/化学包。

应先把现有数学 P0 收敛成真正可发布、可实时更新、可被任意宿主接入的 **Engine v0.2**：

- 可复现构建与 CI（发布基线）
- 跨学科稳定运行契约（`@famtutor/core`）
- 挂载后增量更新的 live renderer（ChangeSet）
- 宿主无关的 Render Bundle

架构方向：`MathDocument`（及未来各科 Domain Document）是 canonical state；CathyGO / Classroom 作为 **adapter** 消费 Engine，而不是把宿主协议反向塞进 Engine。

## 2. 目标架构

```text
Agent / Authoring UI
        │
        ▼
Engine Session / ChangeSet
        │
        ▼
Domain Runtime Registry
   ├── Math Runtime
   ├── Physics Runtime（未来）
   └── Chemistry Runtime（未来）
        │
        ▼
Canonical Domain Document
        │
        ▼
Render Plan / Render Artifact
   ├── SVG
   ├── JSXGraph
   └── 未来 Canvas/WebGL
        │
        ▼
Host Adapter
   ├── standalone demo
   └── CathyGO Classroom
```

## 3. 三层协议

### 3.1 领域协议（per domain）

例如 `famtutor.math.document.v1`；未来是 `famtutor.physics.document.v1` 等。

- 各科拥有独立 document schema、command/macro catalog、语义 validator。
- **不做**囊括全科的单一 `famtutor.engine.document.v1`。

### 3.2 引擎运行协议（cross-domain）

跨学科共享、与具体几何/物理原语无关的契约，计划落在 `@famtutor/core`：

| 概念 | 作用 |
|---|---|
| `DocumentRef` | 稳定文档身份 + revision |
| `ChangeSet` | 事务化操作批（含 expectedRevision / dry-run / idempotency） |
| `ApplyResult` | 新文档、revision、diagnostics |
| `Diagnostic` | 结构化错误与 suggestedFixes |
| `RuntimeEvent` | 拖动、选择、stage、断言等事件 |
| `RenderRequest` / `RenderArtifact` | 渲染请求与产物（SVG、bundle 等） |
| `RuntimeDescriptor` / capabilities | 运行时发现 |

目标接口形状：

```ts
interface DomainRuntime<TDocument, TOperation> {
  descriptor(): RuntimeDescriptor;
  capabilities(query?: CapabilityQuery): CapabilityResult;
  validate(document: TDocument): ValidationReport;
  apply(document: TDocument, changeSet: ChangeSet<TOperation>): ApplyResult<TDocument>;
  render(document: TDocument, request: RenderRequest): RenderArtifact;
  simulate?(document: TDocument, request: SimulationRequest): SimulationResult;
}
```

`core` 中**不得**出现 point、circle、JSXGraph 或 CathyGO 类型。

### 3.3 宿主适配协议（host-owned）

CathyGO 等宿主自行实现：

```text
RenderBundle / Domain Document → Host Widget / Classroom Session
```

Engine 不嵌入 `cgo.visual.*` 或 VisualHandle。迁移方向见 [MIGRATION_FROM_CGO_VISUAL_ENGINE.md](../packages/math/docs/MIGRATION_FROM_CGO_VISUAL_ENGINE.md)。

## 4. 当前最大缺口：实时挂载渲染

数学 P0 已能让 Agent「创建—修改—验证—渲染」，但还不是真正的实时绘制引擎。

现有 `JsxGraphRuntimeHandle`（见 `packages/math/src/render/jsxgraph.ts`）大致只能：

- 修改点 / slider
- 切换 stage
- 导出 SVG
- 销毁

缺少稳定的 `applyChangeSet` / `replaceDocument` / renderer reconciliation。结果是：Agent 每增加一个构造，宿主往往只能销毁并重新挂载画布，从而丢失相机、stage、selection、拖动中状态与 renderer 对象 identity。

目标挂载接口（PR3）：

```ts
interface MountedRenderer<TDocument, TOperation> {
  applyChangeSet(changeSet: ChangeSet<TOperation>): Promise<RenderUpdateResult>;
  replaceDocument(document: TDocument): Promise<RenderUpdateResult>;
  dispatch(action: InteractionAction): Promise<void>;
  snapshot(): RenderArtifact;
  subscribe(listener: (event: RuntimeEvent) => void): () => void;
  destroy(): void;
}
```

首版允许内部整树重建，但必须保证：外部 handle 不变、camera/stage/selection 尽量保留、增删改后画布实时更新、revision 冲突结构化、用户拖动可转为可提交 operation。其后再优化 dirty-set 与对象级 reconciliation。

## 5. v0.2 四个 PR

| PR | 目标 | 内容 |
|---|---|---|
| **PR1** 发布基线 | 可复现、可验证、可打包 | 固定 TypeScript + lockfile、修通 `npm run verify`、CI Node 20/22、版本/文档对齐、math 包可 `npm pack` |
| **PR2** `@famtutor/core` | 跨科运行契约 | `DomainRuntime` 与上表类型；math 实现该接口；core 无领域/宿主类型 |
| **PR3** Live renderer | Agent 实时绘制 | `MountedRenderer` + ChangeSet 增量更新；保留挂载态 |
| **PR4** Render Bundle | 宿主无关交付物 | `famtutor.render.bundle.v1`：domain/schema/compat、canonical document、entry view、capabilities、assets、integrity、fallback SVG、diagnostics |

## 6. 数学功能后续（在引擎基础之后）

1. label layout / priority  
2. Direct SVG 与 JSXGraph parity  
3. Construction View  
4. Algebra Inspector  
5. locus、implicit curve、inequality region  
6. CAS adapter  
7. 3D  

在 PR1–4 完成前，不新开物理/化学包，避免在未稳定的运行接口上复制多套实现。

## 7. 非目标（短期）

- 发布合并全科的单一 document schema
- 用 CathyGO `cgo.visual.scene.v1` 替换或反向驱动 Engine
- 为 GeoGebra 功能对等而堆 L0 命令
- 在 live runtime 稳定前做完整 3D / CAS / 新学科包
