# Agent Tool API v1

FamTutor Engine 数学领域（`@famtutor/math-runtime`）的 Agent / MCP 工具面。CLI：`famtutor-math` / `famtutor-math-mcp`。

## 1. 工具面设计

本运行时只暴露 9 个稳定工具。数学能力通过 `math_apply.operations[].command` 扩展，避免 MCP 工具数量随命令目录线性增长。

| Tool | 作用 | 是否写入 |
|---|---|---:|
| `math_capabilities` | 查询协议、命令签名、renderer 和限制 | 否 |
| `math_create` | 创建完整文档或空骨架 | 是 |
| `math_apply` | 事务化构造、修改、删除、样式、交互和断言 | 是 |
| `math_inspect` | 查看实体值、producer、依赖和文档摘要 | 否 |
| `math_validate` | 全量验证和 assertion evidence | 否 |
| `math_render` | Direct SVG 预览 | 否 |
| `math_simulate` | 拖动/滑块仿真，可选提交最终状态 | 可选 |
| `math_export` | 导出 document、SVG 或 self-contained bundle 数据 | 否 |
| `math_evaluate` | 求安全表达式 | 否 |

发布的 JSON 定义位于：

```text
protocol/famtutor.math.agent-tools.v1.json
```

## 2. 推荐工作流

```text
1. math_capabilities(category / prefix)
2. math_create
3. math_apply(dryRun=true)
4. math_validate
5. math_apply(commit)
6. math_render
7. math_simulate
8. math_inspect(errors/dependencies)
9. math_apply(local repair)
```

不要让 Agent 每轮重发完整 JavaScript 或完整 MathDocument。优先使用小范围 typed patch。

## 3. `math_capabilities`

请求：

```json
{ "category": "point", "commandPrefix": "point.intersection" }
```

返回包含：

- runtime/protocol version；
- renderer；
- command input/output signature；
- required params；
- expression params；
- limits；
- 推荐 workflow。

## 4. `math_create`

创建骨架：

```json
{
  "documentId": "lesson-001",
  "title": "垂直平分线探索",
  "locale": "zh-CN",
  "purpose": "exploration",
  "boundingBox": [-6, 5, 6, -5]
}
```

也可以传完整 `document`。完整文档会在存储前做全量验证。

## 5. `math_apply`

### 事务属性

- `expectedRevision`：乐观锁；
- `idempotencyKey`：Agent/网络重试去重；
- `dryRun`：验证并返回预期 revision，但不保存；
- `operations`：最多 128 个，原子提交。

### 支持的 operation

```text
construct
expand_macro
set_params
set_entity
delete
add_assertion
remove_assertion
set_style
set_interaction
set_control
set_clock
set_view
undo
```

### 声明式 Control / Action 与确定性 Clock

`set_control` 添加或按 ID 替换一个按钮。按钮只允许执行受限、可审计的 `scalar.set`、`stage.set`、`clock.play`、`clock.pause`、`clock.reset` 或 `clock.step`，不接受 JavaScript：

```json
{
  "op": "set_control",
  "control": {
    "id": "play",
    "kind": "button",
    "label": "播放",
    "action": { "type": "clock.play", "target": "motionClock" }
  }
}
```

`set_clock` 将一个 `scalar.slider` 声明为逻辑时钟目标。每个 tick 恒定增加 `step`，`intervalMs` 只决定展示间隔，不参与数学状态计算：

```json
{
  "op": "set_clock",
  "clock": {
    "id": "motionClock",
    "target": "t",
    "start": 0,
    "end": 2,
    "step": 0.02,
    "intervalMs": 30,
    "loop": "none",
    "resetValue": 0
  }
}
```

宿主把 `document.controls` 渲染成合适的 UI，并向 MountedRenderer 派发 `control.invoke`。时钟状态位于 `MountedRendererState.metadata.clocks`；用户手动修改目标滑块时，对应时钟自动暂停。

### 构造

```json
{
  "op": "construct",
  "command": "line.perpendicular_through",
  "inputs": [{ "ref": "M" }, { "ref": "AB" }],
  "outputs": [{ "id": "bisector", "label": "l" }]
}
```

圆的组成量使用两个只读原子命令，不要让模型重新猜测圆心或用圆周长反推半径：

```json
{
  "op": "construct",
  "command": "point.circle_center",
  "inputs": [{ "ref": "circle" }],
  "outputs": [{ "id": "center", "role": "derived" }]
}
```

```json
{
  "op": "construct",
  "command": "measurement.circle_radius",
  "inputs": [{ "ref": "circle" }],
  "outputs": [{ "id": "radius", "role": "measurement" }]
}
```

两者都要求输入为 `circle2`；圆必须已经有效且半径为正。输出随上游圆确定性更新，不产生独立可拖动状态。

圆反演同样使用类型明确的原子命令：

```json
{
  "op": "construct",
  "command": "circle.invert_in_circle",
  "inputs": [{ "ref": "sourceCircle" }, { "ref": "inversionCircle" }],
  "outputs": [{ "id": "imageCircle", "role": "derived" }]
}
```

点使用 `point.invert_in_circle(point2, circle2) -> point2`。源圆经过反演中心时其像是直线，因此 `circle.invert_in_circle` 返回 `INVERSION_OUTPUT_NOT_CIRCLE`，模型不能把该退化分支继续声明为 `circle2`。

路径最近点继续使用 `point.projection(point2, path) -> point2`；`path` 可以是 line、segment、ray、circle、arc 或 polygon boundary。区域内部自由点不是最近点语义，不应由此命令替代。

### L1 宏展开

```json
{
  "op": "expand_macro",
  "macro": "macro.line.perpendicular_bisector",
  "inputs": { "A": "A", "B": "B" },
  "outputs": { "M": "M", "AB": "AB", "bisector": "bisector" }
}
```

宏不是 L0 command：运行时展开为若干 `construct` 等价节点，并写入 `provenance.sourceRefs`。可用宏列表见 `math_capabilities.macros`。

两圆严格分离并需要四条公切线时使用 `macro.line.common_tangents`，绑定 `circle1` 与 `circle2`；输出为 `external1`、`external2`、`internal1`、`internal2`。宏内部仅组合四个带 `side1` / `side2` 的 `line.common_tangent` L0 节点。

`outputs` 可以是 ID 字符串，也可以带 entity metadata：

```json
{ "id": "P", "label": "P", "role": "free", "visible": true }
```

### 修改参数

```json
{
  "op": "set_params",
  "nodeId": "op-f",
  "patch": { "expression": "a*cos(x)" },
  "remove": ["unused"]
}
```

### 删除

```json
{ "op": "delete", "targets": ["A"], "cascade": true }
```

未开启 cascade 且存在依赖时返回 `DELETE_HAS_DEPENDENTS`，不会留下 dangling references。

### dry-run

```json
{
  "documentId": "lesson-001",
  "expectedRevision": 4,
  "dryRun": true,
  "operations": [ ... ]
}
```

成功结果会显示预期 revision 5，但 store 仍停留在 revision 4。

## 6. `math_inspect`

```json
{
  "documentId": "lesson-001",
  "entityIds": ["P", "bisector"],
  "includeValues": true,
  "includeDependencies": true,
  "includeDocument": false
}
```

适合 Agent 局部 repair：先查看出错实体的 producer 和上下游，而不是重建整图。

## 7. `math_validate`

```json
{ "documentId": "lesson-001" }
```

返回：

- status；
- issues；
- assertionEvidence；
- undefinedEntities；
- graph order 和统计。

## 8. `math_render`

```json
{
  "documentId": "lesson-001",
  "viewId": "main",
  "width": 960,
  "height": 640,
  "stageId": "observe"
}
```

v0.1 的 Agent render 使用 Direct SVG，便于无浏览器环境生成确定性预览。

## 9. `math_simulate`

拖动：

```json
{
  "documentId": "lesson-001",
  "expectedRevision": 4,
  "action": {
    "type": "drag",
    "target": "P",
    "path": [[0, 1], [0, 2.5], [0, 4]],
    "samples": 16,
    "commit": false
  },
  "observe": [
    "distance(P,A)",
    "distance(P,B)",
    "assertion:equal-distance"
  ]
}
```

滑块：

```json
{
  "documentId": "function-demo",
  "action": {
    "type": "set_value",
    "target": "a",
    "value": 2.3,
    "samples": 10
  },
  "observe": ["entity:a", "expr:a*2"]
}
```

仿真返回每帧：

- progress/position；
- observations；
- assertions；
- issues；
- normalized event trace。

`commit=true` 时把最终状态写回对应 free point/slider construction params，并增加 revision。

## 10. `math_export`

支持输出 canonical document、Direct SVG 和协议数据。导出不改变 revision。

## 11. `math_evaluate`

```json
{
  "documentId": "lesson-001",
  "expression": "distance(P,A) - distance(P,B)"
}
```

只执行安全表达式 AST。

## 12. 错误模型

所有工具失败都返回：

```json
{
  "ok": false,
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Expected revision 3, but current revision is 4.",
    "path": null,
    "expected": 3,
    "actual": 4,
    "retryable": true,
    "details": null
  }
}
```

Agent 策略：

- `REVISION_CONFLICT`：inspect 最新 revision 后重新计算 patch；
- `TYPE_MISMATCH`：使用 suggested expected type 修复输入；
- `TRANSACTION_VALIDATION_FAILED`：读取 details.report，只修复错误节点；
- `DELETE_HAS_DEPENDENTS`：决定 cascade 或改为隐藏；
- `EXPRESSION_*`：重新生成白名单数学表达式；
- `DEGENERATE_*`：改变初始构型，而不是降低 tolerance。

失败响应现包含 `error.suggestedFixes[]`（`description` + 可选可执行 `operation`），供 Agent 自动 repair。`math_validate` 的 issues 也会附带 suggestedFixes。

## 13. MCP 结果

`tools/call` 同时提供：

- `structuredContent`：完整 JSON；
- `content[0].text`：兼容文本客户端；
- `isError`；
- modern protocol 下的 `resultType: "complete"`。
