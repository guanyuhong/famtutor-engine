# FamTutor Engine Architecture

本文档是 **引擎级** 整体设计。数学领域内部实现见 [`packages/math/docs/ARCHITECTURE.md`](../packages/math/docs/ARCHITECTURE.md)；路线图见 [`ROADMAP.md`](ROADMAP.md)。

## 1. 产品结论（v0.2 主线）

先把数学 P0 收敛成可发布、可实时更新、可被任意宿主接入的 **Engine v0.2**：

| PR | 状态 | 内容 |
|---|---|---|
| **PR1** 发布基线 | **完成** | TypeScript lockfile、CI、`npm ci && npm run verify`、math 可 pack |
| **PR2** `@famtutor/core` | **完成** | 跨科运行契约；math 实现 `DomainRuntime` |
| **PR3** Live renderer | **完成（本版）** | `MountedRenderer` + ChangeSet 画布更新（rebuild 策略） |
| **PR4** Render Bundle | 未开始 | `famtutor.render.bundle.v1` 宿主交付容器 |

不要在 PR4 完成前宣称 Render Bundle 已交付。

## 2. 目标架构

```text
Agent / Authoring UI / Demo ChangeSet
        │
        ▼
MountedRenderer（有状态：camera / stage / selection / events）
        │ apply / render
        ▼
DomainRuntime（无状态） + RuntimeRegistry
   ├── MathDomainRuntime
   ├── Physics Runtime（未来）
   └── Chemistry Runtime（未来）
        │
        ▼
Canonical Domain Document
        │
        ├── RenderArtifact（一次渲染 / snapshot）
        └── 未来：RenderBundle（PR4）
                │
                ▼
        Host Adapter（CathyGO 自建，不进 Engine）
```

## 3. 三层协议

### 3.1 领域协议（per domain）

例如 `famtutor.math.document.v1`。不做囊括全科的单一 document schema。

### 3.2 引擎运行协议（`@famtutor/core`）

| 概念 | 作用 |
|---|---|
| `DocumentRef` | domain + schema + documentId + revision |
| `ChangeSet` | 事务批；乐观锁是 `base.revision`；可选 `metadata` |
| `ApplyResult` | 成功：`document`+`next`；失败：当前 `document`+diagnostics，无 `next` |
| `ValidationReport` | `valid` \| `partial` \| `invalid`；severity 保留 error/warning/info |
| `RenderResult` | `{ok:true, artifact}` \| `{ok:false, diagnostics}` |
| `DomainRuntime` | **无状态**领域执行器 |
| `MountedRenderer` | **有状态**挂载渲染器契约 |
| `RuntimeRegistry` | 按 domain 注册/解析；descriptor 防御 clone |

状态边界：

- `DomainRuntime` / `applyMathChangeSet`：不持有 store、undo、idempotency；`apply` 不修改输入 document。
- `MountedRenderer`：持有 camera/stage/selection、apply 串行化、有界 ChangeSet 幂等、事件扇出。
- `AgentMathRuntime` + `DocumentStore`：会话态 adapter（dry-run / commit / undo）。

`core` 中不得出现数学实体、JSXGraph 或 CathyGO 类型。

### 3.3 宿主适配协议（host-owned）

CathyGO 自行实现 adapter。Engine 不嵌入 `cgo.visual.*`。

## 4. Live MountedRenderer（PR3）

Math 实现：`mountMathRenderer(host, document)` → `MathMountedRenderer`。

**第一版策略固定为 `rebuild`：**

1. 捕获 ephemeral 状态（bbox / stage / selection / viewId）
2. `domainRuntime.apply`（失败则画布与文档全不变）
3. staging board 挂载下一文档；成功则 swap，失败则保留 active
4. 恢复 ephemeral 状态；外部 renderer **对象 identity** 不变
5. **不**承诺 JSXGraph native object identity；canonical entity ID 稳定
6. camera/bbox **不写回** MathDocument

交互：`stage.set` / `selection.set` 为 ephemeral；`point.set` / `scalar.set` 经 `set_params` ChangeSet 提交。拖动中可只更新 native；`dragEnd` / `value.changed` 一次提交。

Snapshot：`direct-svg` / `jsxgraph-svg` 诚实 mediaType；`jsxgraph-canvas` → `UNSUPPORTED_SNAPSHOT`。

后续 dirty-set / native reconcile 属后续工作，不是本版承诺。

## 5. RenderArtifact vs RenderBundle

| | RenderArtifact（已有） | RenderBundle（PR4，未做） |
|---|---|---|
| 是什么 | 一次 SVG/PNG/JSON 渲染结果 | 宿主交付容器 |
| 用途 | validate/render API、预览、snapshot | Classroom/Studio 导入一整课互动件 |

## 6. 数学功能后续（在 PR4 之后）

label layout、SVG/JSXGraph parity、Construction View、Algebra Inspector、locus/CAS、3D。

## 7. 非目标（短期）

- 统一全科大 schema
- 反向塞入 CathyGO 协议
- 在 Render Bundle 前开物理/化学包或堆更多 L0 命令
- 宣称 native dirty reconciliation 或 Render Bundle 已交付
