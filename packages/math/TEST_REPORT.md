# FamTutor Math Runtime v0.2.0 测试报告

- 测试日期：2026-08-03
- 测试对象：`@famtutor/math-runtime@0.2.0` + `@famtutor/core@0.2.0`
- 协议：`famtutor.math.document.v1`（不变）+ engine runtime / math operations schemas
- 结论：**以本报告对应提交上的 `npm ci && npm run verify` 为准**。

> 本结论覆盖 PR3：live `MathMountedRenderer`（**rebuild** 策略）、确定性 apply、Agent→DomainRuntime 委托。
> **诚实边界**：不承诺 JSXGraph native object identity；不承诺 dirty-set reconcile；Render Bundle 仍属 PR4。

## 1. 测试环境

| 项目 | 版本 |
|---|---|
| Node.js | >= 20（CI matrix: 20, 22） |
| TypeScript | **5.8.3**（lockfile 固定；本地 `tsc`） |
| Playwright Chromium | browser + live MountedRenderer smoke |
| JSXGraph | 1.12.2 vendored |

## 2. 最终验证命令

```bash
npm ci
npm run verify
```

顺序：core verify → math（build/tests/schema/browser+live/MCP/CLI/pack）。

## 3. Node 测试

结果：**30 / 30** math + **4 / 4** core（以当前提交 `npm test` 为准）。

新增/强化覆盖：

- ApplyResult union / partial / severity 透传
- apply determinism（identical doc+ChangeSet → identical hash）
- Agent `math_apply` 委托注入的 fake `DomainRuntime`
- operations schema ↔ runtime op discriminants
- digest 对最终 content；`UNSUPPORTED_RENDER_MODE` for mounted artifact requests

## 4. Browser

- 既有 JSXGraph catalog smoke（三文档挂载）
- **Live MountedRenderer smoke**：handle identity、非法原子性、幂等、并发 conflict、stage/selection、point/scalar 回写、event sequence、unsubscribe、listener isolation、30 次无泄漏、destroy、snapshot mediaType 诚实、camera state after rebuild

摘要：`artifacts/browser-live-smoke-summary.json`。

## 5. Demo

`packages/math/demo/`：`mountMathRenderer`、模拟 Agent ChangeSet、非法拒绝、event log / revision / `strategy: rebuild`。

## 6. 已知非目标

Render Bundle、CathyGO adapter、native dirty reconciliation、新 L0 / physics / chem。
