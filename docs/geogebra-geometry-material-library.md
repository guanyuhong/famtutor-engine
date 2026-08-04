# GeoGebra 几何素材研究库

## 口径

这里的“素材”首先是可追溯的研究候选，不等同于已经完成的 FamTutor Case，也不等同于可直接复制的图片或 `.ggb` 文件。

一个候选需要依次经过以下状态，才能成为正式素材：

1. `cataloged`：公开索引中找到 material ID，并按 ID 去重；
2. `ggb-inspected`：离线检查 `.ggb`，得到元素、命令、控件、动画、宏和脚本指纹；
3. `semantic-pattern-reviewed`：人工确认数学关系、教学意图和可复用模式；
4. `famtutor-reproduced`：仅通过 FamTutor 公开底层接口完成原创复现；
5. `cross-renderer-verified`：数学断言、Direct SVG、JSXGraph、MountedRenderer 和 Bundle 路径通过。

原始 `.ggb` 不进入仓库；脚本不执行，也不复制到 Manifest。

## 当前盘点

以 `geometry` 能力标签为准：

| 层级 | 数量 | 含义 |
| --- | ---: | --- |
| 几何标题 | 145 | 标题级研究全集，不保证可定位 |
| 有 ID 的标题 | 50 | 可以进入 `.ggb` 取样检查 |
| 唯一 material ID | 47 | 去重后的实际研究工作单元 |
| ID 未知标题 | 95 | 发现线索，不计为可提取素材 |
| `math.geometry` 领域补充线索 | 11 | 不混入 145 的主口径 |

47 个可定位素材按检查优先级分为：

| 优先级 | 数量 | 处理方式 |
| --- | ---: | --- |
| A | 20 | 二维且跨 Book 复用或有显式证据，优先检查 |
| B | 18 | 二维、单一来源，作为家族补充 |
| source review | 1 | Agent 生成内容，先检查来源质量 |
| deferred renderer | 8 | 涉及 3D/空间语义，等待专门渲染器评估 |

几何家族允许多标签，因此数量不能横向相加：三角形 13、圆 9、曲线 8、3D 8、面积 6、作图 5、角/三角 5、圆锥曲线 4、向量 3、轨迹 1，以及暂未细分的通用几何 4。

## 第一批检查队列

第一批优先现有二维能力可以承载的素材；最后保留一个明确底层缺口案例，用来验证素材库是否能反向驱动能力建设。

| ID | 标题 | 家族 | 已知新增依赖 | 跨 Book |
| --- | --- | --- | --- | ---: |
| `cmHVCnAy` | 圆锥截痕 | 圆、圆锥曲线 | 无；需用 XML 确认是否隐含 3D | 6 |
| `f9tcjter` | 三同心圆上的正三角形 | 圆、三角形 | 无 | 3 |
| `kktgdvAH` | 阿波罗尼亚圆 | 圆 | 无 | 3 |
| `TMTB7pCJ` | 三条线上的三角形 | 三角形 | 无 | 2 |
| `css4XDST` | 三条线上的正三角形 | 三角形 | 无 | 2 |
| `yqMF5VSu` | 最大三角形面积 | 面积、三角形 | 无 | 2 |
| `m8SXgrNh` | 史坦纳圆链 | 圆 | 无 | 2 |
| `uEsyxQdV` | 垂足三角形 | 作图、三角形 | 无 | 2 |
| `zPJSKHVC` | 平行四边形面积 | 面积 | 无 | 2 |
| `VjyumMQh` | 椭圆轨迹系列 | 圆锥曲线、轨迹 | 无 | 2 |
| `wqYQetXz` | 歪斜线与三角形面积 | 面积、三角形 | 无 | 2 |
| `XmvnxSZT` | 两椭圆交集 | 圆锥曲线 | `boolean-region` | 5 |

## 素材最终形态

不把每个 GeoGebra Activity 当成一个独立底层 API。每个完成的素材应该拆成四层：

- **Construction pattern**：输入实体、构造 DAG、输出实体和退化条件；
- **Visual recipe**：样式 token、标签策略、角/等长/平行标记和建议视窗；
- **Interaction recipe**：可拖动对象、Control/Action、Clock、阶段和观察量；
- **Teaching case**：教学叙事、问题、断言、证据与来源说明。

其中反复出现、语义稳定的 Construction pattern 才有资格进入底层命令或 Macro Package；仅属于某个教学叙事的部分保留在 Case 层。

## 使用

从公开索引重新生成目录：

```bash
cd /Users/guanyuhong/solo/famtutor-engine
npm run geogebra:geometry-catalog -- \
  /Users/guanyuhong/Downloads/pegasusroe_geogebra_public_corpus_index_v0.2.json \
  --first-wave 12 \
  --output research/geogebra/geometry-material-catalog.v1.json
```

检查一个已获得的本地 `.ggb`：

```bash
npm run geogebra:inspect -- /absolute/path/material.ggb \
  --material-id MATERIAL_ID \
  --source-url https://www.geogebra.org/m/MATERIAL_ID \
  --output research/geogebra/manifests/MATERIAL_ID.manifest.json
```

目录生成器位于 `scripts/geogebra/geometry-catalog.mjs`，协议位于 `scripts/geogebra/famtutor.geogebra.geometry-catalog.v1.schema.json`；确定性输出位于 `research/geogebra/geometry-material-catalog.v1.json`。
