# GeoGebra Math 9–12 垂直素材

本目录保存从 GeoGebra Math 9–12 来源索引归一化而来的 host-neutral 教学素材。它不复制 GeoGebra Activity、Applet、脚本或 `.ggb`；每套素材只保留可追溯的标题、Topic、教学目标快照，并用 FamTutor Engine 的公开数学接口原创实现。

## Wave 01

首批共 6 套：

1. 函数与函数记号
2. 斜率和截距变化
3. 非线性母函数变换
4. 指数函数的式、图像和关键特征
5. 二次函数作图
6. 二次函数零点

入口文件：

- `material-index.v1.json`：六套素材的稳定索引与 Engine Case 引用；
- `gap-ledger.v1.json`：底层能力结论、关闭项和延期项；
- `materials/*/source-snapshot.json`：来源标题、occurrence、Topic 与核验边界；
- `materials/*/material.json`：教学原子、阶段、测评种子和四维验收状态。

每套素材包含 5 个教学原子、3 个活动阶段和 5 个 quiz seed。quiz seed 是下游评测素材，不等同于 Engine 已完成提交、评分和学习证据闭环。

## 生成与验证

```bash
node scripts/geogebra/generate-math-g9-12-wave-01.mjs
npm run build -w @famtutor/math-runtime
node --test packages/math/test/geogebra-math-g9-g12-wave.test.mjs
```

生成器会升级 RESEARCH 21/22，并确定性生成 RESEARCH 28–31 和本目录的 JSON。专项测试覆盖文档求值、数学断言、参数边界、Direct SVG、Render Bundle，以及索引、来源快照和素材结构的引用完整性。
