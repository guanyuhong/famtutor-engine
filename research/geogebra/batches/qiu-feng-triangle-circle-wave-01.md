# “秋风”Triangle / Circle 同构 Wave 01

本批基于“秋风”公开主页的 182 个 Activity。原始 `.ggb`、缩略图和 Semantic Brief seed 保留在仓库外 `/private/tmp/geogebra-qiu-feng`；仓库只保存公开 ID、SHA-256、结构聚类、能力结论和 FamTutor 原创案例。

## 聚类结果

- 182 个材料全部进入确定性聚类目录；按“章节 × 机制 × 几何族”展开为 286 个簇。
- 109 个可直接进入原创复现，56 个需别名或语义复核，17 个存在明确底层能力缺口。
- 多家族归类后得到 Triangle 84 个、Circle 4 个；同一材料可以同时属于 Triangle、Transform 等家族，因此家族计数不要求相加等于 182。
- 机制覆盖：条件显隐 180、动画 179、复选框 179、滑块 113、变换 102、仿真 54、按钮 50、Sequence 18。

完整目录见 [`../qiu-feng-curriculum-mechanism-clusters.v1.json`](../qiu-feng-curriculum-mechanism-clusters.v1.json)，生成器为 [`../../../scripts/geogebra/curriculum-cluster.mjs`](../../../scripts/geogebra/curriculum-cluster.mjs)。

## 第一波 12 个代表材料

| ID | 主题 | 角色 | 当前处理 | 能力结论 |
|---|---|---|---|---|
| `uadz5mtq` | 三角形的中线 | minimal | 复用教材 Case 06 | 无需新增 L0 |
| `btsumce2` | 三角形的高/垂心 | typical | 复用教材 Case 07 | 三类三角形需阶段化，不是新原语 |
| `dfuhbga8` | 三角形外角定理 | boundary | 下一批 | `PolyLine` 应先做别名/折线语义复核 |
| `zfcdvmkr` | 三角形角平分线 | typical | 复用教材 Case 05、30 | 无需新增 L0 |
| `ttsejkbj` | 为什么没有 SSA | typical | 新增 RESEARCH 05 | 现有圆线交点 + 条件显隐足够 |
| `cuvejxbu` | 一线三等角 | typical | 下一批 | 现有 transform + 全等标记足够，主要是 authoring 复杂度 |
| `dgyvee2j` | 两个等边三角形手拉手 | typical | 下一批 | 需要验证旋转联动，不预增接口 |
| `qpara9vh` | 正方形/等腰三角形手拉手 | typical | 下一批 | 组合复杂度高，无明确 L0 缺口 |
| `jeeyncug` | 阿波罗尼斯定比圆 | minimal | 新增 RESEARCH 06 | 动态表达式圆心/半径已有能力足够 |
| `ywsrzskb` | 阿氏圆（符号轨迹） | boundary | 保留边界 | `LocusEquation` 属符号轨迹边界 |
| `uxvats2p` | 二次函数弓形三角形 | boundary | 先复核 | `CurveCartesian` 优先映射现有曲线接口 |
| `ugpmemtd` | 弓形面积最小 | boundary | 保留边界 | 真实缺口为确定性 `locus.trace`，另含 imported Macro |

先前用 `xj2v8jyb` 完成的“三角形内角和条件证明”作为本波的 P0 基础样本，已验证 Boolean Control 与 `visibleWhen`，不在 12 个自动选样中重复计数。

## 新增原创资产

### RESEARCH 05：SSA 不唯一

- 用一条直线与定半径圆的两个交点，构造共享 AB、共享 ∠B、且 AC=AD 的两个三角形。
- `equal_length`、`equal_angle` 通过，但第三边数值不相等，从而形成可机器验证的反例。
- 第二个解由 checkbox + `visibleWhen` 显示；没有案例专用渲染分支。

### RESEARCH 06：阿波罗尼斯定比圆

- 用 `point.from_expressions` 构造定比圆圆心，用 `circle.center_radius` 的安全表达式构造动态半径。
- P 是圆上的路径点；拖动 P 或修改 k 后，断言 `PA/PB=k` 始终成立。
- 圆心构造由条件显隐控制，长推导放在教学阶段，不堆入主图。

## 本次暴露并处理的能力缺口

1. **Gallery host adapter 不理解 checkbox**：MathDocument 已声明 checkbox，但 Gallery 之前统一渲染为按钮。本批补成原生 checkbox，并从运行时布尔值同步 checked 状态。这是 host 层缺口，不新增数学命令。
2. **SSA 与定比圆无底层缺口**：它们分别证明“圆线双交点”和“表达式驱动圆”已有足够组合能力；不因源文件动画复杂而增加专用原语。
3. **`PolyLine` / `CurveCartesian` 是映射缺口**：先核对重载并映射折线/参数曲线，不能直接算作新数学内核。
4. **`LocusEquation` 是符号边界**：需要符号消元/隐式曲线，不与确定性采样轨迹混为一谈。
5. **`locus.trace` 是真实底层候选**：输入应是参数化状态与被跟踪点，输出是有界、确定性采样路径；需要定义采样域、步数上限、退化诊断和跨渲染器语义后再实现。

结构化记录见 [`../qiu-feng-wave-01-gap-ledger.json`](../qiu-feng-wave-01-gap-ledger.json)。
