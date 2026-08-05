# FamTutor Math Runtime

`@famtutor/math-runtime` 是 **[FamTutor Engine](../../README.md)** 的数学领域运行时（首个垂直切片）。它以 JSXGraph 作为浏览器交互底座，但把数学文档、构造依赖、验证、仿真、Agent 接口和静态输出掌握在自己的协议与内核中。

仓库形态为 Engine monorepo：本包位于 `packages/math`；多学科总览与路线图见仓库根目录。

核心链路：

```text
Agent / Author / Importer
          │
          ▼
   MathDocument v1
          │
          ▼
 Construction DAG + Safe Expression + Math Kernel
          │
     ┌────┴───────────┐
     ▼                ▼
JSXGraph Runtime   Direct SVG
interactive        deterministic / SSR
     │
     ▼
Events · Assertions · Simulation · Evidence
```

本版本是可运行、可测试、可通过 MCP 调用的 P0，而不是 GeoGebra 全量复刻。它优先解决 Agent 自动构建数学场景时最关键的可靠性问题：**类型、依赖、事务、可检查、可修复、可仿真、禁止执行任意 JavaScript**。

## 已实现能力

| 模块 | v0.2.0 能力 |
|---|---|
| Core contracts | `@famtutor/core@0.2.0`：`ApplyResult` union、`RenderResult`、`MountedRenderer` 契约 |
| Domain apply | 确定性 `applyMathChangeSet`；Agent 必须委托 `domainRuntime.apply` |
| Live renderer | **`mountMathRenderer`**：rebuild+staging、状态保留、交互 ChangeSet、诚实 snapshot |
| Canonical protocol | `famtutor.math.document.v1`（不变）+ operations schema |
| 数学命令 | **58** 个二维/通用 L0 命令 + **10** 个 L1 宏（`expand_macro`）；完整列表见 `capabilities` |
| Construction DAG | 拓扑排序、循环检测、单一 producer、依赖追踪、级联删除 |
| 安全表达式 | AST parser/evaluator；支持数学函数、几何测量、`@entity-id`；无 `eval` / `new Function` |
| Headless kernel | 数值几何、退化检测、运行时类型检查、增量 override 求值 |
| Assertions | 构造语义证明 + 数值残差；支持等距、点在线上、共线、平行、垂直、等长、等角等 |
| Simulation | 点拖动、滑块变化、插值采样、事件轨迹、观察值、断言证据、最终状态提交 |
| Interactive renderer | JSXGraph 低层 `mountJsxGraph` + 高层 `MathMountedRenderer` |
| Static renderer | 后端无关 Direct SVG（DomainRuntime artifact 默认） |
| Agent runtime | 9 个稳定工具；作为 **stateful adapter** 叠在无状态 DomainRuntime 之上 |
| MCP | stdio JSON-RPC；支持现代 `2026-07-28` 发现协议，同时兼容 `2025-06-18` initialize 客户端 |
| CLI | validate、render、simulate、inspect、capabilities |

## 快速开始

环境要求：Node.js 20+。本包依赖 `@famtutor/core`（workspace）。JSXGraph 1.12.2 已放在 `vendor/jsxgraph/`，许可证见 `THIRD_PARTY_NOTICES.md`。

从仓库根目录：

```bash
npm ci
npm run build
npm test
```

完整 verify（含 browser）需先按根 README 安装 `requirements-smoke.txt` 并设置 `PLAYWRIGHT_PYTHON`。

验证并渲染示例：

```bash
node ./bin/famtutor-math.mjs validate ./examples/perpendicular-bisector.json

node ./bin/famtutor-math.mjs render \
  ./examples/perpendicular-bisector.json \
  --out ./scene.svg \
  --width 960 \
  --height 640
```

运行交互 Demo：

```bash
npm run build
python3 -m http.server 8765
# 浏览器打开 http://127.0.0.1:8765/demo/
```

## SDK 示例

### 验证、求值和 Direct SVG

```ts
import {
  evaluateMathDocument,
  renderDirectSvg,
  validateMathDocument
} from "@famtutor/math-runtime";

const report = validateMathDocument(mathDocument);
if (report.status === "invalid") {
  throw new Error(JSON.stringify(report.issues, null, 2));
}

const evaluation = evaluateMathDocument(mathDocument);
const svg = renderDirectSvg(mathDocument, {
  width: 960,
  height: 640,
  stageId: "observe"
});
```

### 挂载 JSXGraph

先加载 JSXGraph：

```html
<link rel="stylesheet" href="/vendor/jsxgraph/jsxgraph.css" />
<script src="/vendor/jsxgraph/jsxgraphcore.js"></script>
```

再挂载运行时：

```ts
import { mountJsxGraph } from "@famtutor/math-runtime";

const handle = mountJsxGraph(container, mathDocument, {
  onEvent(event) {
    console.log(event);
  }
});

await handle.ready;
handle.setPoint("P", [0, 3]);
handle.setScalar("a", 2.3);
const value = handle.getValue("P");
const snapshot = handle.exportSvg();
handle.destroy();
```

挂载器会观察宿主容器尺寸，并通过 JSXGraph 官方 `updateContainerDims` 路径同步画布；因此响应式网格、折叠面板和阶段切换不需要业务层手工计算 SVG 宽高。

### 交互仿真

```ts
import { simulateMathDocument } from "@famtutor/math-runtime";

const result = simulateMathDocument(
  mathDocument,
  {
    type: "drag",
    target: "P",
    path: [[0, 1], [0, 4]],
    samples: 12
  },
  {
    observe: [
      "distance(P,A)",
      "distance(P,B)",
      "assertion:equal-distance"
    ]
  }
);
```

## Agent API

Agent 不直接生成 JSXGraph JavaScript，而是调用固定工具和 typed command catalog：

```text
math_capabilities
math_create
math_apply
math_inspect
math_validate
math_render
math_simulate
math_export
math_evaluate
```

典型事务：

```json
{
  "documentId": "pb-demo",
  "expectedRevision": 1,
  "idempotencyKey": "construct-pb-v1",
  "operations": [
    {
      "op": "construct",
      "command": "point.free",
      "outputs": [{ "id": "A", "label": "A" }],
      "params": { "coords": [-3, 0] }
    },
    {
      "op": "construct",
      "command": "point.free",
      "outputs": [{ "id": "B", "label": "B" }],
      "params": { "coords": [3, 0] }
    },
    {
      "op": "construct",
      "command": "point.midpoint",
      "inputs": [{ "ref": "A" }, { "ref": "B" }],
      "outputs": [{ "id": "M", "label": "M" }]
    }
  ]
}
```

详细接口见 [docs/AGENT_API.md](docs/AGENT_API.md)。

## MCP 接入

启动 stdio server：

```bash
node ./bin/famtutor-math-mcp.mjs
```

Codex 配置示例：

```toml
[mcp_servers.famtutor_math]
command = "node"
args = ["/absolute/path/famtutor-engine/packages/math/bin/famtutor-math-mcp.mjs"]
startup_timeout_sec = 30
tool_timeout_sec = 120
```

MCP server 将数学命令收敛在 9 个稳定工具里，避免把每个几何命令暴露成一个独立 MCP tool。

## L0 命令目录与 L1 宏

当前为 **58** 个 L0 命令与 **9** 个 L1 宏。完整列表以运行时为准：

```bash
node ./bin/famtutor-math.mjs capabilities
```

L1 宏（中垂线、角平分、四心、切线等）见 `src/catalog/macros.ts`，**不**进入 command enum。

v0.1 起步时的历史基线（31 个核心命令）仍可用于对照：

```text
scalar.constant
scalar.slider
boolean.constant
boolean.expression

point.free
point.on_path
point.midpoint
point.projection
point.intersection_line_line
point.intersection_line_circle
point.intersection_circle_circle

segment.through_points
line.through_points
ray.from_points
ray.angle_bisector
line.parallel_through
line.perpendicular_through
vector.between_points

circle.center_radius
circle.through_points
circle.through_three_points
polygon.vertices
polygon.regular
polygon.diagonals
angle.three_points

transform.translate_point
transform.rotate_point
transform.reflect_point_line
transform.dilate_point

function.explicit
curve.parametric
text.at

measurement.distance
measurement.segment_length
measurement.angle
measurement.slope
```

v0.1.1 相对基线新增的 L0 类别包括：arc/sector、conic、transform 对象 + `transform.apply`、area/perimeter、vector.components/polar、`point.intersection_line_conic` 等。`point.circle_center(circle2) -> point2` 与 `measurement.circle_radius(circle2) -> scalar` 是圆状态的纯计算投影。`point.invert_in_circle` 和 `circle.invert_in_circle` 提供类型稳定的圆反演；后者在源圆经过反演中心、结果应为直线时明确失败。`line.common_tangent` 以两个 `side` 参数选择单个有向分支，`macro.line.common_tangents` 再将四个分支组合成常规公切线工具。`point.projection` 的公开输入已与内核对齐，统一表示 line / segment / ray / circle / arc / polygon boundary 的最近点。教材 Case 04 进一步加入 `boolean.expression`、`point.from_expressions` 与 `text.conditional`，以受限表达式提供滑块驱动的条件反馈。`vector.scale` 组合已有 `vector2` 与数值或安全表达式 `params.factor`，用于滑块驱动的向量缩放和平移，不需要重复计算向量的方向。教材精确图增加 `marker.right_angle`，它组合一个已有的 `angle` 实体，并以文档单位的 `size` 绘制标准直角标记。`marker.segment_tick` 组合已有 `segment2`，以文档单位 `size` 和沿线比例 `position` 生成单条标准等长刻痕；多刻痕由同一原语组合。`marker.parallel_chevron` 消费一个锚点和已有线性对象，生成标准平行箭形的两条短臂；双箭形由两个调用组合。

`ray.angle_bisector(left, vertex, right, branch)` 用显式 `internal/external` 分支构造角平分射线；原 `macro.ray.angle_bisector` 保留为兼容入口并直接降解到该原子，避免依赖交点顺序误选内外分支。

`scalar.slider.params.animation` 保留为 JSXGraph 原生 glider 动画，适合无控制面板的轻量视觉演示。需要播放、暂停、复位、单步、确定性重放或跨宿主一致状态时，应使用文档级 `clocks[]` 与 `controls[]`；不要创建 Case 专属计时器。用户手动修改目标滑块时，确定性时钟自动暂停。

滑块标签复用通用实体样式：`fontSize` 控制字号，`labelOffset: [dx, dy]` 以像素微调 JSXGraph 原生标签。多个滑块共享画布时，应先用 `position` 和 `length` 建立稳定布局，再用 `labelOffset` 做最后微调；不要用 `text.at` 复制滑块名称和值。

`function.value_at(function1, scalar) -> scalar` 对已有函数实体求值，并复用该实体的表达式、闭定义域和文档依赖。输入不是有限数时诊断为 `FUNCTION_INPUT_NOT_FINITE`，输入超出定义域时诊断为 `FUNCTION_INPUT_OUTSIDE_DOMAIN`：

```json
{
  "entities": [
    { "id": "a", "type": "scalar", "role": "free" },
    { "id": "x0", "type": "scalar", "role": "free" },
    { "id": "f", "type": "function1", "role": "derived" },
    { "id": "y0", "type": "scalar", "role": "derived" }
  ],
  "construction": [
    { "id": "op-a", "command": "scalar.slider", "params": { "min": -2, "max": 2, "value": 1 }, "outputs": ["a"] },
    { "id": "op-x0", "command": "scalar.slider", "params": { "min": -3, "max": 3, "value": 1.5 }, "outputs": ["x0"] },
    { "id": "op-f", "command": "function.explicit", "params": { "expression": "a*x^2-1", "domain": [-3, 3] }, "outputs": ["f"] },
    { "id": "op-y0", "command": "function.value_at", "inputs": [{ "ref": "f" }, { "ref": "x0" }], "outputs": ["y0"] }
  ]
}
```

`point.function_root(function1, params.bracket) -> point2` 在一个已隔离、端点异号的闭区间内用确定性二分法构造单个 x 轴交点。它不会猜测扫描步长，也不声称枚举全部根；区间超出函数定义域或未夹住根时返回结构化诊断。

```json
{ "id": "op-root", "command": "point.function_root", "inputs": [{ "ref": "f" }], "params": { "bracket": [-2, 0] }, "outputs": ["root"] }
```

`region.function_inequality(function1, params) -> region2` 组合已有函数边界，表示指定闭 x 域内的上方或下方二维区域。`relation` 为 `above`/`below`，`boundaryIncluded` 决定实线或虚线边界；Direct SVG 与 JSXGraph 使用相同语义。

```json
{ "id": "op-solution", "command": "region.function_inequality", "inputs": [{ "ref": "f" }], "params": { "relation": "above", "domain": [-5, 5], "boundaryIncluded": true }, "outputs": ["solution"] }
```

`function.piecewise(params.branches) -> function1` 把 1–16 个显式分支组合为同一个函数实体。每个分支声明表达式、闭 x 域及端点是否计入；分支不得重叠，也不能同时包含共享端点。求值、Direct SVG 的开闭端点和 JSXGraph 挂载共享同一语义。

```json
{
  "id": "op-piecewise",
  "command": "function.piecewise",
  "params": {
    "branches": [
      { "expression": "x+2", "domain": [-3, 0], "lowerClosed": true, "upperClosed": false },
      { "expression": "x^2", "domain": [0, 3], "lowerClosed": true, "upperClosed": true }
    ]
  },
  "outputs": ["f"]
}
```

```json
{
  "id": "op-progress",
  "command": "scalar.slider",
  "outputs": ["progress"],
  "params": {
    "min": 0,
    "max": 2,
    "value": 0,
    "step": 0.02,
    "position": [-1, -1],
    "length": 3,
    "animation": {
      "autoStart": true,
      "direction": 1,
      "stepCount": 100,
      "delayMs": 30,
      "maxRounds": 1,
      "startDelayMs": 600
    }
  }
}
```

`direction` 只接受 `1` 或 `-1`；`stepCount` 为每轮步数，`delayMs` 为帧间隔，`maxRounds=-1` 表示循环播放。教材演示通常使用 `maxRounds=1`，避免持续运动干扰阅读。

确定性时钟的状态转移只依赖 `{start,end,step,loop}` 与当前逻辑状态；`intervalMs` 不进入数学计算。MountedRenderer 支持 `control.invoke` 与 `clock.play/pause/reset/step`，状态通过 `MountedRendererState.metadata.clocks` 暴露给宿主。

`vector.scale` 的最小用法：

```json
{
  "id": "op-motion-vector",
  "command": "vector.scale",
  "inputs": [{ "ref": "BCVector" }],
  "params": { "factor": "max(t - 1, 0)" },
  "outputs": ["motionVector"]
}
```

`marker.right_angle` 的最小用法：

```json
[
  {
    "id": "op-angle-abc",
    "command": "angle.three_points",
    "inputs": [{ "ref": "A" }, { "ref": "B" }, { "ref": "C" }],
    "outputs": ["angleABC"]
  },
  {
    "id": "op-right-angle-abc",
    "command": "marker.right_angle",
    "inputs": [{ "ref": "angleABC" }],
    "params": { "size": 0.35 },
    "outputs": ["rightAngleABC"]
  }
]
```

输入角必须在 `1e-6` 弧度容差内等于 90°；否则求值返回 `NOT_RIGHT_ANGLE`。输出复用 `polygon2`，建议实体 role 使用 `annotation`、填充透明，并通过正常 style binding 设置线色和线宽。

## JSXGraph 3D 基础能力

`graphics3d` 使用同一份 MathDocument 与 Construction DAG，不把 JSXGraph 对象当作数学真值。当前公开的最小原子命令为：

- `point3.free`、`point3.from_expressions`、`vector3.between_points`；
- `line3.through_points`、`segment3.through_points`、`plane3.through_points`；
- `polygon3.vertices`、`sphere3.center_radius`；
- `curve3.parametric`、`surface3.parametric`。

MountedRenderer 使用 JSXGraph `View3D`、`point3d`、`line3d`、`plane3d`、`polygon3d`、`sphere3d`、`curve3d` 与 `parametricsurface3d`。Direct SVG 使用文档相机进行确定性投影，作为 Bundle、服务端预览和证据链的静态兜底。可运行示例见 `examples/jsxgraph-3d-foundation.json`，浏览器 Demo 中选择“JSXGraph 3D 基础能力”。

第一版刻意不重载二维 `point.set`；3D 拖点提交将使用独立 `point3.set` 交互协议，避免 `[x,y]` 与 `[x,y,z]` 含混。

## 安全边界

- 不执行 Agent 生成的 JavaScript。
- 表达式仅进入白名单 AST；不支持属性访问、数组字面量、语句、动态 import、DOM 或网络 API。
- built-in 查找只允许显式 own property，阻断 `constructor` / `__proto__` 等原型链入口。
- 数学文档必须通过结构、类型、DAG 和运行时验证后才可提交。
- `math_apply` 是原子事务；失败不会污染当前文档。
- 所有写操作支持 revision 乐观锁；Agent 重试可带 idempotency key。
- Renderer 不是数学真值来源；断言优先使用构造语义，其次才是数值残差。

## 测试

完整验证（仓库根目录，使用 lockfile）：

```bash
npm ci
npm run verify
npm run benchmark -w @famtutor/math-runtime
```

覆盖内容包括：

- Node 单元/集成/随机性质测试（以 `node --test` 当前结果为准，见 [TEST_REPORT.md](TEST_REPORT.md)）；
- L0 command catalog 的 headless 和真实 Chromium + JSXGraph 渲染覆盖；
- 250 组随机垂直平分线构型与 680 个随机拖动采样帧；
- JSON Schema、9 个 Agent tool schema；
- MCP modern/legacy 双协议；
- CLI 全命令链路；
- npm pack 后重新解包导入；
- 1,202 节点构造链基准。

详细结果见 [TEST_REPORT.md](TEST_REPORT.md)。

## 当前边界

v0.1.2 有意不包含：

- 挂载后 ChangeSet 增量渲染 / `MountedRenderer`（Engine v0.2 **PR3**）；
- `famtutor.render.bundle.v1`（**PR4**）；
- 完整 GeoGebra 式 UI、资源社区和 Spreadsheet；
- 通用 CAS、精确代数证明和方程求解；
- 隐函数、不等式区域、轨迹和高级统计；
- 通用非线性约束求解；
- 完整 3D（当前仅提供 JSXGraph 教学型基础图元、参数曲线/曲面与确定性静态投影，尚不包含 CSG、B-Rep、复杂网格和精确曲面求交）；
- `.ggb` 导入导出；
- 持久化数据库、多人协作和权限系统；
- 自动标签避让在 JSXGraph runtime 中的完整接入。

这些能力应在协议与 live runtime 稳定后分阶段增加，而不是让 Agent 可靠性被“大而全”拖累。

## 仓库结构

```text
src/
  catalog/       typed command registry
  expression/    safe tokenizer / parser / evaluator
  kernel/        geometry, DAG, evaluation, assertions, simulation
  protocol/      fail-closed semantic validation
  render/        Direct SVG and JSXGraph adapters
  agent/         transactional document store and 9 tools
  mcp/           dual-era stdio MCP protocol

protocol/        published JSON contracts
examples/        executable MathDocument samples
demo/            browser demo
bin/             CLI and MCP entrypoints
test/            unit, integration and randomized invariant tests
scripts/         browser/schema/MCP/CLI/package smoke and benchmark
vendor/          vendored JSXGraph runtime
```

## 许可证

本仓库自身标记为 `UNLICENSED`，用于 FamTutor/BeanX 内部产品开发。第三方 JSXGraph 采用 MIT/LGPL 双许可证；详情见 `THIRD_PARTY_NOTICES.md` 和 `vendor/jsxgraph/LICENSE*`。
