# Sequence / Zip 与 Imported Macro Wave 02

本轮针对 Wave 01 的两个最高价值缺口：Steiner Chain 的动态集合，以及 Sierpiński Triangle 的嵌套 Custom Tool。原始 `.ggb` 仍只在临时目录离线检查；仓库保存结构 Manifest、原创机制 Case 和可复用接口。

## 结果

| Material | 原覆盖 | 本轮覆盖 | 关闭的缺口 | FamTutor 资产 |
|---|---:|---:|---|---|
| `m8SXgrNh` Steiner Chain | 9 / 12 | **12 / 12** | `Sequence ×1`、`Zip ×2` | `collection.sequence`、`collection.map`、RESEARCH 03 |
| `wEkG5mAm` Sierpiński Triangle | 9 / 25 | **25 / 25** | `Tri ×12`、`工具2 ×4` | imported Macro DAG、`macro.polygon.medial_subdivision`、RESEARCH 04 |

两个 Manifest 均为 **0 gap / 0 unknown**。

## 可复用能力

1. `collection.sequence`：按有界数值序列执行一个已有单输出 L0 模板；支持动态 n，最大 256 项。
2. `collection.map`：逐项执行一个已有单输出 L0 模板；当前同质二维集合类型为 point / segment / circle / polygon。
3. Direct SVG 与 Mounted JSXGraph 都直接消费同一个 `collection` RuntimeValue，不在案例层复制几何对象。
4. Inspector 读取 `geogebra_macro.xml` 内部 construction，分离原子命令和 Custom Tool 调用，检测循环并估算完全展开规模。
5. `macro.polygon.medial_subdivision(A,B,C)` 把 `Tri` 降级为三个 midpoint 与一个 polygon；三层 Sierpiński 是 13 次同一 Macro 的组合。

## 实际 Macro DAG

- `Tri`：5 条原始 GeoGebra 命令，全部可映射；核心 FamTutor Recipe 为 3 × `point.midpoint` + 1 × `polygon.vertices`。
- `工具2`：17 条直接命令，其中调用 `Tri ×12`；完全展开估算为 **65 条 GeoGebra 命令**，0 unresolved。
- 主工作表：调用 `Tri ×12`、`工具2 ×4`，现在都标记为 `imported-macro:*` exact mapping。

## 安全边界

- Collection 模板禁止调用 `collection.*`，因此不会产生运行时递归。
- 外部依赖必须显式出现在 construction inputs，仍由 DAG 排序和循环检测管理。
- `maxItems` 超限、模板类型不符、局部变量冲突均失败关闭并返回结构化诊断。
- Imported Macro 只解析 XML 构造关系，不执行 GGBScript 或 JavaScript。
