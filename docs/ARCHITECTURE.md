# FamTutor Engine Architecture

本文档是 **引擎级** 整体设计。数学领域内部实现见 [`packages/math/docs/ARCHITECTURE.md`](../packages/math/docs/ARCHITECTURE.md)；路线图见 [`ROADMAP.md`](ROADMAP.md)。

## 1. 产品结论（v0.2 主线）

| PR | 状态 | 内容 |
|---|---|---|
| **PR1** 发布基线 | **完成** | TypeScript lockfile、CI、`npm ci && npm run verify`、math 可 pack |
| **PR2** `@famtutor/core` | **完成** | 跨科运行契约；math 实现 `DomainRuntime` |
| **PR3** Live renderer | **完成** | `MountedRenderer` + ChangeSet 画布更新（rebuild） |
| **PR4** Render Bundle | **完成（本版）** | `famtutor.render.bundle.v1` 宿主无关交付包 |

## 2. Artifact / MountedRenderer / RenderBundle 边界

| 概念 | 包 | 是什么 | 不是什么 |
|---|---|---|---|
| **RenderArtifact** | core | 一次 SVG/PNG/JSON 渲染结果 + 真 SHA-256 digest | 不是课程交付包 |
| **MountedRenderer** | core 契约 / math 实现 | 有状态挂载；`applyChangeSet` / interaction / snapshot | 不嵌入 runtime JS；首版策略 `rebuild` |
| **RenderBundle** | core + math | 确定性 JSON：canonical document + requirements + fallback + integrity | 不是 zip；不含 JSXGraph/npm 源码；禁止按 bundle 动态 import |

摘要规则：

- document digest → canonical document UTF-8 bytes
- artifact/asset digest → 解码后 content bytes（`algorithm: "sha256"`）
- bundle integrity → 排除整个 `integrity` 字段后的 canonical bundle bytes

## 3. 目标架构

```text
Agent / Authoring UI
        │
        ├── ChangeSet → MountedRenderer（有状态）
        └── export render-bundle → Host Adapter（CathyGO 自建）
                │
                ▼
        DomainRuntime（无状态） + RuntimeRegistry
```

CathyGO 按 Engine 协议适配；Engine **不**嵌入 `cgo.*`。

## 4. Live MountedRenderer（PR3，已加固）

- destroy 与 apply 共用队列；fingerprint 幂等（同 ID 不同 payload → `IDEMPOTENCY_KEY_REUSED`）
- staging 原子性；`skippedEntities` → `RENDER_INCOMPLETE`
- InteractionAction 规范：`{ type, target?, payload? }`
- 交互权限：`INTERACTION_NOT_ALLOWED`；宿主回调隔离

## 5. 非目标（短期）

zip archive、远程 asset fetch、嵌入 runtime JS、CathyGO adapter、dirty-set reconcile、新学科包。
