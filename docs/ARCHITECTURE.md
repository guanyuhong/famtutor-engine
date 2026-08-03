# FamTutor Engine Architecture

本文档描述 **引擎级** 整体设计。数学领域内部实现见 [`packages/math/docs/ARCHITECTURE.md`](../packages/math/docs/ARCHITECTURE.md)；教材案例系统见 [`TEXTBOOK_CASE_SYSTEM.md`](TEXTBOOK_CASE_SYSTEM.md)；迭代顺序见 [`ROADMAP.md`](ROADMAP.md)。

## 1. 当前产品结论

FamTutor Engine 的目标是一个面向 Agent、宿主无关、可扩展到多学科的教学渲染引擎。近期仍以数学为主，同时服务两种输出：

1. Agent 通过受约束的 `ChangeSet` 实时构建和修改可交互场景。
2. 场景可以导出为宿主无关的 `RenderBundle`，由浏览器、未来的 CathyGO 或其他宿主加载。

PR1–PR4 已完成基础契约、数学运行时、live renderer 和 Render Bundle。仓库内包版本 `0.3.0` 只表示当前内部协议基线，**不代表已经公开发布**。在教材案例闭环稳定前，core、math-runtime 和协议均按内部迭代处理。

| PR | 状态 | 已形成的基础 |
|---|---|---|
| **PR1** 工程基线 | 完成 | TypeScript lockfile、CI、`npm ci && npm run verify`、consumer pack smoke |
| **PR2** `@famtutor/core` | 完成 | 无状态 `DomainRuntime`、`ChangeSet`、`RenderArtifact`、`RuntimeRegistry` |
| **PR3** Live renderer | 完成 | `MountedRenderer`、ChangeSet 画布更新和交互回传；首版使用 `rebuild` |
| **PR4** Render Bundle | 完成 | `famtutor.render.bundle.v1`、SHA-256 integrity、math bundle create/validate/mount |
| **PR5** 教材来源 | 完成 | 教材方案、PDF、页图与页码映射 |
| **PR6** 案例闭环 | 进行中 | `famtutor.case.v1`、来源 registry、10 个种子 trace；当前 9 accepted / 1 expected-unsupported |

下一阶段不扩学科，也不优先做公开发布加固，而是用指定教材持续生成、回放和验证案例，让真实失败决定引擎能力的建设顺序。**PR6 的首批 10-case 构建已落地**：9 个完整通过，Case 04 的条件反馈已补齐，Case 09 仍停在 assessment evidence 的确定能力边界；下一步处理该边界并完成 gallery。

## 2. 系统分层

```text
本地教材 PDF
    │  来源提取：书目、章节、印刷页、PDF 页、知识点
    ▼
Textbook Source Index
    │
    ▼
CaseSpec + Agent Generation Trace
    │  capabilities → ChangeSet → diagnostics → repair
    ▼
DomainRuntime（无状态） ─────→ RenderArtifact（静态）
    │
    ├──────────────────────→ MountedRenderer（实时交互）
    │
    └──────────────────────→ RenderBundle（宿主无关交付）
                                      │
                           Internal Gallery / Host Adapter
                                      │
                               CathyGO（未来适配）
```

分层约束：

- 教材 PDF 是本地来源输入，不进入 npm 包，也不等同于可公开分发的案例资产。
- 教材来源索引和案例协议位于引擎仓库，但不进入 core 的跨科最小运行契约。
- Agent 生成的是可验证、可回放的 CaseSpec 和 ChangeSet，不生成任意 JavaScript，也不以直接生成 SVG 作为主路径。
- `DomainRuntime` 和协议不包含具体模型供应商 SDK；模型接入由独立 generator adapter 完成。
- CathyGO 按 Engine 协议适配；Engine 不嵌入 `cgo.*` 类型或兼容层。

## 3. Artifact / MountedRenderer / RenderBundle / Case 的边界

| 概念 | 是什么 | 不是什么 |
|---|---|---|
| **RenderArtifact** | 一次 SVG/PNG/JSON 渲染结果及其 digest | 不是教材案例，也不是课程交付包 |
| **MountedRenderer** | 有状态挂载；支持 `applyChangeSet`、interaction、snapshot | 不嵌入 bundle runtime JS；当前不承诺 JSXGraph native identity |
| **RenderBundle** | canonical document、requirements、fallback、integrity 的确定性 JSON | 不是 zip，不携带 npm/JSXGraph 源码，不按 bundle 动态 import |
| **TextbookCase** | 带教材来源、生成记录、ChangeSet trace、期望断言和状态的回归单元 | 不是一张截图，也不是只供展示的 demo |
| **Gallery** | 消费案例及派生物的内部浏览与诊断界面 | 不是第二套案例协议，也不是 CathyGO 产品界面 |

Render Bundle 摘要规则保持不变：

- document digest：canonical document 的 UTF-8 bytes；
- artifact/asset digest：解码后的 content bytes，算法为 SHA-256；
- bundle integrity：排除整个 `integrity` 字段后的 canonical bundle bytes。

案例的确定性边界是 **已保存的 ChangeSet trace 回放**。模型再次采样不要求字节一致，但同一 trace 从同一初始状态回放后，document fingerprint、验证结果和关键断言必须一致。

## 4. Agent 实时构建闭环

Agent 的标准构建顺序是：

```text
读取教材切片与知识点
  → 查询 runtime capabilities
  → 生成 CaseSpec
  → 分批提交 ChangeSet
  → DomainRuntime.apply
  → MountedRenderer.applyChangeSet
  → 根据结构化 diagnostics 修复（最多两轮）
  → 静态渲染 + live snapshot + assertions
  → 导出 RenderBundle
```

关键规则：

- Agent 不能绕开 `DomainRuntime.apply` 直接修改 canonical document。
- 实时构建的最小流式单位是 ChangeSet，而不是整份 SVG、HTML 或 JavaScript。
- diagnostics 必须可供模型定位实体和字段；修复操作仍然是新的 ChangeSet。
- generator 保存模型、prompt 版本、seed、尝试次数和原始 trace；离线 CI 只回放已提交 trace，不调用在线模型。
- 两轮自动修复后仍失败的案例进入 `expected-unsupported` 或 `invalid`，不得人工伪造渲染结果绕过。

## 5. 案例驱动的能力建设

引擎功能不再仅由预先设想的命令列表推动，而由案例失败聚类推动：

| 失败类型 | 归属 |
|---|---|
| `protocol_gap` | 文档或 ChangeSet 无法表达教材意图 |
| `kernel_gap` | 数学计算、约束、依赖或断言不足 |
| `renderer_gap` | canonical document 正确但静态/live 呈现不完整 |
| `interaction_gap` | 拖动、选择、提交或状态回传不足 |
| `layout_gap` | 标签、辅助线、图层、视口或排版不可用 |
| `agent_generation_gap` | capability discovery、diagnostics 或修复反馈不利于模型生成 |
| `textbook_coverage_gap` | 教材知识点尚无足够案例或表现方式 |

每一批案例结束后生成 coverage 和 engine-gaps 报告。下一批引擎工作优先解决“高频、跨案例、可泛化”的缺口，不为单个教材截图增加一次性命令。

## 6. 当前信任边界

当前阶段是内部可信输入迭代，但仍禁止 bundle 携带任意可执行代码。**PR6** 起再修复会阻断案例闭环的问题：

- Bundle 必须在真实浏览器入口通过 `mountMathRenderBundle` 挂载；
- document ref、requirements 与实际内容必须语义一致；
- malformed bundle 和非法编码返回 diagnostics，不产生未捕获异常；
- snapshot 和 render result 必须如实报告 incomplete entities。

公钥签名、完整的不可信 SVG/HTML sanitizer、跨语言 canonical JSON 标准化和正式 npm 发布门禁留到 100+ 案例基线稳定之后。

## 7. 短期非目标

- 公开 npm 发布或承诺稳定的外部 SemVer 兼容性；
- CathyGO adapter 或 CathyGO 专用协议；
- physics、chemistry 等新学科包；
- zip/`.famtutor` archive、远程 asset fetch、bundle 内嵌 runtime JS；
- 为单个案例提前实现 dirty-set native reconciliation；
- 把教材 PDF 或大段原文纳入未来的公开发行包。
