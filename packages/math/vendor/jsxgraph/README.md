# Vendored JSXGraph runtime

This folder contains the browser distribution of JSXGraph 1.12.2 copied from
the CathyGO workspace's installed `jsxgraph` package for deterministic,
offline curriculum previews.

Files:

- `jsxgraphcore.js`
- `jsxgraph.css`
- `LICENSE.MIT`
- `LICENSE.LGPL`

The CGO engine does not fork or modify JSXGraph and does not bundle it in the
`@beanx/cathygo-visual-engine` tarball. Applications inject their existing
`JXG` runtime through `mountScene(..., { jsxgraph: JXG })`; the vendored files
only keep the standalone Gate preview independent from a CDN.
