# “秋风”Theorem / Transform Wave 09

本批完成四个基础定理与变换资源的原创同构：

| 资源 | 案例 | 核心关系 |
| --- | --- | --- |
| `eb5zzh3j` | RESEARCH 23 | 反射把折线和转化为直线段，确定最短路径 |
| `sw7nbppf` | RESEARCH 24 | 三边正方形面积满足 `a²+b²=c²` |
| `kguph7a6` | RESEARCH 25 | 单顶点 `n−3` 条、全部 `n(n−3)/2` 条对角线 |
| `eugqchbb` | RESEARCH 26 | 平移、翻折、旋转保持长度、角度和全等关系 |

## 新增底层能力

- `polygon.regular(center, radius, vertexCount)`：生成 3～64 边的有界规则多边形，必须声明 `maxVertices`。
- `polygon.diagonals(polygon)`：生成全部或指定顶点发出的对角线集合，必须声明 `maxItems`。
- 两个原子均采用严格整数、索引和数量上限；Direct SVG 与 Mounted JSXGraph 使用相同求值结果。

这解决了动态 n 边形无法从点列形成可测量多边形、Case 层不得枚举多套图形的问题。GeoGebra `First` 在此资源中是选择首个顶点的表现手段，映射为 `fromVertex: 0`，不新增通用列表切片接口。

## 复用结论

- 最短路径复用反射、直线交点、距离测量和路径参数，不新增“最短路径”专用命令。
- 勾股证明复用表达式点、多边形面积和直角标记，不新增“勾股定理”专用命令。
- 平移、翻折和旋转复用现有三个刚体变换；源资源中的 `Stretch` 只调整展示位置，不属于定理语义。
- 四个案例都对关键参数做多点 sweep，退化或越界状态继续失败关闭。
