# GeoGebra Math 9–12 知识素材与底层能力计划

## 1. 结论

`famtutor-geogebra-math-skill-index-v0.2.0` 可以作为 **GeoGebra Math 当前公开分类与标题的来源索引**，但不能直接当作 FamTutor 知识图谱或课程大纲。

本轮建议先处理 9–12 学段，并从“函数—图像—二次函数”家族开始。原因不是这个家族标题最多，而是它可以同时验证已有的 `function.explicit`、安全表达式、滑块、阶段、Direct SVG、JSXGraph、MountedRenderer 和 Render Bundle，并较快暴露多个知识点共用的真实底层缺口。

实施顺序固定为：

```text
来源标题与教学意图核验
  → 知识点语义归一化
  → 用现有公开接口构建垂直素材
  → 记录确定失败和重复绕行
  → 仅对重复缺口补最小底层原语
  → 迁移素材到新原语
  → 四类证据验收
```

不按 GeoGebra Activity 数量扩 API，不复制活动正文、插图、Applet、脚本或 `.ggb` 文件。

## 1.1 可追溯进度表

状态口径：`✅ 已验收`、`🚧 进行中`、`🧭 已排期`、`⬜ 待排期`。每次新增素材、底层决策或验收证据，都必须同步更新本表、[`material-index.v1.json`](../research/geogebra/math-g9-12/material-index.v1.json) 和 [`gap-ledger.v1.json`](../research/geogebra/math-g9-12/gap-ledger.v1.json)。来源入口为 [GeoGebra Math](https://www.geogebra.org/math?lang=en-GB)，具体目标以 Topic 页为准。

| # | GeoGebra 9–12 知识标题 | 生产波次 | 状态 | Engine Case / 主要能力决策 |
| ---: | --- | --- | --- | --- |
| 1 | Functions and Function Notation | Wave 01 | ✅ 已验收 | RESEARCH 28；新增 `function.value_at` |
| 2 | Effects of Changes in Slope and Intercepts of Lines | Wave 01 | ✅ 已验收 | RESEARCH 21；组合现有滑块与函数图像 |
| 3 | Transformations on Nonlinear Parent Functions | Wave 01 | ✅ 已验收 | RESEARCH 22；不新增母函数专用命令 |
| 4 | Exponential Functions: Equation, Graph, and Critical Values | Wave 01 | ✅ 已验收 | RESEARCH 29；复用函数求值 |
| 5 | Graphing Quadratic Functions | Wave 01 | ✅ 已验收 | RESEARCH 30；补齐通用滑块标签样式映射 |
| 6 | Zeros of Quadratic Functions | Wave 01 | ✅ 已验收 | RESEARCH 31；参数已知零点，不预建全根求解 |
| 7 | Representations of Relations and Functions | Wave 02 | ✅ 已验收 | RESEARCH 32；`table` 延后 |
| 8 | Increasing and Decreasing Functions | Wave 02 | ✅ 已验收 | RESEARCH 33；组合 `interval1` |
| 9 | Graphing Absolute Value Functions and Inequalities | Wave 02 | ✅ 已验收 | RESEARCH 34；新增 `region.function_inequality` |
| 10 | Graphing to Solve Quadratic Equations | Wave 02 | ✅ 已验收 | RESEARCH 35；新增单根 `point.function_root`，全根原语延后 |
| 11 | Domain and Range of Special Functions | Wave 03 | ✅ 已验收 | RESEARCH 36；新增 `function.piecewise`，保留分支域与端点开闭 |
| 12 | Composition and Inverse of Functions | Wave 03 | ✅ 已验收 | RESEARCH 37；求值链与图像对称足够，composition/inverse 原语延后 |
| 13 | Solving Systems of Linear Equations | Wave 03 | ✅ 已验收 | RESEARCH 38；复用直线、交点和阶段分类，`solution-set` 延后 |
| 14 | Discriminant and Roots of a Quadratic Equation | Wave 03 | ✅ 已验收 | RESEARCH 39；组合布尔分类与图像，结构化 all-roots 延后 |
| 15 | Exponential Equations | 后续 | ⬜ 待排期 | 受限符号代数探针 |
| 16 | Literal Equation for an Indicated Variable | 后续 | ⬜ 待排期 | 受限符号代数探针 |
| 17 | Radicals and Rational Exponents | 后续 | ⬜ 待排期 | 表达式等价与定义域 |
| 18 | Adding, Subtracting, and Multiplying Polynomials | 后续 | ⬜ 待排期 | 多项式运算语义 |
| 19 | Factoring Quadratic Polynomials | 后续 | ⬜ 待排期 | 因式分解语义 |
| 20 | Completing the Square to Solve Quadratic Equations | 后续 | ⬜ 待排期 | 等价变形序列 |
| 21 | Quadratic Equations and Functions from Zeros | 后续 | ⬜ 待排期 | 零点到函数表示 |
| 22 | Using Properties of Equality to Solve Quadratic Equations | 后续 | ⬜ 待排期 | 方程等价变形 |
| 23 | Using the Quadratic Formula to Solve Quadratic Equations | Wave 04 | ✅ 已验收 | RESEARCH 43；复用系数、函数与点表达式，all-roots 继续延后 |
| 24 | Complex Fractions | 后续 | ⬜ 待排期 | 受限分式化简 |
| 25 | Radical Expressions | 后续 | ⬜ 待排期 | 根式运算语义 |
| 26 | Solving Linear Inequalities | Wave 04 | ✅ 已验收 | RESEARCH 40；官网目标为二元不等式，复用边界函数、半平面与测试点 |
| 27 | Systems of Linear Inequalities | Wave 04 | ✅ 已验收 | RESEARCH 41；多个区域实体叠加与测试点合取，`region.intersection` 延后 |
| 28 | Solving Nonlinear Systems of Equations and Inequalities | Wave 04 | ✅ 已验收 | RESEARCH 42；差函数根、交点投影与非线性区域组合 |
| 29 | Real-World Phenomena as Functions | 后续 | ⬜ 待排期 | 约束定义域与多表示 |
| 30 | Problems Involving Rates | 后续 | ⬜ 待排期 | 函数建模 |
| 31 | Arithmetic and Geometric Sequences | 后续 | ⬜ 待排期 | 标量数列探针 |
| 32 | Recursive Sequence Formulas | 后续 | ⬜ 待排期 | 递推数列探针 |
| 33 | Exponential Functions | 后续 | ⬜ 待排期 | 与 Wave 01 指数素材归并评审 |
| 34 | Characteristics of Functions and Their Graphs | 后续 | ⬜ 待排期 | 函数特征语义 |
| 35 | Graphs of Quadratic Functions | 后续 | ⬜ 待排期 | 与二次函数素材归并评审 |
| 36 | Residuals of a Distribution | 后续 | ⬜ 待排期 | 有界数据集探针 |
| 37 | Correlation Coefficient; Correlation and Causation | 后续 | ⬜ 待排期 | 统计测量与教学语义分离 |
| 38 | Lines of Best Fit | 后续 | ⬜ 待排期 | 散点与线性拟合 |
| 39 | Curves of Best Fit | 后续 | ⬜ 待排期 | 多模型拟合 |
| 40 | Standard Deviation | 后续 | ⬜ 待排期 | 数据集与统计量 |
| 41 | Equation of a Line Parallel or Perpendicular to a Line | 后续 | ⬜ 待排期 | 现有直线原语对照组 |
| 42 | Using Slope to Determine Parallel and Perpendicular Lines | 后续 | ⬜ 待排期 | 现有斜率与断言对照组 |
| 43 | Degree and Radian Measure of Angles | 后续 | ⬜ 待排期 | 角度单位语义 |
| 44 | Trigonometric Ratios | 后续 | ⬜ 待排期 | 角与边长测量组合 |
| 45 | Error of a Measuring Tool | 后续 | ⬜ 待排期 | quantity / uncertainty 探针 |

当前累计（Wave 01–04）：`18 / 45` 个唯一知识标题已形成垂直素材并完成四类验收。GeoGebra 9–12 原始切片仍保留 50 个 occurrence，对应 45 个标题级唯一 Skill。

## 2. 索引审计

### 2.1 本地包

来源包：

`/Users/guanyuhong/Downloads/famtutor-geogebra-math-skill-index-v0.2.0`

包内口径：

| 项目 | 数量 |
| --- | ---: |
| Domain | 6 |
| Grade band | 3 |
| Taxonomy slot | 115 |
| 唯一 Topic 页 | 54 |
| Skill occurrence | 330 |
| 标题级唯一 Skill | 296 |
| 跨 Topic 重复标题 | 31 |

本地 `checksums.sha256` 对 README、文档、JSON、CSV、XLSX 和预览图的全部校验均通过。

### 2.2 9–12 切片

| 项目 | 数量 |
| --- | ---: |
| Hub taxonomy slot | 24 |
| Hub 中唯一 Topic | 20 |
| Topic 页额外出现、Hub 未列出的 Topic | 2 |
| 实际涉及 Topic | 22 |
| Skill occurrence | 50 |
| 标题级唯一 Skill | 45 |
| 跨 Topic 重复产生的额外 occurrence | 5 |

50 条 occurrence 的领域分布：

| 领域组合 | occurrence |
| --- | ---: |
| Algebra | 37 |
| Probability and Statistics | 4 |
| Algebra + Geometry | 2 |
| Algebra + Operations | 2 |
| Geometry + Measurement | 2 |
| Operations | 2 |
| Measurement | 1 |

两条 `taxonomy_slot_match=false` 不是抽取错误：

- `Problems Involving Rates` 确实位于 [Ratios and Rates](https://www.geogebra.org/math/ratios-rates) Topic 页的 9–12 分段，但当前 Hub 只把该 Topic 列在 6–8。
- `Complex Fractions` 确实位于 [Operations with Fractions](https://www.geogebra.org/math/fraction-operations) Topic 页的 9–12 分段，但当前 Hub 没有把该 Topic 列入 9–12 的 Operations 槽位。

### 2.3 官网核验结果

2026-08-05 对 [GeoGebra Math Hub](https://www.geogebra.org/math?lang=en-GB) 和 9 个代表 Topic 做了复核：

- Hub 的 6 个领域、三个学段及 9–12 Topic 布局与本地索引一致。
- 逐项核对了 9 个 Topic 中的 27 / 50 条高中 occurrence，包括 Functions、Quadratic Functions、Quadratic Equations、Statistics、Linear Regression、Angles、Roots，以及上面的两个 Hub 外 Topic。
- 所核对标题、学段、Topic 归属和页面顺序均与包内 `skill_title_en_raw` 一致。
- Statistics 的复合标题在网页上本来就有不规则标点；包同时保留 raw 标题并提供轻度规范化标题，处理合理。

因此本包适合作为“来源目录”。仍需保留以下限定：

1. `296` 和高中切片的 `45` 都只是标题级去重，不是语义知识节点数。
2. `Graphing Quadratic Functions`、`Graphs of Quadratic Functions`、`Characteristics of Functions and Their Graphs` 等存在明显的父子、过程/性质或近义关系，不能只靠标题字符串合并。
3. `Graphing Absolute Value Functions and Inequalities` 是复合目标，进入中国课程语义时应拆为函数图像与不等式解集两个教学原子。
4. GeoGebra 只给出 9–12 宽学段，不能据此推断中国课程的具体年级、必修/选择性必修位置。
5. 中文字段是术语草案。至少要复核“角的度数制”是否改为常用的“角度制”，“三角函数比”是否按课程语境改为“三角比”或“锐角三角函数”。

## 3. FamTutor Engine 当前基线

运行时 `math capabilities` 是能力数量的当前事实来源：

- runtime `0.3.0`；
- 80 个 L0 command，其中 49 个标记为两种渲染后端均支持；
- 源码目录中有 10 个可执行 L1 macro；
- 文档协议、DAG、安全数值表达式、数学断言、仿真、Control/Action、确定性 Clock、阶段、Direct SVG、JSXGraph、MountedRenderer 和 Render Bundle 已存在；
- 函数相关已有 `function.explicit`、`function.piecewise`、`function.value_at`、`point.function_root` 与 `curve.parametric`；
- 不等式已有 `interval1`、`interval.from_bounds` 与组合既有函数实体的 `region.function_inequality`。

仓库文档中的“58 个 L0”“9 个 L1”等历史数量已经落后于运行时，后续不应据此计算覆盖率。

### 3.1 可直接复用的能力

| 素材需求 | 当前能力 |
| --- | --- |
| 参数改变与动态图像 | `scalar.slider`、Clock、Control/Action |
| 显式函数图像 | `function.explicit`、Direct SVG、JSXGraph |
| 坐标采样点 | `point.from_expressions` |
| 条件反馈 | `boolean.expression`、`text.conditional` |
| 一维区间 | `interval.from_bounds` |
| 函数不等式区域 | `region.function_inequality`，区域交集用多个 `region2` 叠加与布尔合取 |
| 有界单根与函数交点 | `point.function_root`；函数交点可用差函数根与点表达式组合 |
| 直线、斜率、平行、垂直 | 现有 line / measurement / assertion 原语 |
| 角与几何测量 | `angle.three_points`、`measurement.angle` 等 |
| 教学分步 | activities / stages / narration / focus |
| 确定性验收 | replay、assertion、static render、MountedRenderer、Bundle |

### 3.2 需要由素材验证的候选缺口

以下只是候选，不在计划开始时预建：

| 缺口簇 | 当前问题 | 可能的最小职责 |
| --- | --- | --- |
| 函数实体联动 | 采样点常要重复书写函数表达式 | 从已有 `function1` 在给定自变量求值，或生成图上点 |
| 分段函数 | 安全表达式没有分段函数的领域语义 | 有界、显式分支的 `function1` 组合 |
| 函数特征 | 零点、极值、单调区间目前多靠叙事或人工采样 | 对 `function1` 的有界数值测量和相应 assertion evidence |
| 符号代数 | 当前 AST 是安全数值求值器，不做等价变形、因式分解或方程求解 | 独立、受限、可审计的代数表达式/等式语义 |
| 解集与区域组合 | `interval1` 只表示单个连通区间，`region2` 尚无可供下游消费的交集实体 | 只有面积、边界或命中测试等消费需求出现后，才评审集合/区域组合原语 |
| 数据与统计 | 没有一等数据表、散点、回归、残差、标准差语义 | 有界数据集 + 小型统计测量，不复制电子表格 |
| 标量数列 | `collection.sequence` 面向几何集合，不能表达递推标量序列 | 有界标量序列及显式/递推生成 |
| 单位与误差 | scalar 没有单位、精度和不确定度 | 只有多素材反复需要时再引入 quantity/uncertainty |

新增原语必须由至少两个独立素材暴露同一重复问题，或由一个 P0 素材产生无法组合绕开的确定失败；之后仍要同时覆盖协议注册、命令目录、内核、Direct SVG、JSXGraph、测试和示例。

## 4. 45 个高中唯一标题的实施分组

这里的分组是 FamTutor 的生产波次，不改变 GeoGebra 原始 Topic 归属。

### A. P0 图像化函数骨架（10）

优先构建。前 6 个组成首批垂直探针。

| 首批 | 知识标题 | 主要素材 | 预期验证 |
| --- | --- | --- | --- |
| 1 | Functions and Function Notation | 公式—输入—输出—图上点联动 | 函数实体求值 |
| 2 | Effects of Changes in Slope and Intercepts of Lines | `k`、`b` 双滑块与关键点 | 复用现有一次函数 Case |
| 3 | Transformations on Nonlinear Parent Functions | 平移、伸缩、反射的多阶段图像 | 参数化函数变换 |
| 4 | Exponential Functions: Equation, Graph, and Critical Values | 底数/系数、截距、增长衰减 | 指数表达式与特征证据 |
| 5 | Graphing Quadratic Functions | 一般式/顶点式/因式分解式切换 | 二次函数多表示 |
| 6 | Zeros of Quadratic Functions | 零点、交点、因式之间联动 | 函数零点测量/断言 |
| 后续 | Representations of Relations and Functions | 表、图、式、语言联动 | 数据表需求 |
| 后续 | Increasing and Decreasing Functions | 有界区间与动态图像 | 单调区间证据 |
| 后续 | Graphing Absolute Value Functions and Inequalities | V 形图像和解集分阶段 | piecewise + 解集 |
| 后续 | Graphing to Solve Quadratic Equations | 函数图像与 x 轴交点 | 图解方程 |

### B. P1 符号代数与二次方程（12）

- Exponential Equations
- Literal Equation for an Indicated Variable
- Radicals and Rational Exponents
- Adding, Subtracting, and Multiplying Polynomials
- Factoring Quadratic Polynomials
- Completing the Square to Solve Quadratic Equations
- Discriminant and Roots of a Quadratic Equation
- Quadratic Equations and Functions from Zeros
- Using Properties of Equality to Solve Quadratic Equations
- Using the Quadratic Formula to Solve Quadratic Equations
- Complex Fractions
- Radical Expressions

本组不得用预先算好的文本步骤伪装内核能力。第一批素材可以先明确标记 `expected-unsupported`，以两到三个不同变形任务共同设计受限符号语义。

### C. P1 解集、方程组与区域（4）

- Solving Linear Inequalities
- Solving Systems of Linear Equations
- Systems of Linear Inequalities
- Solving Nonlinear Systems of Equations and Inequalities

先复用 `interval1`、直线和交点。只有一维区间并集或二维交集区域成为重复需求时，再补对应实体；禁止在单个 SVG 中硬编码阴影多边形。

### D. P2 函数建模、数列与应用（9）

- Composition and Inverse of Functions
- Domain and Range of Special Functions
- Real-World Phenomena as Functions
- Problems Involving Rates
- Arithmetic and Geometric Sequences
- Recursive Sequence Formulas
- Exponential Functions
- Characteristics of Functions and Their Graphs
- Graphs of Quadratic Functions

本组依赖 A 组函数实体联动，并会决定是否需要 piecewise、数据表与标量序列原语。

### E. P2 数据与统计（5）

- Residuals of a Distribution
- Correlation Coefficient; Correlation and Causation: Differences, Design, and Examples
- Lines of Best Fit
- Curves of Best Fit
- Standard Deviation

建议先用同一小型数据集生产散点—拟合—残差—标准差四个素材，观察共用状态是否足以证明 `dataset` 是一等实体。相关不等于因果主要是教学语义，不应被错误建模成一个数值命令。

### F. P2 几何、三角与测量（5）

- Equation of a Line Parallel or Perpendicular to a Line
- Using Slope to Determine Parallel and Perpendicular Lines
- Degree and Radian Measure of Angles
- Trigonometric Ratios
- Error of a Measuring Tool

前四项大部分可以复用现有线、斜率、角与断言能力，适合作为“零新增原语”对照组。测量工具误差用于观察单位/精度是否真需要进入底层。

## 5. 每个知识素材的形态

一个知识标题不是一个单页 SVG。每个可验收素材至少拆成：

```text
source snapshot
  原始标题、Topic、grade band、URL、核验时间、中文术语状态

teaching atoms
  concept / rule / procedure / representation / misconception / assessment seed

engine case
  MathDocument + ChangeSet trace + stages + interactions + assertions

visual assets
  Direct SVG artifact + JSXGraph/MountedRenderer interactive board

acceptance evidence
  sourceFidelity / mathCorrectness / visualQuality / runtimeStatus
```

素材目录建议延续现有 host-neutral Engine 边界：

```text
research/geogebra/math-g9-12/
├── source-audit/
├── knowledge-map.v1.json
├── gap-ledger.v1.json
├── batches/
└── cases/<knowledge-point-id>/case.json
```

如果以后需要 CathyGO 微课导入，再由这些可追溯素材生成独立的 `materials/math/<knowledgePointId>/` 交接包；不把 Canvas 或 CathyGO 专用协议放进 Engine runtime。

每个知识素材可附 5–10 个 quiz seed，但在 assessment submit/scoring/evidence 底层闭环完成前，quiz seed 不计入 `runtimeStatus=verified`。

## 6. 实施波次

### Wave 0：固化索引与口径

1. 将高中 50 条 occurrence 生成 host-neutral `knowledge-map.v1.json`，保留 occurrence 与 canonical knowledge atom 的多对多关系。
2. 为 45 个标题加入 `termStatus`、`semanticCluster`、`chinaCurriculumAlignmentStatus`，不臆造具体年级。
3. 记录两个 Hub 外 occurrence 和五组跨 Topic 重复。
4. 修正文档中的运行时能力数量漂移，所有自动统计改从 capabilities 和源码目录产生。

完成门槛：索引转换确定性、无丢失、可回溯到 50 条 occurrence。

### Wave 1：6 个 P0 垂直探针

先构建 A 组表格中的前 6 个素材，只使用当前公开接口。允许产出结构化 `expected-unsupported`，不允许案例特例。

同时建立 gap ledger：

- `supported_exact`
- `composable_existing`
- `needs_atomic_capability`
- `teaching_only`
- `deferred`

完成门槛：6 个素材全部走完文档求值、静态渲染、MountedRenderer、阶段和 Bundle 路径；失败必须是确定、可复现的诊断。

### Wave 2：只关闭重复出现的函数底层缺口

预计先评审函数实体求值/图上点、piecewise、零点/关键特征证据，但是否实施由 Wave 1 ledger 决定。

### Wave 3：函数组合、分段语义与解分类

完成 4 个垂直素材：特殊函数定义域和值域、复合与反函数、线性方程组、判别式与根的情况。

- 新增 `function.piecewise`，因为官方目标明确要求 step / constant / piecewise，且分支域与开闭端点无法由单一表达式忠实表达。
- `function.compose` 与一般反函数继续延后；当前 `function.value_at` 求值链和显式逆函数足够完成可验证教学案例。
- 表格已在两个素材中重复出现，但判定为通用教学呈现职责，不进入 Math L0。
- 线性方程组解集与自动全部根继续延后，等待不等式系统或二次公式素材共同确定输出集合语义。

完成门槛：RESEARCH 36–39 全部通过来源核验、断言、Direct SVG、真实 MountedRenderer、阶段切换、视觉检查和 Render Bundle。2026-08-05 已完成。

### Wave 4：二元不等式、区域组合与二次公式

完成 4 个垂直素材：二元线性不等式、线性不等式组、非线性方程/不等式组、用求根公式解二次方程。

- 四个素材全部由现有公开命令组合，未新增 L0；
- `region.intersection` 继续延后：当前没有面积、边界或命中测试等下游消费者；
- 通用 `all-function-roots` 继续延后：任意函数的搜索域、完备性、不连续点和重根语义仍未解决；
- 函数交点由差函数、`point.function_root` 与 `point.from_expressions` 组合；二次公式由标量、函数和点表达式组合；
- 修正 JSXGraph `region.function_inequality` 的通用视觉语义：填充裁剪边不再显示或重复标注，只有函数曲线作为数学边界。

完成门槛：RESEARCH 40–43 的来源核验、断言、Direct SVG、真实 MountedRenderer、三阶段切换、视觉检查和 Render Bundle 全部通过；Gallery 为 84 / 84 挂载、83 accepted、1 expected-unsupported。2026-08-05 已完成。

每个新增接口需要：

- 领域职责和失败条件；
- 命令说明与可运行例子；
- 协议、内核、Direct SVG、JSXGraph 同步实现；
- 窄视窗、边界参数和退化状态测试；
- 将已有一次函数和 `y=ax²` 研究 Case 迁移为复用新接口，证明不是单题 API。

完成门槛：首批 6 个素材都不再依赖重复表达式或手工视觉拼接，四类验收证据完整。

### 后续 Wave 5：进入 B 组符号代数

1. 补完 A 组剩余 4 个素材。
2. 从 B 组选 3 个不同变形任务验证符号代数边界。
3. 从 C 组选一维和二维各 1 个任务验证解集/区域边界。
4. 只有聚类失败证据足够时才新增符号或 region 语义。

### 后续 Wave 6：D/E/F 组

按依赖顺序处理：

1. D 组函数建模与数列；
2. E 组共用数据集的统计素材；
3. F 组几何/三角对照素材与测量误差探针。

## 7. 验收矩阵

每个素材分别记录，不能只写 `accepted`：

| 维度 | 必要证据 |
| --- | --- |
| `sourceFidelity` | occurrence ID、raw 标题、Topic、grade band、官方 URL、教学原子来源、中文术语审核状态 |
| `mathCorrectness` | 构造约束、数值/符号结论、边界和退化条件、assertion evidence |
| `visualQuality` | Direct SVG 与 JSXGraph 语义一致、标签/图层/视窗可读、阶段不拥挤 |
| `runtimeStatus` | 双重确定性 replay、validate、static render、MountedRenderer、stage switch、Render Bundle |

批次级指标：

- occurrence 覆盖率与 canonical atom 覆盖率分开统计；
- `supported_exact`、`composable_existing`、`needs_atomic_capability` 数量分开统计；
- 新增 L0 数量不能作为进度指标；
- 一个新增 L0 至少由两个素材复用，或有明确的独立领域职责与无法组合的证明；
- 所有新增视觉原语都必须跨 Direct SVG / JSXGraph 验证。

## 8. 第一批执行清单

下一轮建议只启动以下工作：

1. 生成高中 `knowledge-map.v1.json` 与 `gap-ledger.v1.json` schema。
2. 复用并升级现有一次函数 Case，对应 `Functions and Function Notation` 与 `Effects of Changes in Slope and Intercepts of Lines`。
3. 复用并升级现有 `y=ax²` Case，对应 `Graphing Quadratic Functions`。
4. 新建 nonlinear parent transformations、exponential critical values、quadratic zeros 三个 Case。
5. 跑完整 corpus / browser / Bundle 验收，汇总重复缺口。
6. 在证据评审后再决定第一个底层 PR，不预先承诺命令名。

这个批次以 6 个素材、3 个可复用函数家族和一份可审计 gap ledger 为完成标准，不以新增 API 数量为完成标准。

## 9. Wave 01 实施状态（2026-08-05）

首批 6 套垂直素材已经落地，入口为 `research/geogebra/math-g9-12/material-index.v1.json`：

- RESEARCH 21 升级为“斜率和截距变化”；
- RESEARCH 22 升级为“非线性母函数变换”；
- RESEARCH 28–31 分别实现函数记号、指数函数关键特征、二次函数作图和二次函数零点；
- 每套包含来源快照、5 个教学原子、3 个阶段、5 个 quiz seed 和四维验收记录；
- `function.value_at(function1, scalar)` 已作为唯一新增 L0，替代案例层重复函数表达式；
- `gap-ledger.v1.json` 明确区分已关闭、可组合和延期能力，不为符号求解与通用临界点预建接口。

专项自动化已经覆盖文档验证、数学断言、参数 sweep、Direct SVG、Render Bundle 和素材引用完整性。浏览器检查另行验证了 330px 高 Gallery 卡片、Mounted JSXGraph 和六套素材的阶段切换；其中发现并修正了二次函数两例的滑块标签拥挤问题。
