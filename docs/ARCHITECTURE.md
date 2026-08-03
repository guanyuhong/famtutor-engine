# FamTutor Engine Architecture

本文档是 **引擎级** 整体设计。数学领域内部实现见 [`packages/math/docs/ARCHITECTURE.md`](../packages/math/docs/ARCHITECTURE.md)；路线图见 [`ROADMAP.md`](ROADMAP.md)。

## 1. 产品结论（v0.2 主线）

先把数学 P0 收敛成可发布、可实时更新、可被任意宿主接入的 **Engine v0.2**：

| PR | 状态 | 内容 |
|---|---|---|
| **PR1** 发布基线 | **完成** | TypeScript lockfile、CI、`npm ci && npm run verify`、math 可 pack |
| **PR2** `@famtutor/core` | **完成（本版）** | 跨科运行契约；math 实现 `DomainRuntime` |
| **PR3** Live renderer | 未开始 | `MountedRenderer` + ChangeSet 画布增量更新 |
| **PR4** Render Bundle | 未开始 | `famtutor.render.bundle.v1` 宿主交付容器 |

不要在 PR3/PR4 完成前宣称 live 渲染或 Render Bundle 已交付。

## 2. 目标架构

```text
Agent / Authoring UI
        │
        ▼
Engine Session / ChangeSet   ← AgentMathRuntime + DocumentStore（有状态）
        │
        ▼
Domain Runtime Registry
   ├── MathDomainRuntime     ← 无状态 DomainRuntime
   ├── Physics Runtime（未来）
   └── Chemistry Runtime（未来）
        │
        ▼
Canonical Domain Document
        │
        ▼
RenderArtifact（一次渲染结果）
   └── 未来：RenderBundle（PR4 宿主交付）
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
| `ChangeSet` | 事务批；乐观锁是 `base.revision`；**无** dryRun |
| `ApplyResult` | 成功文档或结构化失败 diagnostics |
| `Diagnostic` | 结构化错误与 suggestedFixes |
| `RenderRequest` / `RenderArtifact` | 一次渲染请求与结果 |
| `DomainRuntime` | **无状态**领域执行器 |
| `RuntimeRegistry` | 按 domain 注册/解析 |

```ts
interface DomainRuntime<TDocument, TOperation> {
  descriptor(): Promise<RuntimeDescriptor>;
  capabilities(query?: CapabilityQuery): Promise<CapabilityResult>;
  validate(document: TDocument): Promise<ValidationReport>;
  apply(document: TDocument, changeSet: ChangeSet<TOperation>): Promise<ApplyResult<TDocument, TOperation>>;
  render(document: TDocument, request: RenderRequest): Promise<RenderArtifact>;
}
```

状态边界：

- `DomainRuntime` / `applyMathChangeSet`：不持有 store、undo、idempotency；`apply` 不修改输入 document。
- `AgentMathRuntime` + `DocumentStore`：stateful adapter，负责 dry-run / commit / undo / idempotency。

`core` 中不得出现数学实体、JSXGraph 或 CathyGO 类型。

### 3.3 宿主适配协议（host-owned）

CathyGO 自行实现 adapter。Engine 不嵌入 `cgo.visual.*`。

## 4. RenderArtifact vs RenderBundle

| | RenderArtifact（PR2，已有） | RenderBundle（PR4，未做） |
|---|---|---|
| 是什么 | 一次 SVG/PNG/JSON 渲染结果 | 宿主交付容器 |
| 含什么 | document ref、renderer、mediaType、encoding、content、digest、diagnostics | canonical document + assets + compatibility + fallback + integrity |
| 用途 | validate/render API、预览、评测证据 | Classroom/Studio 导入一整课互动件 |

## 5. 当前最大缺口（仍属 PR3）

`JsxGraphRuntimeHandle` 仍无稳定的 `applyChangeSet` / `replaceDocument`。Agent 增改构造时宿主可能只能销毁重建画布。PR2 只提供领域侧 ChangeSet 契约与无状态 apply，**不**完成挂载态 live 更新。

## 6. 数学功能后续（在 PR3/PR4 之后）

label layout、SVG/JSXGraph parity、Construction View、Algebra Inspector、locus/CAS、3D。

## 7. 非目标（短期）

- 统一全科大 schema
- 反向塞入 CathyGO 协议
- 在 live runtime 前开物理/化学包或堆更多 L0 命令
