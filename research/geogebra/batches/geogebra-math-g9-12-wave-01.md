# GeoGebra Math 9–12 Wave 01

本批把 6 个 GeoGebra Math 9–12 函数类标题实现为可追溯、可交互、可验收的垂直素材。

| 素材 | Engine Case | 主要交互 | 数学证据 |
| --- | --- | --- | --- |
| 函数与函数记号 | RESEARCH 28 | 改变输入 `x` | `P=(x,f(x))` |
| 斜率和截距变化 | RESEARCH 21（升级） | 改变 `k,b,x` | 截距与图上点 |
| 非线性母函数变换 | RESEARCH 22（升级） | 改变 `a,t` | 对称点、开口与退化边界 |
| 指数函数的式、图像和关键特征 | RESEARCH 29 | 改变 `b,x` | `f(0)=1`、增长/衰减/常函数边界 |
| 二次函数作图 | RESEARCH 30 | 改变 `a,h,k,x` | 顶点、对称轴、截距和图上点 |
| 二次函数零点 | RESEARCH 31 | 改变 `r₁,r₂` | `f(r₁)=f(r₂)=0`、二根/重根 |

## 底层能力结论

素材构建暴露出一个通用缺口：`function1` 能绘制，但不能被其他构造按输入值求值，作者只能重复抄写函数表达式。本批新增最小 L0 原语：

```text
function.value_at(function1, scalar) -> scalar
```

它复用函数实体中已经声明的表达式、定义域和捕获参数；输入非有限数或超出定义域时返回确定诊断。六套素材均使用该原语，Direct SVG 和 JSXGraph 共享同一求值语义。

浏览器验收还暴露了既有样式语义的不完整实现：通用 `labelOffset` 对点、线等对象生效，却没有传给 JSXGraph 原生 scalar slider。渲染层现已补齐该映射，并用同一样式接口压缩多滑块标签；没有新增 Case 专属文本或 Gallery 分支。

本批不新增“指数关键点”“二次函数零点求解”或“动态数学富文本”等单题接口。关键点和零点由函数求值、点构造、布尔表达式与断言组合；通用数值特征提取和符号求解继续保留在 gap ledger，等待更多独立素材证明需求。

## 验收口径

- `sourceFidelity`：官方 Topic URL、原始标题、occurrence ID 与核验日期；
- `mathCorrectness`：运行时断言和参数 sweep；
- `visualQuality`：Direct SVG 与 Mounted JSXGraph 使用同一 MathDocument，并完成 330px 高 Gallery 卡片的浏览器视觉检查；
- `runtimeStatus`：validate、static render、MountedRenderer 浏览器门禁、stage switch 和 Render Bundle。

下游可以消费 `research/geogebra/math-g9-12/material-index.v1.json`，无需依赖 Gallery 或 CathyGO 专用协议。
