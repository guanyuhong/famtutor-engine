# GeoGebra Math 9–12 Wave 04

本批新增四个原创垂直素材：解二元线性不等式、线性不等式组、解非线性方程组与不等式组、用求根公式解二次方程。来源只采用 GeoGebra Math 公开标题、目标与 URL；其中官网明确把高中 `Solving Linear Inequalities` 定义为二元线性不等式。

底层审计结论是零新增 L0。单个与多个不等式使用既有 `function.explicit`、`region.function_inequality`、测试点和布尔合取；函数交点使用差函数、`point.function_root` 与 `point.from_expressions`；二次公式使用标量、函数与点表达式。`region.intersection`、`solution-set-1d`、通用 `all-function-roots` 和专用 `quadratic.roots` 均因缺少明确下游消费或完备失败语义而继续延后。

真实 Gallery 视觉验收暴露并修正了 `region.function_inequality` 的通用 JSXGraph 缺口：用于有限域填充的裁剪侧边不再显示，区域填充本体不再重复承担标签，只有函数曲线表示数学边界。Direct SVG 原有“填充无描边 + 独立边界曲线”语义保持不变，并新增回归断言。

验收覆盖文档求值、数学断言、代表性测试点 sweep、Direct SVG、MountedRenderer/JSXGraph、三阶段切换和 Render Bundle。Gallery 中对应 RESEARCH 40–43；最终为 84 / 84 挂载、83 accepted、1 expected-unsupported，控制台无错误或警告。
