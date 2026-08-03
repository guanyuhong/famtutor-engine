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
scalar angle boolean vector2 point2 line2 segment2 ray2
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
    "labelVisible": true
  }
}
```

Token：`primary`、`accent`、`auxiliary`、`danger`、`muted`、`success`。

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
