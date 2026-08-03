# Textbook-driven Case System

本文档定义 FamTutor Engine 下一阶段的教材来源、Agent 案例生成、验证、覆盖与反馈设计。它是当前内部迭代方案，不是已经冻结的公开协议。

## 1. 教材基线

当前唯一指定教材：

| Field | Value |
|---|---|
| Local path | `books/义务教育教科书·数学八年级上册.pdf`（gitignored；不提交到仓库） |
| Suggested `bookId` | `zjedu-math-8a-2013` |
| Title | 义务教育教科书·数学八年级上册 |
| Publisher | 浙江教育出版社 |
| Edition | 2013 年 7 月第 1 版 |
| PDF copy | 2021 年 6 月第 9 次印刷 |
| ISBN | 978-7-5536-0922-5 |
| PDF pages | 177 |
| SHA-256 | `d0888daf868964e0b04a7b22f09b24fa24b001becf7c3a617c5f799f1fa078f2` |

PDF 本体与 `tmp/pdfs/` 页面渲染仅作本地核对，不进入 git / GitHub（见根目录 `.gitignore` 与 `books/README.md`）。

教材事实只能来自：

1. 原始 PDF；
2. 从该 PDF 提取并带页码的本地缓存；
3. 已由人审阅的结构化教材 JSON。

模型常识、其他版本教材和网络摘要不能作为教材事实来源。每个知识点和案例至少记录 `pdfName`、`pdfSha256`、`pdfPages`；正文有印刷页码时同时记录 `printedPages`。

该 PDF 正文当前呈现的稳定映射是 `pdfPage = printedPage + 3`，例如教材第 4 页对应 PDF 第 7 页。该映射必须由 source index 明确记录，不能写成适用于所有教材的全局规则。

当前文件的页面视觉内容清晰，但内嵌文本层存在自定义字体/编码问题，直接使用 `pdftotext` 得到的中文不可作为可靠来源。因此 source ingestion 必须支持“页面渲染 + OCR”回退，并为每个教材切片记录 `extractionMethod`、`confidence` 和 `reviewStatus`。章节标题、数学公式、图号和页码需要视觉抽检，不能仅凭 OCR 自动通过。

## 2. 教材范围索引

目录经 PDF 页面视觉核对后的章节边界如下。表中页码均为 1-based。

| Chapter | Title | Printed start | PDF start | Sections |
|---|---|---:|---:|---|
| 1 | 三角形的初步知识 | 2 | 5 | 1.1 认识三角形；1.2 定义与命题；1.3 证明；1.4 全等三角形；1.5 三角形全等的判定；1.6 尺规作图 |
| 2 | 特殊三角形 | 46 | 49 | 2.1 图形的轴对称；2.2 等腰三角形；2.3 性质定理；2.4 判定定理；2.5 逆命题和逆定理；2.6 直角三角形；2.7 探索勾股定理；2.8 直角三角形全等的判定 |
| 3 | 一元一次不等式 | 88 | 91 | 3.1 认识不等式；3.2 不等式的基本性质；3.3 一元一次不等式；3.4 一元一次不等式组 |
| 4 | 图形与坐标 | 112 | 115 | 4.1 探索确定位置的方法；4.2 平面直角坐标系；4.3 坐标平面内图形的轴对称和平移 |
| 5 | 一次函数 | 138 | 141 | 5.1 常量与变量；5.2 函数；5.3 一次函数；5.4 一次函数的图象与性质；5.5 一次函数的简单应用 |

首批切片固定为：

- 章节：第 1 章“三角形的初步知识”；
- 小节：1.1“认识三角形”；
- 教材印刷页：4–9；
- PDF 页：7–12。

选择理由：这段内容同时包含三角形定义与分类、三边关系、角平分线/中线/高、折叠探索、角度计算和中点面积探索。它能复用现有几何能力，也会真实检验辅助线、标注、交互约束、分步推理和 assertion。

## 3. Case 的职责和状态

一个教材案例是可独立回归的教学意图，不是一张最终图片。它至少包含：

- 来源：教材、版本、印刷页、PDF 页、知识点；
- 意图：学习目标、案例类型、难度、所需能力；
- 生成：模型、prompt 版本、seed、尝试次数；
- 构建：初始状态和有序 ChangeSet trace；
- 预期：实体、关系、数值、交互和教学阶段断言；
- 派生物：canonical document、静态 artifact、Render Bundle、live snapshot；
- 诊断：验证、渲染、交互和修复记录。

状态定义：

| Status | Meaning | 是否计入 100+ |
|---|---|---|
| `accepted` | 来源、trace、静态/live 渲染和 assertions 全部通过 | 是 |
| `expected-unsupported` | 教材意图有效，但当前引擎缺少明确能力 | 否，保留为 backlog |
| `invalid` | 来源、案例设计或 Agent 生成本身无效 | 否，等待重生成/审阅 |
| `regression` | 曾通过但当前回放失败 | 否，必须优先修复 |

## 4. 概念协议 `famtutor.case.v1`

下一迭代再将本节固化为 JSON Schema。本阶段先冻结概念字段：

```text
schema
caseId
title
description
source
  bookId / pdfName / pdfSha256
  chapter / section
  printedPages[] / pdfPages[]
  extractionMethod / confidence / reviewStatus
knowledgePoints[]
learningObjective
caseType
difficulty
requiredCapabilities[]
generation
  provider / model / promptVersion / seed / attempts
inputs
  initialDocument? / parameters?
trace
  changeSets[]
expected
  documentFingerprint
  assertions[]
  interactions[]
artifacts
status
diagnostics[]
```

建议的逻辑目录：

```text
corpus/
  books/<bookId>/
    book.json
    source-index.json
    knowledge-points.json
    cases/<caseId>/
      case.json
      changesets.jsonl
      expected.json
      document.json          # trace 的派生缓存
      render-bundle.json     # 派生缓存
```

PDF、OCR/提取全文和页面图片属于本地 source cache，不应进入 npm pack。是否提交到未来的公开仓库需要单独进行版权审查。

## 5. Agent 生成协议

Agent 生成分为规划、构建、验证和修复四步：

1. 从已索引的教材切片生成 CaseSpec，所有教材主张必须引用页码。
2. 查询 math runtime capabilities，把教学意图分解为一个或多个 ChangeSet。
3. 每批 ChangeSet 通过 `DomainRuntime.apply`，同时应用到 live renderer；保存 apply result 和 diagnostics。
4. 运行 assertions。失败时允许根据结构化 diagnostics 自动修复最多两轮。

限制：

- 不允许把 SVG、Canvas 像素或任意 JavaScript 作为案例源数据；
- 不允许绕过 runtime 直接写最终 canonical document；
- 不允许用模型文本判断替代数学 assertion；
- 不支持的意图应显式进入 `expected-unsupported`；
- 模型再次生成不要求完全一致，但已保存 trace 必须可确定性重放。

## 6. 首批 10 个种子案例

以下是 1.1 节的候选覆盖，不预先假定引擎都已支持：

| ID | 教材意图 | Source | 主要形态 |
|---|---|---|---|
| 01 | 三角形的顶点、边、内角和按角分类 | 印刷 4 / PDF 7 | demonstration |
| 02 | 拖动三角形并保持内角和为 180° | 印刷 4 / PDF 7 | exploration |
| 03 | 三角形任意两边之和大于第三边 | 印刷 5 / PDF 8 | demonstration |
| 04 | 调整三条线段，判断能否组成三角形 | 印刷 5–6 / PDF 8–9 | exploration |
| 05 | 角平分线及折叠发现 | 印刷 7 / PDF 10 | guided-construction |
| 06 | 中线及折叠发现 | 印刷 7 / PDF 10 | guided-construction |
| 07 | 锐角、直角、钝角三角形中高的位置 | 印刷 8 / PDF 11 | exploration |
| 08 | 高与角平分线组合的角度计算 | 印刷 8 / PDF 11 | guided-construction |
| 09 | 中线、角平分线与高的识别和作图 | 印刷 8–9 / PDF 11–12 | assessment |
| 10 | 三边中点与三角形面积探索 | 印刷 9 / PDF 12 | exploration |

这 10 个案例全部由模型生成，但必须逐个通过来源和自动验收。种子批次允许暴露 `expected-unsupported`；**PR6** 的目标是跑通并诚实记录闭环，而不是靠手工产物制造 10/10 的假通过率。

## 7. 100+ 案例覆盖设计

100 个 accepted 案例按教材章节建立初始配额：22 / 28 / 14 / 16 / 20。最终配额应由 knowledge point 数量和能力缺口调整，不按页面平均切分。

每个知识点的覆盖从以下维度组合：

- 教学形态：概念演示、交互探索、引导构造、练习/证据；
- 表示方式：几何图、数轴、坐标、函数图像、表格、表达式、文字步骤；
- 交互方式：拖动参数、选择、逐步揭示、提交答案、重置/重放；
- 难度：识别、单步应用、多表示联动、综合探究；
- 引擎路径：static artifact、MountedRenderer、Render Bundle。

核心知识点至少具有两种不同案例形态。案例数量不能代替覆盖质量，也不能把同一文档仅换参数后重复计数。

## 8. 验证流水线

一个 accepted 案例必须依次通过：

```text
source validation
  → case schema validation
  → ChangeSet trace replay
  → document validation + fingerprint
  → direct static render
  → Render Bundle create/validate/integrity
  → browser mountMathRenderBundle
  → interaction replay
  → mathematical and pedagogical assertions
```

最低断言类别：

- structure：实体、类型、依赖和 ID；
- math：数值、关系、约束和 assertion；
- render：无未解释的 skipped/incomplete entity；
- interaction：动作被允许、ChangeSet 可回放、状态正确；
- teaching：必要步骤/阶段存在，不能只得到最终图。

在线模型只参与生成命令；CI 必须能在无网络和无 API Key 环境中完整重放 committed cases。

## 9. 报告与反馈

每批生成以下逻辑报告：

- `corpus-report`：案例状态、失败阶段和 diagnostics；
- `capability-coverage`：教材知识点 × 引擎能力 × 案例形态；
- `engine-gaps`：按频次、影响案例数和可泛化程度排序；
- Gallery：按章节、知识点、类型、难度、状态过滤，查看静态图和 live 场景。

建议长期跟踪：

- source coverage；
- 首次生成通过率；
- 两轮内自动修复率；
- trace replay 通过率；
- static/live render 完整率；
- interaction/assertion 通过率；
- 每个 accepted case 的 ChangeSet 数、生成尝试数和耗时；
- regression 数量及修复时间。

下一轮引擎能力只从报告中的高价值 failure clusters 进入计划，避免根据单个展示案例堆叠专用功能。

## 10. 分发与版权边界

当前方案仅用于内部迭代。未来公开时需分别处理：

- 教材 PDF 和页面截图默认不随仓库/npm 包分发；
- 案例保留书目信息、页码引用和原创结构化表达；
- 不复制教材的长段原文、整页图像或完整习题集；
- 可公开案例、内部回归案例和本地 source cache 使用独立清单；
- 发布策略不影响 Engine 协议本身的通用性。
