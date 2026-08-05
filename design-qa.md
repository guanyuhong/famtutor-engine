# CH1-09 GeoGebra 风格 Design QA

## 比较目标

- source visual truth：`docs/design-audit/ch1-09/00-reference-geogebra.png`
- implementation：`docs/design-audit/ch1-09/03-geogebra-source.png` 至 `08-geogebra-conclusion.png`
- 浏览器：Codex in-app Browser，Gallery `CASE 08`
- viewport：`1280 × 720` CSS px；Case 08 画布 `542.8 × 330` CSS px
- 像素：原始参考 `1378 × 548`；实现画布截图 `543 × 330`；浏览器截图为 1 capture pixel / CSS px
- 归一化：参考图按比例缩放到 330 px 高；实现保持 543 × 330；两者用 16 px 中性分隔条组成同一比较输入
- state：参考图为 GeoGebra 风格示例；实现分别检查“来源、已知、角平分线、高、推导、结论”六个教材阶段。二者数学内容不同，因此只比较视觉语言与可读性，不作逐像素版式断言。

## Findings

最终比较没有剩余 P0、P1 或 P2 问题。

- [已修复 P1] A 点嵌套角文本与长推导重叠
  - Location：CASE 08，“结论”阶段，A 点附近。
  - Earlier evidence：`docs/design-audit/ch1-09/02-current-conclusion.png` 中 `10°`、`40°`、`50°` 和长公式叠在同一区域。
  - Fix：画布内删除长推导文本；使用 `radius` / `labelRadius` 分离角弧和角值；单阶段最多显示两个嵌套角；完整公式移入阶段 narration。
  - Post-fix evidence：`docs/design-audit/ch1-09/08-geogebra-conclusion.png` 与 `10-reference-vs-conclusion.png`。`10°` 与 `40°` 可分别读取，没有相互覆盖。

- [已修复 P1] D 点名被直角标记覆盖
  - Location：CASE 08，“高”及后续阶段，D 点。
  - Earlier evidence：用户截图中 D 与直角方框共享右上区域。
  - Fix：新增共享的确定性点标签避让；提供八个 `labelPlacement` 语义锚点和像素 `labelOffset` 微调；D 明确使用 `bottom-left`，直角标记占据右上象限。
  - Post-fix evidence：`docs/design-audit/ch1-09/06-geogebra-altitude.png` 与 `09-reference-vs-altitude.png`。D 位于点的左下方，直角标记完整可见。

- [已修复 P2] 视觉层级与参考风格不一致
  - Location：CASE 08 全部阶段。
  - Earlier evidence：`docs/design-audit/ch1-09/01-current-source.png` 使用蓝色粗线、蓝色点和画布内长标题，几何对象层级偏重。
  - Fix：主轮廓统一为 2.2 px 深色线，点改为红色填充/黑色描边，角弧 1.6 px 白色扇区，画布使用淡黄背景；辅助线使用克制的蓝/绿语义色。
  - Post-fix evidence：`03-geogebra-source.png` 至 `08-geogebra-conclusion.png`。

## Required Fidelity Surfaces

- Fonts and typography：系统无衬线字体，点名为 16 px、角值为 15 px 常规字重；白色描边保证跨线条可读；没有截断或长公式进入画布。根据第二轮反馈，字号调小且标签安全距离进一步增大。
- Spacing and layout rhythm：三角形在 543 × 330 画布内留有稳定边距；点名、角值、直角标记互不覆盖；六阶段相机不跳动。
- Colors and visual tokens：淡黄画布、白色三角形、黑色轮廓、红色点与参考方向一致；蓝/绿辅助线是教学语义增强，不依赖颜色作为唯一信息。
- Image quality and asset fidelity：所有几何对象保持矢量渲染；无位图放大、压缩伪影或替代性占位资产。
- Copy and content：画布只保留点名和角度短文本；教材条件、推导和结论完整保留在阶段 narration。

## Full-view comparison evidence

- 高阶段：`docs/design-audit/ch1-09/09-reference-vs-altitude.png`
- 结论阶段：`docs/design-audit/ch1-09/10-reference-vs-conclusion.png`

这些比较图把参考与实现放入同一 330 px 高画布，足以直接检查线宽、点样式、底色、角弧与标签间距。关键细节在该尺寸下清晰可读，因此不需要另做放大区域比较。

## Interaction and runtime checks

- 已依次点击并渲染六个阶段 tab；阶段 narration 与画布内容同步。
- `stage.reveal` 在 JSXGraph 与 Direct SVG 中采用相同白名单语义。
- 浏览器控制台 warning/error：0。
- 10 个案例 Gallery 正常挂载：9 accepted，1 expected unsupported。

## Implementation checklist

- [x] 背景、线宽、点样式与角扇区接近参考视觉语言
- [x] A 点嵌套角拆阶段并分离标签半径
- [x] D 点名避开直角标记
- [x] 点标签自动避让在 Direct SVG / JSXGraph 共用
- [x] 六阶段浏览器截图与控制台检查
- [x] 数学运行时和 10-case corpus 回归

第二轮视觉微调：点名由 17 px 降至 16 px，角值由 17 px 降至 15 px；点名安全间距增加 2 px；A 点各角值的 `labelRadius` 外移。更新后证据为当前 `06-geogebra-altitude.png`、`07-geogebra-derive.png`、`08-geogebra-conclusion.png`。

## Follow-up polish

- P3：未来可在更窄的移动端画布上增加一次缩放回归，但不影响当前桌面 Gallery 验收。

final result: passed
