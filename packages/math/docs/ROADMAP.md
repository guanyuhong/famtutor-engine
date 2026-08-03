# Math Domain Roadmap

本文档是 **FamTutor Engine** 数学包（`packages/math` / `@famtutor/math-runtime`）的领域路线图。引擎级多学科规划见仓库根 [`docs/ROADMAP.md`](../../../docs/ROADMAP.md)。

## v0.1 — Agent-native 2D P0（本版本）

- MathDocument v1；
- 31 个核心命令；
- safe expression；
- DAG、numeric kernel、assertion、simulation；
- JSXGraph + Direct SVG；
- 9 Agent tools + MCP；
- CLI、demo、完整 smoke tests。

## v0.2 — 教学生产可用性

优先：

- ~~arc、sector、ellipse、parabola、hyperbola~~（已下沉为 L0：`arc2`/`sector2`/`conic2`）
- ~~transformation object~~（已下沉为 L0：`transform2` + `transform.apply`）
- tangent、angle bisector、perpendicular bisector **macro（L1，不进 L0）** — 见 `src/catalog/macros.ts`
- Direct SVG 与 JSXGraph 视觉 parity；
- label layout/priority 接入旧 visual engine 能力；
- Construction View；
- Algebra Inspector；
- server-side render worker；
- document migration framework；
- Agent repair diagnostics 和 suggested operations。

### L0 vs L1 边界

- **L0**：kernel 原子（含 arc/sector/conic/transform2、area/perimeter、vector.components/polar）。
- **L1 宏**：中垂线、角平分、三角形四心、圆切线 — 只做展开配方，不注册为 command enum。

## v0.3 — 函数与 CAS

- implicit curves；
- inequalities and regions；
- derivative、integral、Riemann sum；
- vector/slope fields；
- locus sampling；
- SymPy adapter；
- symbolic equivalence；
- exact rational/algebraic values；
- Table View。

## v0.4 — Authoring Studio 与 3D

- 左侧 Agent conversation + 中间 Math Canvas + 右侧 property/evidence；
- constrained tool palette；
- construction timeline；
- macro/custom tool；
- JSXGraph 3D P0；
- 复杂 3D 的独立 WebGL adapter；
- collaborative review and versioning。

## 非目标

短期不做 GeoGebra 社区、完整 Spreadsheet、通用白板或 `.ggb` 100% 兼容。产品壁垒应放在 Agent 编译、数学验证、互动证据和课程生产，而不是复制所有桌面创作功能。
