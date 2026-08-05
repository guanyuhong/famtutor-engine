# GeoGebra 能力研究与 FamTutor 复现流程

## 目标

GeoGebra 资源用于发现可复用的数学语义、交互机制、动画状态和视觉表达，不作为运行时依赖，也不直接转换成某个 Case 的硬编码绘图。研究结果必须回到 FamTutor 的公开底层接口，并遵循 `AGENTS.md` 中“底层能力优先、通用但克制、跨渲染器一致”的原则。

当前工具只做离线静态检查：`.ggb` 中的 GGBScript 和 JavaScript 只记录作用域、语言、字节数与 SHA-256，不执行、不复制源码。

## 可得到什么

对 `pegasusroe_geogebra_public_corpus_index_v0.2.json` 的确定性分析结果：

| 数据层 | 数量 | 用途 |
| --- | ---: | --- |
| Books | 35 | 确认主题与重复使用范围 |
| 原始目录行 | 784 | 保留来源位置 |
| 归一化唯一标题 | 417 | 去重后的研究全集 |
| 已知资源 | 196 IDs | 可进入授权与本地取样检查 |
| 有已知 ID 的标题 | 155 / 417（37.17%） | 当前可定位的作品 |
| 命令/脚本证据 | 12 条；9 IDs；其中 8 IDs 为 explicit | 高置信机制入口 |
| 第一轮机制候选 | 73 个标题；67 IDs | sequence、simulation、custom tool、animation、transform、geometry 的并集 |

高价值机制覆盖：

| 机制 | 有 ID / 标题 | 覆盖率 | 当前 FamTutor 状态 | 最小新增能力 |
| --- | ---: | ---: | --- | --- |
| sequence | 9 / 11 | 81.82% | 缺失 | 声明式 repeat / sequence / zip |
| simulation | 4 / 5 | 80.00% | 仅离线阶段 | 确定性 clock、play/pause/reset、轨迹与观测量 |
| custom tool | 5 / 7 | 71.43% | 有 macro core | 带版本和签名的 macro package |
| animation | 7 / 13 | 53.85% | slider autoplay | 通用 control/action 协议与确定性时钟 |
| transform | 10 / 21 | 47.62% | 2D 较强 | 先复用；只在重复案例要求时补矩阵变换 |
| geometry | 50 / 145 | 34.48% | 较强 | 仅从反复出现的原子缺口扩展 |

这意味着第一轮不需要穷举 417 个标题。67 个机制资源构成候选池；优先检查其中证据明确、跨 Book 复用或同时覆盖多个机制的 12 个资源，再以 6 个机制基准案例驱动 API 设计。

## 流程与安全边界

```text
公开索引
  -> 授权/用途检查
  -> 本地、忽略提交的 .ggb 样本
  -> 离线安全检查器
  -> famtutor.geogebra.manifest.v1
  -> 命令映射：exact / gap / unknown
  -> 人工确认“数学语义与教学意图”
  -> 新增或复用最小底层能力
  -> 原创 CaseSpec + 跨渲染器与证据回归
```

检查器具备以下约束：

- ZIP 路径穿越、重复路径、加密、ZIP64、多磁盘与不支持的压缩方式直接拒绝；
- 限制归档大小、条目数、单条目大小、总解压大小与 XML 大小；
- 校验 CRC32，记录整个归档及每个条目的 SHA-256；
- 提取元素、命令、控件、动画、视图、宏签名、缩略图和素材清单；
- `geogebra.xml` 与 `geogebra_macro.xml` 中的宏都会识别；
- 脚本永不执行，Manifest 也不含脚本正文；
- 不提供下载器，原始 `.ggb` 不提交到仓库。

GeoGebra 官方说明 `.ggb` 是 ZIP 容器，核心文件包括 `geogebra.xml`，也可包含 JavaScript、宏和缩略图。使用资源前还必须依据作者许可和实际使用场景复核 [GeoGebra File Format](https://geogebra.github.io/docs/reference/en/File_Format/)、[GeoGebra License](https://www.geogebra.org/license) 与 [Terms of Service](https://www.geogebra.org/tos)。

## 使用

生成一个本地 Manifest：

```bash
npm run geogebra:inspect -- /absolute/path/example.ggb \
  --material-id exampleId \
  --source-url https://www.geogebra.org/m/exampleId \
  --output /private/tmp/example.manifest.json
```

从公开索引生成可复现的能力规划：

```bash
npm run geogebra:plan -- \
  /absolute/path/pegasusroe_geogebra_public_corpus_index_v0.2.json \
  --top 50 \
  --output /private/tmp/geogebra-capability-plan.json
```

Manifest 契约位于 `scripts/geogebra/famtutor.geogebra.manifest.v1.schema.json`。

## 第一轮能力建设

按底层依赖排序，而不是逐作品仿制：

1. **Control / Action（已实现首版）**：声明式按钮与受限 scalar/stage/clock 动作；事件可审计、可重放，不执行任意脚本。基准资源：中国剩余定理 `esztrerw`。
2. **Deterministic Clock（已实现首版）**：统一 play/pause/reset/step 与固定逻辑步；同一初态和动作序列得到同一状态。基准资源：三角形内角和 `GqrfqFBB`、科氏力 `gtdhuqdq`。
3. **Declarative Sequence**：用受限表达式生成同类实体，支持 repeat / sequence / zip，设数量上限和确定性 ID。基准资源：谢尔宾斯基三角形 `wEkG5mAm`、Bezier Curve `CKPUxFfh`。
4. **Macro Package**：复用现有宏内核，增加显式输入/输出签名、版本、依赖和允许命令集合；不导入任意脚本。基准资源：Bezier `CKPUxFfh`、RotationArrow `xKqy8t59`。
5. **Boolean Region**：为相交、并、差增加真正的数学 Region 实体，并保持 Direct SVG 与 JSXGraph 一致。基准资源：两椭圆交集 `XmvnxSZT`。
6. **Data Binding**：在前五项稳定后再增加轻量 DataTable，使数列/试算表驱动图形，但不复制完整电子表格。基准资源：费氏螺旋 `HY2S86EG`。

矩阵、3D 和地图不进入第一轮底层实现。矩阵只在 2D 变换无法组合表达时补充；3D 与地图需要独立 renderer adapter，禁止在 JSXGraph Case 中做特例。

## 每个样本的完成定义

每个选中的 `.ggb` 最终形成一条研究记录：

- 来源、资源 ID、作者/许可状态与文件哈希；
- Manifest 和未映射命令清单；
- `supported_exact`、`composable_existing`、`needs_atomic_capability`、`unsafe_script`、`specialized_renderer` 分类；
- 教学意图、输入状态、关键帧和数学不变量；
- 是否新增底层 API 及其通用性论证；
- 原创 FamTutor CaseSpec；
- 数学断言、确定性重放、Direct SVG、MountedRenderer、JSXGraph 与 Bundle 回归结果。

只有重复出现且无法由现有实体组合表达的缺口，才能成为新底层接口。
