# GeoGebra mechanism reproductions

这里存放依据 GeoGebra 资源研究出来的**原创 FamTutor 机制复现**。资源 URL 用于说明研究来源；Case 不复制原作品脚本或工作表。

## 资产口径

测试数量不是资产数量。当前 Control / Action + Deterministic Clock 阶段产生：

| 类型 | 数量 | 资产 |
| --- | ---: | --- |
| 文档协议原语 | 2 | `MathControl`、`MathClock` |
| 受限 Action | 6 | `scalar.set`、`stage.set`、clock play/pause/reset/step |
| Agent operations | 2 | `set_control`、`set_clock` |
| MountedRenderer actions | 6 | `control.invoke`、clock play/pause/reset/step，以及已有 `scalar.set` 的组合 |
| 纯状态机 | 1 | 与墙钟无关的 logical clock reducer |
| 通用 Web adapter | 1 | Gallery 根据 `document.controls` 自动生成控制面板 |
| 机制案例 | 4 | 中国剩余定理、三角形内角和（升级）、SSA 不唯一、阿波罗尼斯定比圆 |
| 新增单元测试 | 6 | 终点、alternate、operation/validation、非法引用、滑块边界、机制案例渲染 |

公开索引中的 67 个高价值资源 ID 是**研究候选输入**，不是已经生产出的 67 个 FamTutor 资产。后续应把重复机制归纳成少量底层原语，再由这些原语组合出大量教学案例。

## Web 验收

```bash
cd /Users/guanyuhong/solo/famtutor-engine
npm run gallery
```

打开 <http://127.0.0.1:4173/gallery/>：

1. `RESEARCH 01 · exploration`：点击“选择 7 / 11 / 23 / 清零”，检查模 3、模 5 余数点和反馈文本同步变化；也可拖动整数滑块。
2. `CASE 17 · demonstration`：选择“拼角”阶段，再使用“播放 / 暂停 / 单步 / 复位”。状态栏应显示 `assemblyClock` 的 status、`t` 和逻辑 tick。
3. 动画播放时手动拖动 `t`，时钟应转为 `paused`，证明手动控制优先。

当前 Gallery 会展示 41 个教材 Case 加 27 个机制研究 Case，共 68 张卡片；Case 17 是原教材 Case 的能力升级，不重复计数。RESEARCH 03 验收 Sequence / Zip，RESEARCH 04 验收 Imported Macro DAG，RESEARCH 05/06 验收“秋风”Triangle / Circle 第一批原创同构，RESEARCH 07–09 验收外角定理、一线三等角和等边三角形手拉手，RESEARCH 10/11 验收参数化旋转不变量，RESEARCH 12/13 验收内、外角平分线定理，RESEARCH 14 验收路径点上的角平分线—高夹角不变量，RESEARCH 15–18 验收 SSS/SAS/ASA/AAS 动态全等判定组，RESEARCH 19/20 验收垂直平分线轨迹与等腰三角形性质，RESEARCH 21/22 验收一次函数与 `y=ax²` 的参数、采样点、对称性和条件性质反馈，RESEARCH 23–26 验收轴对称最短路径、勾股面积证明、动态 n 边形对角线和三类刚体变换，RESEARCH 27 验收三角形定义及共线退化边界。

## 几何素材目录

几何素材不按标题直接计数，而是按 material ID 去重，并区分“已编目、已检查、已复现、已验证”。当前主口径为 145 个 geometry 标题、50 个带 ID 标题、47 个唯一 material ID、95 个待定位标题。

- 目录：`geometry-material-catalog.v1.json`
- 已检查 Manifest：`manifests/`
- 已归纳几何 Pattern：`patterns/`
- Circle / Triangle Wave 01：`batches/circle-triangle-wave-01.md`
- Sequence / Imported Macro Wave 02：`batches/sequence-macro-wave-02.md`
- “秋风”章节×机制×家族目录：`qiu-feng-curriculum-mechanism-clusters.v1.json`
- “秋风”Triangle / Circle Wave 01：`batches/qiu-feng-triangle-circle-wave-01.md`
- “秋风”Triangle Wave 02：`batches/qiu-feng-triangle-wave-02.md`
- “秋风”Triangle Wave 03：`batches/qiu-feng-triangle-wave-03.md`
- “秋风”Triangle Wave 04：`batches/qiu-feng-triangle-wave-04.md`
- “秋风”Triangle Wave 05：`batches/qiu-feng-triangle-wave-05.md`
- “秋风”Triangle Wave 06：`batches/qiu-feng-triangle-wave-06.md`
- “秋风”Triangle / Symmetry Wave 07：`batches/qiu-feng-triangle-symmetry-wave-07.md`
- “秋风”Function Wave 08：`batches/qiu-feng-function-wave-08.md`
- “秋风”Theorem / Transform Wave 09：`batches/qiu-feng-theorem-transform-wave-09.md`
- “秋风”First 12 Closure Wave 10：`batches/qiu-feng-first-12-closure-wave-10.md`
- “秋风”能力缺口账本：`qiu-feng-wave-01-gap-ledger.json`
- 设计与第一批队列：`../../docs/geogebra-geometry-material-library.md`

原始 `.ggb` 不提交；Manifest 不含脚本正文，也不执行脚本。
