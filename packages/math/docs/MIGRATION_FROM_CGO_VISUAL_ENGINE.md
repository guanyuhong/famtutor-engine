# Math 包迁移笔记：从 `cgo.visual.scene.v1`

> 本文档属于 FamTutor Engine 的 `packages/math` 迁移笔记，不是引擎级通用协议说明。

旧包 `@beanx/cathygo-visual-engine` 已具备很好的课程视觉运行时能力：SVG/JSXGraph 双后端、stage、attention、stable camera、标签测量、VisualHandle 和 provenance。本版本不是推翻旧包，而是把“通用数学语义”从视觉协议中拆出来。

## 1. 推荐目标

```text
famtutor.math.document.v1
        │
        │ compile / lower
        ▼
famtutor.visual.render-plan.v1
        │
        ├── JSXGraph
        └── SVG
```

旧 `cgo.visual.scene.v1` 可以在过渡期继续作为 render-plan/课程 asset，而不是继续扩成完整数学协议。

## 2. 字段映射

| 旧模型 | 新模型 |
|---|---|
| `backend: svg | jsxgraph` | 移到 `views[].renderer`，不再决定 canonical math semantics |
| `jsxgraph.elements[]` | `entities[] + construction[]` |
| element `kind` | typed `command` + typed output entity |
| movable IDs | `interactions[]` |
| stage reveal/hide | `activities[].stages[]` |
| visual profile validation | `assertions[]` + semantic validator |
| source hash/provenance | `provenance`；视觉 asset 可继续保留自己的 hash |
| SVG authored scene | 可作为 image/visual asset；不强行翻译成数学构造 |

## 3. 迁移策略

### A. 冻结旧协议

- 继续读取已有课程；
- 只修 bug；
- 不再向旧 schema 添加函数、CAS、3D 等通用数学语义。

### B. 新课程先产生 MathDocument

```text
Vision / Planner
    → MathDocument
    → validate / simulate
    → JSXGraph runtime or Direct SVG
```

### C. 兼容编译器

实现：

```text
MathDocument → cgo.visual.scene.v1
```

用于仍依赖旧 VisualHandle 的页面。第一阶段只覆盖双方共同支持的 2D 子集。

### D. 逐步迁移旧运行时能力

优先复用：

- stable camera；
- stage lifecycle；
- attention/highlight；
- label priority/layout report；
- resize/export/destroy；
- provenance 和课程 asset contract。

这些能力应位于 `@famtutor/visual-runtime`，Math Kernel 不依赖它们。

## 4. 不建议自动迁移的内容

- 仅凭 SVG path 猜测数学约束；
- 把视觉上“看似垂直/等长”翻译成 assertion；
- 将任意 JSXGraph JavaScript 当作可信 command；
- 把旧 backend-specific object ID 直接作为长期 MathDocument identity。

## 5. 最小适配接口

```ts
interface MathToVisualCompiler {
  compile(document: MathDocument, options?: {
    viewId?: string;
    stageId?: string;
  }): VisualSceneV1;
}
```

编译器必须输出 diagnostics：unsupported command、lost interaction、layout warning，而不是静默丢失语义。
