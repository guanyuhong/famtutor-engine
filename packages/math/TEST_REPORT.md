# FamTutor Math Runtime v0.3.0 测试报告

- 测试日期：2026-08-03
- 测试对象：`@famtutor/math-runtime@0.3.0` + `@famtutor/core@0.3.0`
- 协议：`famtutor.math.document.v1` + `famtutor.render.bundle.v1`
- 结论：**以本报告对应提交上的 `npm ci && npm run verify` 为准**。

> PR4：host-neutral Render Bundle + PR3 hardening（destroy 队列、fingerprint 幂等、真 SHA-256、staging 原子性、InteractionAction payload）。

## 验证命令

```bash
npm ci
npm run verify
```

## 覆盖

- Node：core hash/bundle + math apply limits / render dimensions / Agent export render-bundle / idempotency conflict
- Schema：document + operations（含 delete oneOf 正负例）+ agent tools + render-bundle
- Browser：既有 JSXGraph smoke + live MountedRenderer（含 SHA-256 known vector、IDEMPOTENCY_KEY_REUSED、bundle payload mount）
- Package smoke：tarball 含 runtime/operations/render-bundle schemas；consumer create/serialize Math bundle

## 诚实边界

- MountedRenderer 仍为 rebuild；不承诺 native object identity / dirty-set
- Bundle v1 为确定性 JSON（非 zip）；禁止从 bundle 动态加载代码
