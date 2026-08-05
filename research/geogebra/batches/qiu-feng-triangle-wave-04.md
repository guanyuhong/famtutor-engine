# “秋风”Triangle Wave 04

本批选择 `w4v8ujek`（内角平分线定理）和 `dqareew5`（外角平分线定理），验证同一底层构造能否稳定表达内、外两个分支。

## 发现的真实缺口

仓库已有 `macro.ray.angle_bisector`，但旧展开链先作直线与圆的两个交点，再固定选择第一个交点。对一般三角形实测，Macro 与 `BC` 的交点落在约 `x=42.21`，构造的是外角平分线而非声明的内角平分线。交点顺序是代数实现细节，不能作为领域分支选择。

## 新增原子

```text
ray.angle_bisector(left, vertex, right, branch) -> ray2
```

- `branch` 必须是 `internal` 或 `external`。
- internal 使用两条单位角臂方向之和。
- external 使用 `vertex→left` 单位方向减去 `vertex→right` 单位方向；交换角臂会反转外角射线。
- 角臂退化或分支方向不可定义时明确失败。
- Direct SVG 与 JSXGraph 共享同一求值语义；JSXGraph 通过动态辅助点挂载原生射线。

原 Macro 保留为兼容入口，但现在只展开为 `branch=internal` 的新原子。

## 原创资产

| 资源 | 案例 | 核心断言 |
| --- | --- | --- |
| `w4v8ujek` | RESEARCH 12 | `∠BAD=∠DAC`；`AB/AC=BD/DC` |
| `dqareew5` | RESEARCH 13 | 外角两半相等；`AB/AC=DB/DC` |

下一步处理 `yvw2bav4`，复用同一原子与 `line.perpendicular_through`，验证角平分线与高的夹角规律。
