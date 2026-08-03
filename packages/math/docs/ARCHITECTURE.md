# Architecture

本文档描述 **FamTutor Engine** 数学领域包（`@famtutor/math-runtime`）的内部架构。引擎壳与其它学科包见仓库根 README。

## 1. 设计目标

v0.1 的核心目标不是提供一个“可以画图的组件”，而是建立一条 Agent 可可靠操作的数学内容执行链：

```text
Intent → Typed Operations → Canonical Document → Validation
      → Evaluation → Rendering / Simulation → Evidence
```

四个不可破坏的架构约束：

1. **MathDocument 是唯一 canonical state。** JSXGraph 对象、SVG DOM 和 UI 状态都不是持久化事实。
2. **数学语义与渲染后端分离。** 同一个文档可以 headless 求值、Direct SVG 输出或 JSXGraph 交互执行。
3. **Agent 只提交 typed operations。** 不执行任意 JavaScript，也不要求模型维护后端对象生命周期。
4. **任何写入必须事务化。** 类型错误、循环依赖、退化构造或断言错误不会产生半完成状态。

## 2. 分层

```text
┌─────────────────────────────────────────────────────┐
│ Agent / CLI / MCP / Authoring UI                    │
├─────────────────────────────────────────────────────┤
│ Agent Runtime                                       │
│ 9 tools · revision · idempotency · dry-run · undo   │
├─────────────────────────────────────────────────────┤
│ MathDocument Protocol + Command Catalog             │
│ stable IDs · entities · construction · views        │
├─────────────────────────────────────────────────────┤
│ Semantic Validator                                  │
│ closed shape · type signatures · DAG · runtime      │
├─────────────────────────────────────────────────────┤
│ Math Kernel                                         │
│ safe AST · numeric geometry · assertions · simulate │
├──────────────────────────┬──────────────────────────┤
│ JSXGraph Adapter         │ Direct SVG Adapter       │
│ browser interaction      │ deterministic static     │
└──────────────────────────┴──────────────────────────┘
```

## 3. Entity 与 Construction Node 分离

`MathEntity` 描述稳定身份和外部语义：

```json
{ "id": "M", "type": "point2", "label": "M", "role": "derived" }
```

`ConstructionNode` 描述如何产生实体：

```json
{
  "id": "op-M",
  "command": "point.midpoint",
  "inputs": [{ "ref": "A" }, { "ref": "B" }],
  "outputs": ["M"]
}
```

分离带来的收益：

- 多输出命令可以自然表达；
- 构造协议可回放；
- 删除、undo、依赖追踪以 node 为单位；
- entity ID 不依赖 JSXGraph label；
- 未来可以做宏展开和 Construction View；
- Agent 可以只 patch 参数而不重建整份文档。

## 4. Construction DAG

`buildConstructionGraph()` 建立：

- `nodeById`；
- `producerByEntity`；
- `outputsByNode`；
- 直接/传递依赖；
- 确定性拓扑序。

Fail-closed 条件包括：

- duplicate entity/node ID；
- 一个实体有多个 producer；
- 输入引用不存在；
- 输出实体不存在；
- command 签名不匹配；
- 环依赖。

当前 evaluator 每次按拓扑序运行整图，支持对自由点和标量传入 override。v0.2 可以在不改变协议的情况下引入 dirty-set 增量求值。

## 5. Safe Expression

表达式路径：

```text
source → tokenizer → Pratt-style parser → AST → whitelist evaluator
```

允许：

```text
+ - * / ^
sin cos tan sqrt abs exp log min max ...
distance length radius x y angle dot norm slope area value
boolean comparison and logic
```

禁止：

```text
statement / semicolon
property access
array/object literal
arrow/function/new
DOM/global/network
prototype-chain callable lookup
```

带 `- . :` 的 entity ID 必须用 `@`：

```text
distance(@point-A, B)
```

## 6. Validation Pipeline

`validateMathDocument()` 的顺序：

```text
closed structural shape
  → ID and uniqueness
  → command existence and arity
  → input/output type checking
  → required params and expression parsing
  → graph construction
  → headless evaluation
  → assertion evidence
  → references in views/styles/interactions/activities
```

结果状态：

- `valid`：无 error，全部实体 defined；
- `partial`：只有 warning/info；
- `invalid`：结构、类型、DAG、运行时或 required assertion 出现 error。

错误是结构化对象：

```json
{
  "code": "TYPE_MISMATCH",
  "severity": "error",
  "path": "$.construction.op-x.inputs[1]",
  "message": "...",
  "expected": ["line2", "segment2", "ray2"],
  "actual": "point2",
  "retryable": true
}
```

## 7. Assertion Evidence

断言返回的不只是 boolean：

```json
{
  "assertionId": "equal-distance",
  "status": "passed",
  "method": "construction",
  "residual": 0,
  "tolerance": 1e-9,
  "dependencies": ["op-P", "op-bisector", "op-M", "op-AB"]
}
```

当前 proof matcher 已实现部分构造语义证明，特别是垂直平分线等距关系；所有断言仍会进行数值计算，避免“构造匹配但运行时退化”。

优先级：

```text
construction semantics > symbolic (future) > numeric > visual appearance (never proof)
```

## 8. Renderers

### MathMountedRenderer（PR3）

高层 API：`mountMathRenderer(host, document)`。

- `applyChangeSet` / `replaceDocument`：staging rebuild → swap；`strategy: "rebuild"`
- 保留外部 renderer 对象 identity；恢复 camera / stage / selection
- 交互 `point.set` / `scalar.set` 经 ChangeSet 提交；stage/selection 为 ephemeral
- snapshot：`direct-svg` / `jsxgraph-svg` 诚实 mediaType；canvas → `UNSUPPORTED_SNAPSHOT`
- **不**承诺 JSXGraph native object identity；dirty-set reconcile 属后续

### JSXGraph Adapter（低层）

`mountJsxGraph` 仍保留为低层 API。

负责：

- 将拓扑序 command 降低为 JSXGraph object；
- 建立 value resolver；
- 处理 drag / select / value changed；
- stage 显隐；
- 暴露 `setPoint`、`setScalar`、`getValue`；
- SVG DOM snapshot；
- renderer report 与 skipped entity。

不负责：

- canonical persistence；
- 判断数学命题真假；
- 执行 Agent 代码；
- 决定 document revision。

### Direct SVG Adapter

通过 headless evaluation 生成确定性 SVG。它适合：

- 服务端渲染；
- PDF/Word 素材；
- thumbnail；
- snapshot testing；
- 不含浏览器 DOM 的批处理。

JSXGraph SVG 是“当前交互画布快照”，Direct SVG 是“协议驱动的 canonical 静态输出”，两者用途不同。

## 9. Agent Runtime

DocumentStore 保存：

- 当前文档；
- bounded undo history；
- bounded idempotency cache。

`math_apply` 工作流：

```text
load current
  → replay idempotency hit
  → check expectedRevision
  → clone draft
  → apply all operations
  → revision + 1
  → full validation
  → atomic save or reject
```

Agent 重试时，同一 `idempotencyKey` 返回首次成功结果，即便客户端仍携带提交前 revision；这是避免网络重试被误判为 revision conflict 的关键行为。

## 10. MCP

MCP 层只负责协议适配，不包含数学逻辑：

```text
JSON-RPC line → MCP handler → AgentMathRuntime → structuredContent
```

支持：

- modern `server/discover`；
- modern `tools/list` / `tools/call` result type；
- legacy `initialize`；
- newline-delimited stdio transport；
- structuredContent + text fallback。

## 11. Extension Points

新增命令至少修改并测试：

1. `src/catalog/commands.ts`：签名和 capability；
2. `src/kernel/evaluate.ts`：headless semantics；
3. `src/render/jsxgraph.ts`：交互后端，或明确 computed-only；
4. `src/render/direct-svg.ts`：静态输出；
5. JSON Schema command enum；
6. command coverage fixture；
7. browser coverage。

新增 renderer 不应改变 MathDocument；只需消费 evaluation/render plan。
