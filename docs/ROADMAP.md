# FamTutor Engine Roadmap

引擎整体设计见 [`ARCHITECTURE.md`](ARCHITECTURE.md)，教材与案例设计见 [`TEXTBOOK_CASE_SYSTEM.md`](TEXTBOOK_CASE_SYSTEM.md)。

## 1. 路线结论

FamTutor Engine 暂不公开发布。近期只围绕一本真实教材建立案例生产闭环：

```text
教材来源 → 10 个种子案例 → 修复共性能力 → 30 个案例
        → 扩展代数/坐标/函数表达 → 60 个案例
        → 100+ 个验收通过案例 → 再评估公开发布
```

“100+”指通过来源、重放、渲染和断言验收的案例数量。`expected-unsupported`、`invalid` 和 regression 案例必须保留用于改进，但不计入完成数量。

## 2. 已完成基础

| Step | Status | Result |
|---|---|---|
| **PR1** 工程与 pack 基线 | Done | CI、verify、consumer smoke |
| **PR2** core runtime contract | Done | 无状态 DomainRuntime 与 ChangeSet |
| **PR3** live MountedRenderer | Done | 实时 apply、交互、snapshot |
| **PR4** Render Bundle v1 | Done | 宿主无关 bundle 与 SHA-256 integrity |
| **PR5** 教材方案与源材料 | Done | 方案文档、教材 PDF、`tmp/pdfs` 页图（不进 npm） |
| **PR6** 教材案例闭环 | In progress | 10 个种子案例已构建：9 accepted / 1 expected-unsupported |

仓库内 `0.3.0` 是内部实现基线，不是公开发布状态。教材闭环稳定前不以版本升级或发布为迭代目标。

## 3. PR5：教材案例系统方案与源材料（Done）

目标：把教材驱动的案例系统写成可审阅的内部方案，并锁定首批试点切片与页码映射；**不改**协议、脚本或运行时代码。

已完成范围：

1. 更新引擎级 `ARCHITECTURE` / `ROADMAP`，并新增 `TEXTBOOK_CASE_SYSTEM`。
2. 将指定教材 PDF 与 `tmp/pdfs/` 页面渲染纳入仓库，供内部核对与后续 Codex 任务（**不**进入 npm pack；版权仍属出版社）。
3. 固定首批试点：第 1 章 1.1“认识三角形”（印刷页 4–9 / PDF 页 7–12）。

验收门槛（已满足）：

- 文档明确 Artifact / MountedRenderer / RenderBundle / TextbookCase 边界；
- 教材版本、ISBN、SHA-256、`pdfPage = printedPage + 3` 映射可对照仓库内 PDF / 页图核对；
- 五章目录与首批 10 个种子案例意图表完整；
- 不含 runtime/schema/脚本实现；案例基础设施从 **PR6** 开始。

## 4. PR6：教材案例基础设施与 10 个种子案例

目标：证明一段教材内容可以由 Agent 变成可追溯、可回放、可静态渲染、可 live 交互和可断言的案例。

当前分支进度：

- 已建立 `famtutor.case.v1`、book registry、source index、knowledge points 和离线 corpus verifier；
- 10 个 CaseSpec 均保存来源、生成记录、初始文档、ChangeSet trace、预期与结构化状态；
- 9 个案例通过双重确定性回放、数学断言、direct SVG、Render Bundle create/validate；
- demonstration、exploration、guided-construction 各有代表案例通过真实 Chromium `mountMathRenderBundle`；
- 04 已用安全布尔表达式、表达式驱动点和条件文本补齐条件反馈，并覆盖真实 Chromium 滑块状态切换；
- 09 明确缺少 assessment submit/scoring/evidence，保留为 `expected-unsupported`；
- 尚待完成 gallery，以及根据首批 gap 决定是否在本 PR 修运行时能力，因此 PR6 仍标记为进行中。

范围：

1. 建立本地教材 registry、来源页索引和 `famtutor.case.v1`。
2. 建立 provider-neutral generator contract；在线生成与离线验证分离。
3. 建立 case validate、trace replay、static render、browser mount、assertion、report、gallery 流水线。
4. 修复 PR4 中阻塞真实 Bundle 浏览器闭环的最小问题。
5. 从第 1 章 1.1 节生成 10 个 Agent 种子案例。
6. 产出首份 capability coverage 和 engine gaps 报告。
7. 增加防止误发布的内部 publish guard；保留 pack smoke。

验收门槛：

- 10 个案例全部包含教材印刷页和 PDF 页来源；
- 每个案例都保存 CaseSpec、ChangeSet trace 和 expected assertions；
- 同一 trace 回放两次得到相同 document fingerprint；
- 至少各有一个 demonstration、exploration、guided-construction 案例完整通过静态 SVG 和 `mountMathRenderBundle` 浏览器路径；
- 其余案例即使暂不支持，也必须走到确定的失败阶段并归类为 `expected-unsupported` 或 `invalid`；
- 失败案例有结构化状态和 diagnostics，不通过手工改产物掩盖；
- CI 回放不依赖网络、模型 API Key 或 CathyGO。

## 5. PR7：第 1–2 章与 30 个验收案例

目标：以三角形和特殊三角形为主，解决第一批案例暴露出的高频几何能力缺口。

重点候选由 PR6 的数据决定，预计包括：

- 角标、线段标记、垂直/相等/全等视觉语义；
- 辅助线、延长线、图层和标签避让；
- 逐步构造、命题条件与结论、证明步骤呈现；
- 图形拖动后的约束保持与 assertion 证据；
- 等腰、直角、轴对称和勾股关系的交互表达。

完成标准：先让有效的 10 个种子案例全部转为 `accepted`，再扩展到累计至少 30 个 `accepted` 案例，并关闭首批 engine gaps 中影响面最高的一组。

## 6. PR8：代数、坐标、函数与 60 个验收案例

目标：避免引擎退化成“动态几何画板”，覆盖教材第 3–5 章带来的非几何表达需求。

预期能力方向：

- 数轴、区间和一元一次不等式/方程组；
- 坐标定位、坐标变换、轴对称和平移；
- 变量、表格、表达式、函数图像之间的联动；
- 一次函数参数探索、图像性质和简单应用场景；
- 多表示同步更新和教学阶段控制。

完成标准：累计至少 60 个 `accepted` 案例；五章都已有来源明确、可回放的代表案例。

## 7. PR9：100+ 案例与内部质量基线

目标：形成可持续回归的教材级能力基线，而不是一次性 demo 集合。

建议的初始章节配额是：

| 教材章节 | 目标案例数 |
|---|---:|
| 第 1 章 三角形的初步知识 | 22 |
| 第 2 章 特殊三角形 | 28 |
| 第 3 章 一元一次不等式 | 14 |
| 第 4 章 图形与坐标 | 16 |
| 第 5 章 一次函数 | 20 |
| **合计** | **100** |

配额是覆盖下限的初始设计，可以根据知识点数量和 engine gaps 调整。建议案例形态总体接近：40% 概念演示、30% 交互探索、20% 引导构造、10% 练习与证据采集。

完成标准：

- 100+ 个 accepted 案例；
- 每个主要知识点至少有一个案例，核心知识点至少有两种表现形态；
- Gallery 可按章节、知识点、案例类型、难度和状态过滤；
- 有稳定的 source coverage、render、interaction、assertion、repair 和 regression 指标；
- 新能力以真实失败簇为依据，并有对应回归案例。

## 8. 100+ 基线之后

达到内部质量基线后再分别评估：

1. 公开仓库中哪些案例可以合法分发，哪些只保留来源页引用和派生结构；
2. 完整不可信输入安全、签名和跨语言 canonicalization；
3. npm 包 SemVer、兼容策略和正式发布流水线；
4. CathyGO host adapter；
5. 第二本教材或 physics 等新学科。

这些工作不得反向污染 core 的宿主无关契约。

## 9. 当前不启动的 backlog

| Domain / Work | 状态 |
|---|---|
| Physics、Chemistry、Biology、Geography | 等待数学 100+ 基线 |
| CathyGO adapter | 等待 Engine 协议由案例验证稳定 |
| Public npm release | 等待内部质量和安全门禁 |
| zip/`.famtutor` archive、remote assets | 非近期目标 |
| dirty-set native reconciliation | 仅在案例性能数据证明必要时启动 |
