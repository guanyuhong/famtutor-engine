# FamTutor Math Runtime v0.1.0 测试报告

- 测试日期：2026-08-03
- 测试对象：`@famtutor/math-runtime@0.1.0`
- 协议：`famtutor.math.document.v1`
- 结论：**P0 验收通过**。构建、单元/集成、JSON Schema、真实 Chromium + JSXGraph、MCP、CLI、npm 打包及性能基准均通过。

> 本结论针对当前 v0.1 的边界：Agent 原生 2D 构造、数值求值、验证、仿真、JSXGraph 交互渲染和 Direct SVG。它不代表完整 GeoGebra 功能覆盖，也不包含完整 CAS、隐函数/不等式、3D、`.ggb` 导入或持久化服务。

## 1. 测试环境

| 项目 | 版本 |
|---|---|
| OS | Debian GNU/Linux 13.3 (trixie), x86_64 |
| Kernel | Linux 6.12.13 |
| Node.js | v22.16.0 |
| npm | 10.9.2 |
| TypeScript | 5.8.3 |
| Python | 3.13.5 |
| Chromium | 144.0.7559.96 |
| Playwright | 1.57.0 |
| jsonschema | 4.26.0 |
| JSXGraph | 1.12.2，仓库内 vendored |

TypeScript 使用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 和 `noEmitOnError` 构建。

## 2. 最终验证命令

```bash
npm run verify
node ./scripts/benchmark.mjs
```

`npm run verify` 按以下顺序执行：

```text
TypeScript build
→ Node tests
→ JSON Schema smoke
→ real Chromium + JSXGraph smoke
→ MCP stdio smoke
→ CLI smoke
→ npm pack / clean extraction / import / render smoke
```

完整日志：`artifacts/full-verify.log`。

## 3. Node 测试

结果：**16 / 16 通过，0 失败，0 跳过**。

覆盖内容：

| 测试域 | 验证点 |
|---|---|
| Agent Runtime | create/apply/inspect/render/evaluate；事务、revision、dry-run、idempotency、undo、级联删除 |
| 原子性 | 非法编辑返回结构化错误，文档不产生半完成状态 |
| Command Catalog | 31 / 31 命令均完成 headless 求值，无 undefined entity |
| 示例文档 | 5 / 5 示例通过语义验证与运行时求值 |
| Construction DAG | 环依赖、重复 producer、缺失引用、类型不匹配按 fail-closed 处理 |
| Assertions | 垂直平分线等距关系由 construction evidence 证明并做数值复核 |
| Simulation | 拖动、路径投影、滑块、观察值、断言证据、最终状态提交 |
| Direct SVG | 确定性输出、stage 显隐、渲染报告 |
| Safe Expression | 算术、函数、布尔、`@entity-id`；拒绝 JS statement、属性访问、`new Function`、未知函数 |
| Numeric Geometry | 投影、线线/线圆/圆圆交点、退化构造 |
| Contract Sync | 运行时命令/工具注册表与发布 JSON 协议同步 |

### 随机化不变量测试

- 250 组随机、非退化的垂直平分线构造；每组均满足 `|PA-PB|` 在相对 `1e-9` 容差内。
- 40 条随机拖动路径，每条 17 帧，共 **680 帧**；约束点每帧都投影回垂直平分线，断言始终通过。
- 随机数种子固定，测试可复现。

## 4. JSON Schema 与协议测试

结果：**通过**。

- 5 个随包示例均通过 `famtutor.math.document.v1.schema.json`。
- 9 个 Agent tool 的 input schema 均可由 Draft 2020-12 validator 加载。
- 运行时 semantic validator 进一步检查 JSON Schema 无法表达的 command arity、输入输出类型、DAG 和运行时退化。

## 5. 真实浏览器与 JSXGraph 测试

结果：**通过**。

测试不是 mock renderer，而是在无网络的真实 Chromium 中加载 vendored JSXGraph 1.12.2，并挂载：

1. 垂直平分线场景；
2. 函数 + slider 场景；
3. 31 个 command catalog 的综合覆盖场景。

验证内容：

- 三个 Board 均成功挂载；
- 31 个 command 的综合场景无 skipped entity、无 warning；
- 可通过 runtime 更新受约束点和 slider；
- 三个场景都可导出 SVG；
- 浏览器无 page error；
- JSXGraph renderer report 和 render hash 可正常生成。

浏览器摘要：`artifacts/browser-smoke-summary.json`。

截图：`artifacts/browser-smoke.png`。

## 6. MCP 测试

结果：**通过**。

- stdio 逐行 JSON-RPC 输入输出；
- 现代 `2026-07-28`：`server/discover`、`tools/list`、`tools/call`；
- 旧版 `2025-06-18`：`initialize`、`tools/list`；
- 9 个工具正确发现；
- 通过 MCP 完成 create → apply → validate；
- modern response 包含 `resultType` 与 `structuredContent`，legacy response 保持兼容格式。

## 7. CLI 测试

结果：**通过**。

验证命令：

```text
validate
render
simulate
inspect
capabilities
```

产物：

- `artifacts/cli-render.svg`
- `artifacts/cli-simulation.json`

## 8. npm 包测试

结果：**通过**。

打包测试执行：

```text
npm pack
→ 解压到干净目录
→ 从打包后的 dist/index.js 导入
→ 读取打包后的示例
→ validate
→ Direct SVG render
```

最终 tarball：

```text
artifacts/famtutor-math-runtime-0.1.0.tgz
120 files；精确字节数见 artifacts/package-smoke-result.txt
```

## 9. 源码归档复验

结果：**通过**。

源码 ZIP 已解压到全新的目录，并在解压后的代码上再次执行完整 `npm run verify`：16 个 Node 测试、Schema、真实 Chromium + JSXGraph、MCP、CLI 以及 npm package smoke 全部通过。复验日志位于 `artifacts/source-zip-verify.log`；SHA-256 随交付物单独提供。

## 10. 性能基准

基准场景是一条包含 1,202 个 construction node / 1,202 个 entity 的长依赖链；单进程冷运行结果：

```json
{
  "nodes": 1202,
  "entities": 1202,
  "validationMs": 160.74,
  "evaluationMs": 77.00,
  "directSvgMs": 85.29,
  "totalMs": 323.03,
  "svgBytes": 144274,
  "renderedEntities": 1202
}
```

该基准用于回归与数量级判断，不等同于不同设备上的产品 SLA。当前 evaluator 仍是整图拓扑求值，后续可引入 dirty-set 增量重算。

原始结果：`artifacts/benchmark-result.json`。

## 11. 测试过程中发现并修复的问题

1. **幂等重试顺序**：原实现先检查 revision，再检查 idempotency，导致成功请求的网络重试可能错误返回 revision conflict；现已先命中幂等缓存。
2. **表达式原型链暴露**：built-in lookup 曾可能读取 `Object.prototype.constructor`；现改为仅允许 own-property 白名单。
3. **实体 ID 与属性访问歧义**：裸 identifier 曾接受 `.`；现带 `.`、`-`、`:` 的 ID 必须写成 `@entity-id`，`window.alert` 无法通过解析。
4. **函数图 fill opacity**：JSXGraph 通用 `opacity` 会覆盖 fill 设置，使函数曲线出现填充；现分别设置 `strokeOpacity` 和显式 fill opacity，并由真实浏览器截图确认。
5. **Slider 步长测试**：slider 会按 step 吸附；测试改为与运行时步长语义一致的 2.3。

## 12. 当前已知边界

- Store 为进程内存实现，不包含数据库、分布式锁、权限和租户隔离。
- 数值 kernel 使用双精度浮点；未实现 exact rational / algebraic number。
- 尚未接入 SymPy/CAS，因此无通用符号证明、化简、求解、积分。
- v0.1 不包含 implicit curve、inequality/region、arc/sector/conic 等下一阶段命令。
- JSXGraph 交互渲染器与 Direct SVG 的视觉 parity 尚未做到像素级一致。
- 没有完整 label collision engine；旧 visual engine 的两阶段标签布局计划在 v0.2 迁入。
- 没有完整 Authoring Studio、Construction View、Algebra View、Table View、3D 和 `.ggb` 导入。
- MCP server 当前是单进程内存状态；生产部署需要 session/persistence/auth wrapper。

## 13. 验收判断

当前代码已经形成可独立运行的第一版垂直切片：

```text
Agent typed operation
→ transaction + revision
→ canonical MathDocument
→ DAG/type/runtime validation
→ headless evaluation
→ assertion evidence
→ interaction simulation
→ JSXGraph / Direct SVG
→ CLI / MCP / SDK
```

因此可进入 FamTutor 上层课程生产流程的集成验证。下一阶段应优先建设宏命令、圆锥曲线/圆弧、Direct SVG parity、标签布局、Construction View 和持久化服务，而不是先扩成完整 GeoGebra UI。
