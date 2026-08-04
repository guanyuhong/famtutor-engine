# MathDocument Protocol v1

FamTutor Engine 数学领域的 canonical 协议（`famtutor.math.document.v1`）。其它学科将使用各自的 `famtutor.<domain>.document.v1`，不合并进本 schema。

## 1. 顶层结构

```json
{
  "schema": "famtutor.math.document.v1",
  "documentId": "example",
  "revision": 1,
  "seed": 42,
  "metadata": {},
  "entities": [],
  "construction": [],
  "views": [],
  "styles": [],
  "interactions": [],
  "assertions": [],
  "activities": [],
  "provenance": {}
}
```

完整 JSON Schema：

```text
protocol/famtutor.math.document.v1.schema.json
```

## 2. Stable ID

ID 规则：

```regex
^[A-Za-z][A-Za-z0-9._:-]*$
```

ID 是协议 identity，不等于图上的 label。重命名 label 不应改变依赖。

表达式中只含字母、数字、下划线的 ID 可以直接引用；带 `- . :` 的 ID 使用 `@`：

```text
x(A)
distance(@point-A, @point-B)
```

## 3. Entity Types

v0.1：

```text
scalar angle boolean vector2 point2 line2 segment2 ray2 interval1
circle2 polygon2 function1 curve2 text
```

Role：

```text
free derived auxiliary measurement annotation
```

Role 用于交互默认、样式 token 和作者语义，不替代 command 类型系统。

## 4. Construction

每个实体必须恰好由一个 construction node 产生。

```json
{
  "id": "op-circle",
  "command": "circle.center_radius",
  "inputs": [{ "ref": "O" }, { "ref": "r" }],
  "params": {},
  "outputs": ["c"]
}
```

输入可以是 entity ref 或 JSON literal；v0.1 command catalog 主要使用 ref，数值配置优先放 params。

渲染标记也遵循实体组合。例如直角标记不重复接收三个点，而是消费已经定义的 `angle`：

```json
{
  "id": "op-right-angle",
  "command": "marker.right_angle",
  "inputs": [{ "ref": "angleADC" }],
  "params": { "size": 0.36 },
  "outputs": ["rightAngleD"]
}
```

`size` 是正数，单位与当前文档坐标一致；输入角不是 90° 时以 `NOT_RIGHT_ANGLE` 失败，不生成误导性的标记。

平行标记同样消费已有实体，不重复定义直线：

```json
{
  "command": "marker.parallel_chevron",
  "inputs": [{ "ref": "markerAnchor" }, { "ref": "lineAB" }],
  "params": { "size": 0.45 },
  "outputs": ["parallelArm1", "parallelArm2"]
}
```

锚点只决定记号位置，线性对象提供方向；返回的两个 `segment2` 是一个开放箭形的两条短臂。接口会规范化线段端点方向，反转端点不会翻转记号。双箭形必须由两个不同锚点的调用组合。

## 5. Views

v0.1 协议定义：

- `graphics2d`；
- `construction`；
- `algebra`。

真正实现渲染的是 `graphics2d`。另外两个 view 是为后续多视图联动预留的 canonical 声明。

```json
{
  "id": "main",
  "kind": "graphics2d",
  "visible": true,
  "renderer": "jsxgraph-svg",
  "boundingBox": [-6, 5, 6, -5],
  "background": "#FFFEE8",
  "axes": false,
  "grid": false,
  "keepAspectRatio": true,
  "cameraPolicy": "stable_across_stages"
}
```

## 6. Styles

样式绑定通过 entity IDs，不进入数学构造：

```json
{
  "targets": ["A", "B", "AB"],
  "style": {
    "token": "primary",
    "strokeWidth": 3,
    "labelVisible": true,
    "labelPlacement": "top-right",
    "labelOffset": [2, -1],
    "lineLabelPosition": 0.5,
    "lineLabelSide": "left",
    "lineLabelDistance": 1.6
  }
}
```

Token：`primary`、`accent`、`auxiliary`、`danger`、`muted`、`success`。

`graphics2d.background` 定义静态与挂载渲染器共用的画布底色。
`labelPlacement` 可为 `auto` 或八个语义方位。`auto` 在点、关系标记、角文本、线段、其他标签和画布边界之间进行确定性避让。`labelOffset` 为 `[dx, dy]` CSS 像素，从选定锚点继续微调，不改变实体坐标。

线段、直线和射线标签使用 JSXGraph 原生路径标签语义：`lineLabelPosition` 是从第一点到第二点的路径比例（`0..1`），`lineLabelSide` 是有向路径的 `left`/`right`，`lineLabelDistance` 是相对文本框高度的法向间距。默认值分别为 `0.5`、`left`、`1.6`，对应 JSXGraph `position: "0.5fr left"`。Direct SVG 使用相同布局语义。

角的弧线与文字位置由 `angle.three_points` 的可选参数分别控制：

```json
{
  "id": "op-angle",
  "command": "angle.three_points",
  "inputs": [{ "ref": "B" }, { "ref": "A" }, { "ref": "C" }],
  "params": { "radius": 0.72, "labelRadius": 1.18 },
  "outputs": ["angleBAC"]
}
```

两者单位均为文档坐标；`radius` 控制角弧，`labelRadius` 控制标签中心沿角平分线的位置。未提供 `labelRadius` 时，渲染器根据字体和角度自动估算安全位置。

## 7. Interactions

```json
{
  "target": "P",
  "permissions": ["select", "drag"],
  "dragMode": "along_path",
  "dragTarget": "bisector"
}
```

运行时和仿真都会检查权限。`role: free` 不自动绕过显式 interaction policy。

## 8. Assertions

```json
{
  "id": "equal-distance",
  "predicate": "expression_equal",
  "arguments": [
    { "expr": "distance(P,A)" },
    { "expr": "distance(P,B)" }
  ],
  "expected": true,
  "tolerance": 1e-9,
  "requiredMethod": "construction",
  "severity": "error"
}
```

Predicate：

```text
expression_equal point_on collinear parallel perpendicular
coincident equal_length equal_angle value_in_range
```

## 9. Activities

Activities 不改变数学真值，只描述教学运行：

```json
{
  "id": "explore",
  "title": "拖动并发现",
  "stages": [
    {
      "id": "observe",
      "narration": "拖动 P 观察距离",
      "reveal": ["A", "B", "P"],
      "focus": ["P"]
    }
  ],
  "tasks": [
    {
      "id": "drag-p",
      "prompt": "至少拖动三个位置",
      "allowedTools": ["interaction.drag"],
      "evidence": [
        { "kind": "event", "ref": "P" },
        { "kind": "assertion", "ref": "equal-distance" }
      ]
    }
  ]
}
```

## 10. Versioning

- `schema` 负责协议主版本；
- `revision` 负责同一 document 的并发写入版本；
- runtime package version 不等于 document revision；
- 新字段默认应向后兼容；
- 删除/改变语义需要新 schema 版本和迁移器。
