#!/usr/bin/env python3
"""Run the real JSXGraph browser adapter in Chromium via Playwright.

The execution environment used by the build sandbox blocks top-level browser
navigation. To keep the test deterministic and network-free, this script loads
all assets into about:blank: JSXGraph is injected as a classic script and the
TypeScript AMD test bundle is executed with a tiny synchronous AMD loader.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(parents=True, exist_ok=True)
AMD_BUNDLE = ARTIFACTS / "runtime.browser.amd.js"
JSXGRAPH = ROOT / "vendor" / "jsxgraph" / "jsxgraphcore.js"

AMD_LOADER = r"""
(() => {
  const definitions = new Map();
  const modules = new Map();
  globalThis.define = (name, deps, factory) => {
    definitions.set(name, { deps, factory });
  };
  globalThis.define.amd = {};
  const load = (name) => {
    if (modules.has(name)) return modules.get(name).exports;
    const definition = definitions.get(name);
    if (!definition) throw new Error(`AMD module not found: ${name}`);
    const module = { exports: {} };
    modules.set(name, module);
    const localRequire = (dependency) => load(dependency);
    const args = definition.deps.map((dependency) => {
      if (dependency === "require") return localRequire;
      if (dependency === "exports") return module.exports;
      if (dependency === "module") return module;
      return load(dependency);
    });
    const returned = definition.factory(...args);
    if (returned !== undefined) module.exports = returned;
    return module.exports;
  };
  globalThis.__famtutorAmdRequire = load;
})();
"""

HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; width: 100%; min-height: 100%; font-family: system-ui, sans-serif; }
    body { background: #f7f8fc; padding: 20px; box-sizing: border-box; }
    h1 { font-size: 24px; margin: 0 0 14px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { background: white; border: 1px solid #e3e6ef; border-radius: 16px; padding: 12px; }
    .card.full { grid-column: 1 / -1; }
    .board { width: 100%; height: 430px; }
    #board3 { height: 620px; }
    #result { white-space: pre-wrap; font: 12px/1.5 ui-monospace, monospace; background: #111827; color: #d1fae5; padding: 14px; border-radius: 12px; margin-top: 16px; }
  </style>
</head>
<body data-status="running">
  <h1>FamTutor Math Runtime — Browser Smoke</h1>
  <div class="row">
    <div class="card"><div id="board1" class="board"></div></div>
    <div class="card"><div id="board2" class="board"></div></div>
    <div class="card full"><div id="board3" class="board"></div></div>
  </div>
  <pre id="result">running…</pre>
</body>
</html>"""


def main() -> int:
    if not AMD_BUNDLE.exists():
        raise RuntimeError(f"Missing AMD bundle: {AMD_BUNDLE}")
    if not JSXGRAPH.exists():
        raise RuntimeError(f"Missing JSXGraph bundle: {JSXGRAPH}")

    geometry = json.loads((ROOT / "examples" / "perpendicular-bisector.json").read_text())
    functions = json.loads((ROOT / "examples" / "function-slider.json").read_text())
    coverage = json.loads((ROOT / "examples" / "command-catalog-coverage.json").read_text())
    amd_source = AMD_BUNDLE.read_text()
    console_messages: list[str] = []
    page_errors: list[str] = []

    with sync_playwright() as playwright:
        launch_kwargs: dict = {
            "headless": True,
            "args": ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
            "timeout": 30_000,
        }
        # Prefer Playwright-managed Chromium. Override with PLAYWRIGHT_CHROMIUM_EXECUTABLE
        # when a system browser is required (for example some sandboxed CI images).
        executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        if executable:
            launch_kwargs["executable_path"] = executable
        browser = playwright.chromium.launch(**launch_kwargs)
        page = browser.new_page(viewport={"width": 1500, "height": 1100}, device_scale_factor=1)
        page.on("console", lambda message: console_messages.append(f"{message.type}: {message.text}"))
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.set_content(HTML, wait_until="domcontentloaded")

        # Load JSXGraph before defining AMD, otherwise UMD detection can choose
        # the AMD branch and defer global JXG creation.
        page.add_script_tag(path=str(JSXGRAPH))
        page.add_script_tag(content=AMD_LOADER + "\n" + amd_source + "\nwindow.FamTutorMath = __famtutorAmdRequire('browser-entry');")

        summary = page.evaluate(
            """async ({ geometry, functions, coverage }) => {
              const runtime = globalThis.FamTutorMath;
              const result = document.querySelector('#result');
              try {
                if (!runtime || typeof runtime.mountJsxGraph !== 'function') throw new Error('Runtime bundle was not loaded');
                if (!globalThis.JXG?.JSXGraph) throw new Error('JSXGraph global was not loaded');
                const validation1 = runtime.validateMathDocument(geometry);
                const validation2 = runtime.validateMathDocument(functions);
                const validation3 = runtime.validateMathDocument(coverage);
                if (validation1.status !== 'valid' || validation2.status !== 'valid' || validation3.status !== 'valid') {
                  throw new Error(`Example validation failed: ${JSON.stringify([validation1, validation2, validation3])}`);
                }
                const first = runtime.mountJsxGraph(document.querySelector('#board1'), geometry);
                const second = runtime.mountJsxGraph(document.querySelector('#board2'), functions);
                const third = runtime.mountJsxGraph(document.querySelector('#board3'), coverage);
                await Promise.all([first.ready, second.ready, third.ready]);
                first.setPoint('P', [0, 3.25]);
                second.setScalar('a', 2.3);
                const p = first.getValue('P');
                const a = second.getValue('a');
                const svg1 = first.exportSvg();
                const svg2 = second.exportSvg();
                const svg3 = third.exportSvg();
                if (!p || p.kind !== 'point2' || Math.abs(p.x) > 1e-5 || Math.abs(p.y - 3.25) > 1e-3) {
                  throw new Error(`Unexpected P: ${JSON.stringify(p)}`);
                }
                if (typeof a !== 'number' || Math.abs(a - 2.3) > 1e-6) throw new Error(`Unexpected slider a: ${a}`);
                if (!svg1.includes('<svg') || !svg2.includes('<svg') || !svg3.includes('<svg')) throw new Error('SVG export missing');
                const thirdReport = third.report();
                if (thirdReport.skippedEntities.length !== 0) throw new Error(`Command catalog renderer skipped: ${JSON.stringify(thirdReport.skippedEntities)}`);
                if (thirdReport.renderedEntities.length < 25) throw new Error(`Command catalog rendered too few entities: ${thirdReport.renderedEntities.length}`);
                const summary = {
                  p,
                  a,
                  first: first.report(),
                  second: second.report(),
                  third: thirdReport,
                  svgLengths: [svg1.length, svg2.length, svg3.length],
                  svgRoots: document.querySelectorAll('svg').length
                };
                result.textContent = JSON.stringify(summary, null, 2);
                document.body.dataset.status = 'passed';
                document.title = 'BROWSER_SMOKE_PASSED';
                return summary;
              } catch (error) {
                result.textContent = error?.stack ?? String(error);
                document.body.dataset.status = 'failed';
                document.title = 'BROWSER_SMOKE_FAILED';
                throw error;
              }
            }""",
            {"geometry": geometry, "functions": functions, "coverage": coverage},
        )

        status = page.locator("body").get_attribute("data-status")
        title = page.title()
        if status != "passed" or title != "BROWSER_SMOKE_PASSED":
            raise RuntimeError(f"Browser status={status}, title={title}")
        if summary["first"]["skippedEntities"] or summary["second"]["skippedEntities"] or summary["third"]["skippedEntities"]:
            raise RuntimeError(f"Browser renderer skipped entities: {summary}")

        (ARTIFACTS / "browser-smoke-dom.html").write_text(page.content())
        (ARTIFACTS / "browser-smoke-summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
        page.screenshot(path=str(ARTIFACTS / "browser-smoke.png"), full_page=True)
        browser.close()

    if page_errors:
        raise RuntimeError("Browser page errors:\n" + "\n".join(page_errors))
    print("Browser smoke passed: real JSXGraph SVG renderer mounted three documents, including all catalog commands.")
    print(f"Summary: {ARTIFACTS / 'browser-smoke-summary.json'}")
    print(f"Screenshot: {ARTIFACTS / 'browser-smoke.png'}")
    if console_messages:
        print("Console:\n" + "\n".join(console_messages))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Browser smoke failed: {error}", file=sys.stderr)
        raise
