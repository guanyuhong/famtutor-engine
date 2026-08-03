# FamTutor Math Runtime v0.1.1 测试报告

- 测试日期：2026-08-03
- 测试对象：`@famtutor/math-runtime@0.1.1`
- 协议：`famtutor.math.document.v1`
- 结论：**以本报告对应提交上的 `npm ci && npm run verify` 为准**。发布基线收口后，构建、单元/集成、JSON Schema、真实 Chromium + JSXGraph、MCP、CLI、npm 打包均应在 CI（Node 20/22）与干净本地环境通过。

> 本结论针对当前 v0.1.x 边界：Agent 原生 2D 构造、数值求值、验证、仿真、JSXGraph 交互渲染和 Direct SVG。它不代表完整 GeoGebra 功能覆盖，也不包含完整 CAS、隐函数/不等式、挂载后 ChangeSet 增量渲染、3D、`.ggb` 导入或持久化服务。引擎 v0.2 主线见根 [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)。

## 1. 测试环境

| 项目 | 版本 |
|---|---|
| Node.js | >= 20（CI matrix: 20, 22） |
| npm | 随 Node 发行版 |
| TypeScript | **5.8.3**（`package-lock.json` 固定；构建脚本使用本地 `tsc`，不依赖全局） |
| Python | 3.x（schema / browser smoke） |
| Playwright | CI / 本地按 workflow 安装 |
| jsonschema | Draft 2020-12 |
| JSXGraph | 1.12.2，仓库内 vendored |

TypeScript 使用 `strict`、`noUncheckedIndexedAccess` 和 `noEmitOnError` 构建。

## 2. 最终验证命令

在仓库根目录：

```bash
npm ci
npm run verify
```

`npm run verify` 按以下顺序执行：

```text
TypeScript build（pinned 5.8.3）
→ Node tests
→ JSON Schema smoke
→ real Chromium + JSXGraph smoke
→ MCP stdio smoke
→ CLI smoke
→ npm pack / clean extraction / import / render smoke
```

## 3. Node 测试

结果：**21 / 21 通过，0 失败，0 跳过**（`node --test ./test/*.test.mjs`）。

覆盖内容：

| 测试域 | 验证点 |
|---|---|
| Agent Runtime | create/apply/inspect/render/evaluate；事务、revision、dry-run、idempotency、undo、级联删除 |
| 原子性 | 非法编辑返回结构化错误，文档不产生半完成状态 |
| Command Catalog | **47 / 47** L0 命令均完成 headless 求值，无 undefined entity |
| L1 macros / repair | `expand_macro`、宏不进 L0、`suggestedFixes` |
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

结果：**通过**（`npm run test:schema`）。

- 5 个随包示例均通过 `famtutor.math.document.v1.schema.json`。
- 9 个 Agent tool 的 input schema 均可由 Draft 2020-12 validator 加载。
- 运行时 semantic validator 进一步检查 JSON Schema 无法表达的 command arity、输入输出类型、DAG 和运行时退化。

## 5. 真实浏览器与 JSXGraph 测试

结果：**通过**（`npm run test:browser`，依赖 Python Playwright + Chromium）。

测试不是 mock renderer，而是在无网络的真实 Chromium 中加载 vendored JSXGraph 1.12.2，并挂载：

1. 垂直平分线场景；
2. 函数 + slider 场景；
3. L0 command catalog 的综合覆盖场景。

验证内容：

- 三个 Board 均成功挂载；
- catalog 综合场景无 skipped entity、无 warning；
- 可通过 runtime 更新受约束点和 slider；
- 三个场景都可导出 SVG；
- 浏览器无 page error；
- JSXGraph renderer report 和 render hash 可正常生成。

浏览器摘要：`artifacts/browser-smoke-summary.json`。

## 6. MCP 测试

结果：**通过**（`npm run test:mcp`）。

- stdio 逐行 JSON-RPC 输入输出；
- 现代 `2026-07-28`：`server/discover`、`tools/list`、`tools/call`；
- 旧版 `2025-06-18`：`initialize`、`tools/list`；
- 9 个工具正确发现；
- 通过 MCP 完成 create → apply → validate；
- modern response 包含 `resultType` 与 `structuredContent`，legacy response 保持兼容格式。

## 7. CLI 测试

结果：**通过**（`npm run test:cli`）。

验证命令：`validate` / `render` / `simulate` / `inspect` / `capabilities`。

## 8. npm 包测试

结果：**通过**（`package-smoke`；math 包已去掉 `private`，可正常 `npm pack`）。

```text
npm pack
→ 解压到干净目录
→ 从打包后的 dist/index.js 导入
→ 读取打包后的示例
→ validate
→ Direct SVG render
```

tarball 形如：`artifacts/famtutor-math-runtime-0.1.1.tgz`。

## 9. 性能基准

可选：`npm run benchmark -w @famtutor/math-runtime`。

基准场景是一条包含约 1,202 个 construction node / entity 的长依赖链；用于回归与数量级判断，不等同于产品 SLA。

## 10. 当前已知边界

- Store 为进程内存实现，不包含数据库、分布式锁、权限和租户隔离。
- 数值 kernel 使用双精度浮点；未实现 exact rational / algebraic number。
- 尚未接入 SymPy/CAS。
- 挂载后无 `applyChangeSet` / `replaceDocument`；宿主增改构造时可能只能销毁重建画布（Engine v0.2 PR3）。
- JSXGraph 与 Direct SVG 的视觉 parity 尚未做到像素级一致。
- 没有完整 label collision engine。
- 没有完整 Authoring Studio、Construction View、Algebra View、Table View、3D 和 `.ggb` 导入。
- MCP server 当前是单进程内存状态；生产部署需要 session/persistence/auth wrapper。

## 11. 验收判断

当前代码是可独立运行的数学垂直切片，并完成发布基线收口：

```text
npm ci → pinned TypeScript 5.8.3
→ Agent typed operation
→ transaction + revision
→ canonical MathDocument
→ DAG/type/runtime validation
→ headless evaluation
→ assertion evidence
→ interaction simulation
→ JSXGraph / Direct SVG
→ CLI / MCP / SDK / npm pack
```

下一阶段按引擎级路线图推进：`@famtutor/core` → live MountedRenderer → Render Bundle；数学教学生产能力（label、parity、Construction View 等）排在其后。
