# Circle / Triangle 批量解析 Wave 01

> 后续状态：本报告记录第一轮发现时的覆盖率；`m8SXgrNh` 与 `wEkG5mAm` 的缺口已在 [Wave 02](sequence-macro-wave-02.md) 关闭并达到 12/12、25/25。

本批从公开索引中选择 9 个 A 级 Circle / Triangle 候选。原始 `.ggb` 只在临时目录离线检查；仓库仅保存哈希、结构清单和研究结论，不执行或复制源脚本。

## 结果

| Material | 标题 | 命令覆盖 | 研究结论 | 下一阶段 |
|---|---|---:|---|---|
| `TMTB7pCJ` | 三條線上的三角形 | 15 / 15 | 点、交点、垂线、旋转、角与多边形组成的完整二维机制 | 进入原创复现 |
| `css4XDST` | 三條線上的正三角形 | 12 / 12 | 带单滑块的交点与正三角形构造，现有 clock/control 可承载 | 进入原创复现 |
| `yqMF5VSu` | 最大三角形面積 | 19 / 19 | 中垂线、圆心、交点、角与面积关系均已覆盖 | 进入原创复现 |
| `m8SXgrNh` | Steiner Chain | 9 / 12 | 基本圆、反射、圆心半径已覆盖；缺 `Sequence ×1`、`Zip ×2` | Sequence 首批样本 |
| `VjyumMQh` | 椭圆轨迹 | 8 / 9 | 椭圆、圆、交点已覆盖；`PointIn` 是区域内部点，不等同路径 glider | 设计 `point_in_region` 前保留缺口 |
| `XmvnxSZT` | 两椭圆交集 | 6 / 12 | 依赖 `ineq` 自定义工具 5 次与多项式系数 1 次 | 先解析 imported Macro |
| `wEkG5mAm` | Sierpiński Triangle | 9 / 25 | 16 次调用 `Tri` / `工具2` 自定义工具，主要价值是递归 Macro/Sequence | Macro 语义提取样本 |
| `cmHVCnAy` | 圆锥截痕 | 41 / 51 | 实际是 3D 圆锥、平面截交和球体机制，不应因标题含“圆”误归为二维圆案例 | 转入 3D 专项队列 |
| `wqYQetXz` | 歪斜线与三角形面积 | 24 / 31 | 实际含平面内部点、棱柱与坐标极值 | 转入 3D / 聚合专项队列 |

本批解析后，公开目录中已检查素材从 **3 增至 12**；9 个新增样本全部做到 **0 unknown**，未覆盖部分均已归入明确能力缺口或 imported Macro 语义复核。

## 能力结论

1. `point.projection` 已扩为统一路径最近点语义，覆盖 line / segment / ray / circle / arc / polygon boundary；`PointIn` 表示区域内部自由点，不能错误映射为最近点。
2. 阿波罗尼亚圆样本的 42 个命令现已全部映射；圆反演与 CommonTangents 不再是缺口。
3. Circle / Triangle 标题筛选会混入 3D 和递归资源，后续优先级必须结合 `.ggb` 内部命令，而不是只看标题。
4. 下一轮最有价值的机制样本是 Steiner Chain 的 `Sequence / Zip`，其次是 Sierpiński 的 imported Macro 递归结构。
