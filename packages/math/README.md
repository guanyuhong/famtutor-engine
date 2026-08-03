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

| 模块 | v0.1.1 能力 |
|---|---|
| Canonical protocol | `famtutor.math.document.v1`，闭合 JSON Schema、稳定 ID、revision、provenance |
| 数学命令 | **47** 个 L0 命令 + **8** 个 L1 宏（`expand_macro`）；完整列表见 `capabilities` |
| Construction DAG | 拓扑排序、循环检测、单一 producer、依赖追踪、级联删除 |
| 安全表达式 | AST parser/evaluator；支持数学函数、几何测量、`@entity-id`；无 `eval` / `new Function` |
| Headless kernel | 数值几何、退化检测、运行时类型检查、增量 override 求值 |
| Assertions | 构造语义证明 + 数值残差；支持等距、点在线上、共线、平行、垂直、等长、等角等 |
| Simulation | 点拖动、滑块变化、插值采样、事件轨迹、观察值、断言证据、最终状态提交 |
| Interactive renderer | JSXGraph SVG/Canvas，动态依赖、拖动、滑块、stage、事件桥接、SVG 快照 |
| Static renderer | 后端无关 Direct SVG，适合缩略图、PDF/Word、服务端批量输出 |
| Agent runtime | 9 个稳定工具；事务、revision 乐观锁、dry-run、idempotency、undo、结构化错误 |
| MCP | stdio JSON-RPC；支持现代 `2026-07-28` 发现协议，同时兼容 `2025-06-18` initialize 客户端 |
| CLI | validate、render、simulate、inspect、capabilities |

## 快速开始

环境要求：Node.js 20+；仓库自身无运行时 npm 依赖。JSXGraph 1.12.2 已放在 `vendor/jsxgraph/`，许可证见 `THIRD_PARTY_NOTICES.md`。

```bash
npm run build
npm test
```

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

当前为 **47** 个 L0 命令与 **8** 个 L1 宏。完整列表以运行时为准：

```bash
node ./bin/famtutor-math.mjs capabilities
```

L1 宏（中垂线、角平分、四心、切线等）见 `src/catalog/macros.ts`，**不**进入 command enum。

v0.1 起步时的历史基线（31 个核心命令）仍可用于对照：

```text
scalar.constant
scalar.slider

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
line.parallel_through
line.perpendicular_through
vector.between_points

circle.center_radius
circle.through_points
circle.through_three_points
polygon.vertices
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

v0.1.1 相对基线新增的 L0 类别包括：arc/sector、conic、transform 对象 + `transform.apply`、area/perimeter、vector.components/polar、`point.intersection_line_conic` 等。

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

v0.1.1 有意不包含：

- 完整 GeoGebra 式 UI、资源社区和 Spreadsheet；
- 通用 CAS、精确代数证明和方程求解；
- 隐函数、不等式区域、轨迹和高级统计；
- 通用非线性约束求解；
- 完整 3D；
- `.ggb` 导入导出；
- 持久化数据库、多人协作和权限系统；
- 自动标签避让在 JSXGraph runtime 中的完整接入；
- 挂载后 ChangeSet 增量渲染（Engine v0.2 PR3，见根 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)）。

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
