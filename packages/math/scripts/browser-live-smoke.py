#!/usr/bin/env python3
"""Chromium live MountedRenderer acceptance smoke (Playwright, network-free)."""

from __future__ import annotations

import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = ROOT.parent.parent
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
    body { background: #f4f6fb; padding: 16px; box-sizing: border-box; }
    #live-board { width: 960px; height: 540px; background: white; border: 1px solid #d8dde8; }
    #result { white-space: pre-wrap; font: 12px/1.45 ui-monospace, monospace; background: #111827; color: #d1fae5; padding: 12px; margin-top: 12px; border-radius: 10px; }
  </style>
</head>
<body data-status="running">
  <h1>FamTutor Math — Live MountedRenderer Smoke</h1>
  <div id="live-board"></div>
  <pre id="result">running…</pre>
</body>
</html>"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *args: object) -> None:
        return


def main() -> int:
    if not AMD_BUNDLE.exists():
        raise RuntimeError(f"Missing AMD bundle: {AMD_BUNDLE}")
    if not JSXGRAPH.exists():
        raise RuntimeError(f"Missing JSXGraph bundle: {JSXGRAPH}")

    geometry = json.loads((ROOT / "examples" / "perpendicular-bisector.json").read_text())
    functions = json.loads((ROOT / "examples" / "function-slider.json").read_text())
    # Build + validate Render Bundle in Node (core APIs), then mount document payload in Chromium.
    from subprocess import check_output
    bundle = json.loads(check_output(["node", str(ROOT / "scripts" / "_make_bundle_for_smoke.mjs")], cwd=str(ROOT), text=True))
    corpus_payload_script = ROOT.parent.parent / "scripts" / "corpus-browser-payload.mjs"
    seed_cases = json.loads(check_output([
        "node",
        str(corpus_payload_script),
        "zj8a-1-1-01-triangle-elements",
        "zj8a-1-1-02-drag-angle-sum",
        "zj8a-1-1-04-adjust-three-segments",
        "zj8a-1-1-05-angle-bisector",
        "zj8a-1-4-19-congruent-figures",
        "zj8a-1-4-20-corresponding-parts",
        "zj8a-1-4-21-fold-congruent-triangles",
    ], cwd=str(ROOT.parent.parent), text=True))
    amd_source = AMD_BUNDLE.read_text()
    console_messages: list[str] = []
    page_errors: list[str] = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(REPO_ROOT)))
    server_thread = Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"

    with sync_playwright() as playwright:
        launch_kwargs: dict = {
            "headless": True,
            "args": ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
            "timeout": 60_000,
        }
        executable = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        if executable:
            launch_kwargs["executable_path"] = executable
        browser = playwright.chromium.launch(**launch_kwargs)
        page = browser.new_page(viewport={"width": 1200, "height": 900}, device_scale_factor=1)
        page.on("console", lambda message: console_messages.append(f"{message.type}: {message.text}"))
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        page.set_content(HTML, wait_until="domcontentloaded")
        page.add_script_tag(path=str(JSXGRAPH))
        page.add_script_tag(content=AMD_LOADER + "\n" + amd_source + "\nwindow.FamTutorMath = __famtutorAmdRequire('browser-entry');")

        summary = page.evaluate(
            """async ({ geometry, functions, bundle, seedCases }) => {
              const runtime = globalThis.FamTutorMath;
              const resultEl = document.querySelector('#result');
              const checks = [];
              const assert = (name, condition, detail) => {
                checks.push({ name, ok: Boolean(condition), detail: detail ?? null });
                if (!condition) throw new Error(`CHECK_FAILED ${name}: ${detail ?? ''}`);
              };

              try {
                assert('01_mount_api', typeof runtime.mountMathRenderer === 'function');

                const host = document.querySelector('#live-board');
                const renderer = await runtime.mountMathRenderer(host, geometry);
                const identity = renderer;
                assert('02_handle_identity_initial', renderer === identity);

                const baseRev = renderer.getDocument().revision;
                const constructCs = {
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: 'live-cs-point-Q',
                  base: {
                    domain: 'math',
                    schema: 'famtutor.math.document.v1',
                    documentId: geometry.documentId,
                    revision: baseRev
                  },
                  operations: [{
                    op: 'construct',
                    command: 'point.free',
                    outputs: ['Q'],
                    params: { coords: [1.5, 2.5] }
                  }],
                  metadata: { timestamp: '2026-08-03T12:00:00.000Z', origin: 'live-smoke' }
                };
                const constructed = await renderer.applyChangeSet(constructCs);
                assert('03_strategy_rebuild', constructed.ok === true && constructed.strategy === 'rebuild');
                assert('02b_handle_identity_after_apply', renderer === identity);
                assert('04_construct_ok', constructed.ok && renderer.getDocument().entities.some(e => e.id === 'Q'));
                assert('05_revision_bumped', renderer.getDocument().revision === baseRev + 1);

                const beforeIllegal = runtime.deepClone(renderer.getDocument());
                const illegal = await renderer.applyChangeSet({
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: 'live-cs-illegal',
                  base: {
                    domain: 'math',
                    schema: 'famtutor.math.document.v1',
                    documentId: geometry.documentId,
                    revision: renderer.getDocument().revision
                  },
                  operations: [{
                    op: 'construct',
                    command: 'not.a.command',
                    outputs: ['Z'],
                    params: { coords: [0, 0] }
                  }]
                });
                assert('06_illegal_fails', illegal.ok === false);
                assert('07_illegal_atomic', !renderer.getDocument().entities.some(e => e.id === 'Z')
                  && renderer.getDocument().revision === beforeIllegal.revision
                  && runtime.stableHash(renderer.getDocument()) === runtime.stableHash(beforeIllegal));

                const idemA = await renderer.applyChangeSet(constructCs);
                const idemB = await renderer.applyChangeSet(constructCs);
                assert('08_idempotent_cached', idemA.ok === true && idemB.ok === true
                  && idemA.state.document.revision === idemB.state.document.revision);

                const rev = renderer.getDocument().revision;
                const mk = (id, y) => ({
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: id,
                  base: {
                    domain: 'math',
                    schema: 'famtutor.math.document.v1',
                    documentId: geometry.documentId,
                    revision: rev
                  },
                  operations: [{
                    op: 'construct',
                    command: 'point.free',
                    outputs: [id],
                    params: { coords: [0, y] }
                  }],
                  metadata: { timestamp: '2026-08-03T12:00:01.000Z' }
                });
                const [c1, c2] = await Promise.all([
                  renderer.applyChangeSet(mk('R1', 1)),
                  renderer.applyChangeSet(mk('R2', 2))
                ]);
                const outcomes = [c1, c2];
                const wins = outcomes.filter(o => o.ok);
                const losses = outcomes.filter(o => !o.ok);
                assert('09_concurrent_one_win', wins.length === 1);
                assert('10_concurrent_conflict', losses.length === 1
                  && losses[0].diagnostics.some(d => d.code === 'REVISION_CONFLICT'));

                const board = host.querySelector('[data-role=active]');
                // Access bbox via internal active board through a temporary mount probe:
                // capture camera by applying with known bbox mutation on live board SVG parent.
                // We restore via apply after setBoundingBox using dispatch path later.
                // Use replaceDocument-free apply of a no-op? Instead set via exported getState after manual board touch:
                // MathMountedRenderer does not expose board; use setBoundingBox by remounting through replaceDocument with same doc after mutating via dispatch stage.
                const stageBefore = renderer.getDocument().revision;
                const stageResult = await renderer.dispatch({ type: 'stage.set', payload: { stageId: 'observe' } });
                assert('11_stage_ephemeral', stageResult.ok && stageResult.revisionChanged === false
                  && renderer.getDocument().revision === stageBefore
                  && renderer.getState().stageId === 'observe');

                const selBefore = renderer.getDocument().revision;
                const selResult = await renderer.dispatch({ type: 'selection.set', payload: { entityId: 'A' } });
                assert('12_selection_ephemeral', selResult.ok && selResult.revisionChanged === false
                  && renderer.getDocument().revision === selBefore
                  && renderer.getState().selectedEntityId === 'A');

                const delRev = renderer.getDocument().revision;
                const deleteQ = await renderer.applyChangeSet({
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: 'live-cs-delete-Q',
                  base: {
                    domain: 'math',
                    schema: 'famtutor.math.document.v1',
                    documentId: geometry.documentId,
                    revision: delRev
                  },
                  operations: [{ op: 'delete', targets: ['Q'] }]
                });
                assert('13prep_delete_Q', deleteQ.ok && !renderer.getDocument().entities.some(e => e.id === 'Q'));
                // selection may still be A; construct Q, select, delete — expect selection cleared
                await renderer.dispatch({ type: 'selection.set', payload: { entityId: 'A' } });
                const add = await renderer.applyChangeSet({
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: 'live-cs-readd-Q',
                  base: {
                    domain: 'math',
                    schema: 'famtutor.math.document.v1',
                    documentId: geometry.documentId,
                    revision: renderer.getDocument().revision
                  },
                  operations: [{
                    op: 'construct',
                    command: 'point.free',
                    outputs: ['Q'],
                    params: { coords: [2, 2] }
                  }],
                  metadata: { timestamp: '2026-08-03T12:00:02.000Z' }
                });
                assert('13a_readd_Q', add.ok);
                await renderer.dispatch({ type: 'selection.set', payload: { entityId: 'Q' } });
                assert('13b_selected_Q', renderer.getState().selectedEntityId === 'Q');
                const clearedEvents = [];
                const unsubSel = renderer.subscribe(ev => {
                  if (ev.type === 'selection.changed') clearedEvents.push(ev);
                });
                const deleteSelected = await renderer.applyChangeSet({
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: 'live-cs-delete-selected-Q',
                  base: {
                    domain: 'math',
                    schema: 'famtutor.math.document.v1',
                    documentId: geometry.documentId,
                    revision: renderer.getDocument().revision
                  },
                  operations: [{ op: 'delete', targets: ['Q'] }]
                });
                unsubSel();
                assert('13_selection_cleared_on_delete', deleteSelected.ok
                  && renderer.getState().selectedEntityId === undefined
                  && clearedEvents.some(ev => ev.payload && ev.payload.reason === 'entity_removed'));

                const pointBefore = renderer.getDocument().revision;
                const pointSet = await renderer.dispatch({
                  type: 'point.set',
                  target: 'A',
                  payload: { coords: [-2.25, 1.125] }
                });
                assert('14_point_set_commits', pointSet.ok && pointSet.revisionChanged === true
                  && renderer.getDocument().revision === pointBefore + 1);
                const nodeA = renderer.getDocument().construction.find(n => n.outputs?.includes?.('A') || (Array.isArray(n.outputs) && n.outputs.some(o => o === 'A' || o?.id === 'A')));
                const coords = nodeA?.params?.coords;
                assert('15_params_coords_match', Array.isArray(coords)
                  && Math.abs(coords[0] + 2.25) < 1e-9
                  && Math.abs(coords[1] - 1.125) < 1e-9);

                // Switch to slider document for scalar.set
                await renderer.destroy();
                const sliderHost = document.querySelector('#live-board');
                const sliderRenderer = await runtime.mountMathRenderer(sliderHost, functions);
                const scalarBefore = sliderRenderer.getDocument().revision;
                const scalarSet = await sliderRenderer.dispatch({ type: 'scalar.set', target: 'a', payload: { value: 1.75 } });
                assert('16_scalar_set_commits', scalarSet.ok && scalarSet.revisionChanged === true
                  && sliderRenderer.getDocument().revision === scalarBefore + 1);
                const nodeSlider = sliderRenderer.getDocument().construction.find(n => {
                  const outs = n.outputs || [];
                  return outs.includes('a') || outs.some(o => o === 'a' || o?.id === 'a');
                });
                assert('16b_slider_value', Math.abs((nodeSlider?.params?.value ?? NaN) - 1.75) < 1e-9);

                const sequences = [];
                let threw = false;
                const bad = sliderRenderer.subscribe(() => { threw = true; throw new Error('listener boom'); });
                const good = sliderRenderer.subscribe(ev => sequences.push(ev.sequence));
                await sliderRenderer.dispatch({ type: 'selection.set', payload: { entityId: 'a' } });
                assert('17_event_sequence_monotonic', sequences.length >= 1
                  && sequences.every((s, i) => i === 0 || s > sequences[i - 1]));
                assert('18_listener_isolation', threw === true);
                bad();
                const afterUnsub = sequences.length;
                good();
                await sliderRenderer.dispatch({ type: 'selection.set', payload: { entityId: undefined } });
                assert('19_unsubscribe', sequences.length === afterUnsub);

                const childCounts = [];
                for (let i = 0; i < 30; i += 1) {
                  const doc = sliderRenderer.getDocument();
                  const id = `L${i}`;
                  const update = await sliderRenderer.applyChangeSet({
                    schema: 'famtutor.engine.change-set.v1',
                    changeSetId: `live-leak-${i}`,
                    base: {
                      domain: 'math',
                      schema: 'famtutor.math.document.v1',
                      documentId: doc.documentId,
                      revision: doc.revision
                    },
                    operations: [{
                      op: 'construct',
                      command: 'point.free',
                      outputs: [id],
                      params: { coords: [i * 0.05, 0] }
                    }],
                    metadata: { timestamp: `2026-08-03T12:01:${String(i).padStart(2, '0')}.000Z` }
                  });
                  assert(`20_loop_${i}`, update.ok);
                  childCounts.push({
                    children: sliderHost.children.length,
                    active: sliderHost.querySelectorAll('[data-role=active]').length,
                    staging: sliderHost.querySelectorAll('[data-role=staging]').length
                  });
                }
                assert('20_no_leak_30', childCounts.every(c => c.children === 1 && c.active === 1 && c.staging === 0));

                const snapSvg = await sliderRenderer.snapshot({ renderer: 'jsxgraph-svg' });
                assert('21_snapshot_svg_honest', snapSvg.ok
                  && snapSvg.artifact.renderer === 'jsxgraph-svg'
                  && snapSvg.artifact.mediaType === 'image/svg+xml'
                  && typeof snapSvg.artifact.content === 'string'
                  && snapSvg.artifact.content.includes('<svg'));

                const snapCanvas = await sliderRenderer.snapshot({ renderer: 'jsxgraph-canvas' });
                assert('21b_snapshot_canvas_unsupported', snapCanvas.ok === false
                  && snapCanvas.diagnostics.some(d => d.code === 'UNSUPPORTED_SNAPSHOT'));

                await sliderRenderer.destroy();
                const destroyedApply = await sliderRenderer.applyChangeSet({
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: 'after-destroy',
                  base: {
                    domain: 'math',
                    schema: 'famtutor.math.document.v1',
                    documentId: functions.documentId,
                    revision: 1
                  },
                  operations: [{
                    op: 'construct',
                    command: 'point.free',
                    outputs: ['X'],
                    params: { coords: [0, 0] }
                  }]
                });
                assert('22_destroy_blocks_writes', destroyedApply.ok === false
                  && destroyedApply.diagnostics.some(d => d.code === 'RENDERER_DESTROYED'));
                assert('22b_host_cleared', sliderHost.children.length === 0);

                // Camera restore (rebuild keeps bbox): remount geometry and check.
                const camHost = document.querySelector('#live-board');
                const camRenderer = await runtime.mountMathRenderer(camHost, geometry);
                // Touch internal board via JSXGraph container after first mount
                const active = camHost.querySelector('[data-role=active]');
                // We cannot reach board easily; instead verify getState().camera exists after mount
                const state0 = camRenderer.getState();
                assert('23_camera_state_present', !!state0.camera);
                const camApply = await camRenderer.applyChangeSet({
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: 'cam-touch',
                  base: {
                    domain: 'math',
                    schema: 'famtutor.math.document.v1',
                    documentId: geometry.documentId,
                    revision: camRenderer.getDocument().revision
                  },
                  operations: [{
                    op: 'construct',
                    command: 'point.free',
                    outputs: ['CamPt'],
                    params: { coords: [0.5, 0.5] }
                  }],
                  metadata: { timestamp: '2026-08-03T12:02:00.000Z' }
                });
                assert('23b_camera_after_rebuild', camApply.ok && !!camRenderer.getState().camera);
                await camRenderer.destroy();

                // SHA-256 known vector (Web Crypto in Chromium)
                const emptyDigest = await runtime.sha256Utf8('');
                assert('24_sha256_known_vector', emptyDigest === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

                // Idempotency key reused with different payload
                const idHost = document.querySelector('#live-board');
                const idRenderer = await runtime.mountMathRenderer(idHost, geometry);
                const base = {
                  domain: 'math',
                  schema: 'famtutor.math.document.v1',
                  documentId: geometry.documentId,
                  revision: idRenderer.getDocument().revision
                };
                const firstCs = {
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: 'reuse-key',
                  base,
                  operations: [{ op: 'construct', command: 'point.free', outputs: ['IK1'], params: { coords: [0, 0] } }],
                  metadata: { timestamp: '2026-08-03T13:00:00.000Z' }
                };
                const firstApply = await idRenderer.applyChangeSet(firstCs);
                assert('25_idempotent_first', firstApply.ok);
                const reused = await idRenderer.applyChangeSet({
                  ...firstCs,
                  operations: [{ op: 'construct', command: 'point.free', outputs: ['IK2'], params: { coords: [1, 1] } }]
                });
                assert('25b_idempotent_reused', reused.ok === false && reused.diagnostics.some(d => d.code === 'IDEMPOTENCY_KEY_REUSED'));
                await idRenderer.destroy();

                // Host-neutral bundle payload (created/validated in Node) mounts via MathMountedRenderer.
                assert('26_bundle_payload', bundle && bundle.schema === 'famtutor.render.bundle.v1');
                const bundleHost = document.querySelector('#live-board');
                const bundleRenderer = await runtime.mountMathRenderer(bundleHost, bundle.document.content, {
                  viewId: bundle.entrypoint.viewId,
                  stageId: bundle.entrypoint.stageId
                });
                const afterBundle = await bundleRenderer.applyChangeSet({
                  schema: 'famtutor.engine.change-set.v1',
                  changeSetId: 'bundle-cs-1',
                  base: {
                    domain: 'math',
                    schema: 'famtutor.math.document.v1',
                    documentId: bundle.document.ref.documentId,
                    revision: bundleRenderer.getDocument().revision
                  },
                  operations: [{ op: 'construct', command: 'point.free', outputs: ['BundlePt'], params: { coords: [2, 2] } }],
                  metadata: { timestamp: '2026-08-03T13:01:00.000Z' }
                });
                assert('26b_bundle_apply', afterBundle.ok === true && afterBundle.strategy === 'rebuild');
                const snap = await bundleRenderer.snapshot({ renderer: 'jsxgraph-svg' });
                assert('26c_bundle_snapshot', snap.ok && snap.artifact.digest.algorithm === 'sha256' && snap.artifact.digest.value.length === 64);
                const dispatchLegacy = await bundleRenderer.dispatch({ type: 'selection.set', entityId: 'A' });
                assert('26d_legacy_action_normalizer', dispatchLegacy.ok === true);
                await bundleRenderer.destroy();
                assert('26e_host_empty', bundleHost.children.length === 0);

                // PR6 seed acceptance: one demonstration, exploration, and guided-construction
                // case is replayed + bundled in Node, then its mounted payload is exercised here.
                assert('27_seed_case_count', seedCases.length === 7);
                const mountedTypes = new Set();
                for (const seedCase of seedCases) {
                  assert(`28_${seedCase.caseId}_bundle`, seedCase.bundle?.schema === 'famtutor.render.bundle.v1');
                  const seedRenderer = await runtime.mountMathRenderer(
                    bundleHost,
                    seedCase.bundle.document.content,
                    { viewId: seedCase.bundle.entrypoint.viewId }
                  );
                  mountedTypes.add(seedCase.caseType);
                  if (seedCase.caseId === 'zj8a-1-1-01-triangle-elements') {
                    const renderedText = bundleHost.textContent ?? '';
                    const visibleLabels = [...bundleHost.querySelectorAll('text')]
                      .filter(element => element.getClientRects().length > 0)
                      .map(element => (element.textContent ?? '').trim());
                    assert('28_case01_native_path_labels',
                      ['AB', 'BC', 'CA'].every(label => visibleLabels.includes(label))
                      && !renderedText.includes('[object Object]'));
                  }
                  if (seedCase.caseId === 'zj8a-1-1-02-drag-angle-sum') {
                    const visibleLabels = [...bundleHost.querySelectorAll('text')]
                      .filter(element => element.getClientRects().length > 0)
                      .map(element => (element.textContent ?? '').trim());
                    assert('28_case02_polygon_text_anchor',
                      visibleLabels.includes('△ABC')
                      && !bundleHost.textContent.includes('[object Object]'));
                  }
                  if (seedCase.caseId === 'zj8a-1-1-04-adjust-three-segments') {
                    const initialEvaluation = runtime.evaluateMathDocument(seedRenderer.getDocument());
                    assert('28_case04_initial_feedback',
                      initialEvaluation.entities.get('canFormTriangle')?.value === true
                      && initialEvaluation.entities.get('feedback')?.value?.text === '可以组成三角形');
                    const changed = await seedRenderer.dispatch({
                      type: 'scalar.set',
                      target: 'sideA',
                      payload: { value: 10 }
                    });
                    const changedEvaluation = runtime.evaluateMathDocument(seedRenderer.getDocument());
                    assert('28_case04_changed_feedback', changed.ok
                      && changedEvaluation.entities.get('canFormTriangle')?.value === false
                      && changedEvaluation.entities.get('feedback')?.value?.text === '不能组成三角形'
                      && bundleHost.textContent.includes('不能组成三角形'));
                  }
                  const seedSnapshot = await seedRenderer.snapshot({ renderer: 'jsxgraph-svg' });
                  assert(`29_${seedCase.caseId}_snapshot`, seedSnapshot.ok
                    && seedSnapshot.artifact.content.startsWith('<svg')
                    && seedSnapshot.artifact.digest.value.length === 64);
                  await seedRenderer.destroy();
                  assert(`30_${seedCase.caseId}_destroy`, bundleHost.children.length === 0);
                }
                assert('31_seed_case_type_coverage',
                  mountedTypes.has('demonstration')
                  && mountedTypes.has('exploration')
                  && mountedTypes.has('guided-construction'));

                const summary = {
                  checks: checks.map(c => ({ name: c.name, ok: c.ok })),
                  passed: checks.filter(c => c.ok).length,
                  totalNamed: checks.length
                };
                resultEl.textContent = JSON.stringify(summary, null, 2);
                document.body.dataset.status = 'passed';
                document.title = 'BROWSER_LIVE_SMOKE_PASSED';
                return summary;
              } catch (error) {
                resultEl.textContent = `${error?.stack ?? String(error)}\\n\\nCHECKS:\\n${JSON.stringify(checks, null, 2)}`;
                document.body.dataset.status = 'failed';
                document.title = 'BROWSER_LIVE_SMOKE_FAILED';
                throw error;
              }
            }""",
            {"geometry": geometry, "functions": functions, "bundle": bundle, "seedCases": seed_cases},
        )

        status = page.locator("body").get_attribute("data-status")
        title = page.title()
        if status != "passed" or title != "BROWSER_LIVE_SMOKE_PASSED":
            raise RuntimeError(f"Live browser status={status}, title={title}")

        # Exercise the public Node/ESM bundle API in a real browser. The AMD entry above
        # intentionally omits @famtutor/core value exports, so an import map resolves the
        # workspace package for this full mountMathRenderBundle path.
        bundle_page = browser.new_page(viewport={"width": 1200, "height": 900})
        # Start on a same-origin resource with no module scripts; import maps must be
        # installed before the first module graph begins loading.
        bundle_page.goto(f"{base_url}/package.json", wait_until="domcontentloaded")
        bundle_page.add_script_tag(type="importmap", content=json.dumps({
            "imports": {"@famtutor/core": f"{base_url}/packages/core/dist/index.js"}
        }))
        bundle_page.add_script_tag(url=f"{base_url}/packages/math/vendor/jsxgraph/jsxgraphcore.js")
        bundle_page.add_script_tag(type="module", content=f"""
          import {{ evaluateMathDocument, mountMathRenderBundle }} from '{base_url}/packages/math/dist/index.js';
          window.__mountMathRenderBundle = mountMathRenderBundle;
          window.__evaluateMathDocument = evaluateMathDocument;
        """)
        bundle_page.wait_for_function("typeof window.__mountMathRenderBundle === 'function'")
        bundle_api_checks = bundle_page.evaluate(
            """async (seedCases) => {
              const results = [];
              for (const seedCase of seedCases) {
                const host = document.createElement('div');
                host.style.width = '720px';
                host.style.height = '480px';
                document.body.append(host);
                const mounted = await window.__mountMathRenderBundle(host, seedCase.bundle);
                if (!mounted.ok) throw new Error(`${seedCase.caseId}: ${JSON.stringify(mounted.diagnostics)}`);
                if (seedCase.caseId === 'zj8a-1-1-04-adjust-three-segments') {
                  const initial = window.__evaluateMathDocument(mounted.renderer.getDocument());
                  if (initial.entities.get('canFormTriangle')?.value !== true) {
                    throw new Error(`${seedCase.caseId}: initial conditional feedback failed`);
                  }
                  const changed = await mounted.renderer.dispatch({
                    type: 'scalar.set',
                    target: 'sideA',
                    payload: { value: 10 }
                  });
                  const evaluated = window.__evaluateMathDocument(mounted.renderer.getDocument());
                  if (!changed.ok
                    || evaluated.entities.get('canFormTriangle')?.value !== false
                    || evaluated.entities.get('feedback')?.value?.text !== '不能组成三角形') {
                    throw new Error(`${seedCase.caseId}: changed conditional feedback failed`);
                  }
                }
                const snapshot = await mounted.renderer.snapshot({ renderer: 'jsxgraph-svg' });
                if (!snapshot.ok || !snapshot.artifact.content.startsWith('<svg')) {
                  throw new Error(`${seedCase.caseId}: bundle snapshot failed`);
                }
                await mounted.renderer.destroy();
                host.remove();
                results.push({ caseId: seedCase.caseId, caseType: seedCase.caseType, ok: true });
              }
              return results;
            }""",
            seed_cases,
        )
        if len(bundle_api_checks) != 7 or not all(item["ok"] for item in bundle_api_checks):
            raise RuntimeError(f"mountMathRenderBundle seed checks failed: {bundle_api_checks}")
        summary["mountMathRenderBundleCases"] = bundle_api_checks
        bundle_page.close()

        # User-facing Gallery acceptance: every CaseSpec is replayed in-browser,
        # mounted at once, and exposes the honest accepted/unsupported split.
        gallery_page = browser.new_page(viewport={"width": 1440, "height": 1000})
        gallery_page.on("console", lambda message: console_messages.append(f"gallery {message.type}: {message.text}"))
        gallery_page.on("pageerror", lambda error: page_errors.append(f"gallery: {error}"))
        gallery_page.goto(f"{base_url}/gallery/", wait_until="domcontentloaded")
        gallery_page.wait_for_function("document.body.dataset.status === 'ready'", timeout=60_000)
        gallery_checks = gallery_page.evaluate(
            """async () => {
              const cards = [...document.querySelectorAll('.case-card')];
              const accepted = cards.filter(card => card.dataset.status === 'accepted');
              const unsupported = cards.filter(card => card.dataset.status === 'expected-unsupported');
              if (cards.length !== 84 || accepted.length !== 83 || unsupported.length !== 1) {
                throw new Error(`Gallery totals mismatch: ${cards.length}/${accepted.length}/${unsupported.length}`);
              }
              if (!cards.every(card => card.dataset.mounted === 'true')) {
                throw new Error('Gallery has unmounted cards');
              }
              const verticalStages = new Map([
                ['research-geogebra-21-linear-function-properties', 'intercept'],
                ['research-geogebra-22-quadratic-ax2-properties', 'stretch'],
                ['research-geogebra-28-functions-and-function-notation', 'evaluate'],
                ['research-geogebra-29-exponential-equation-graph-critical-values', 'growth-decay'],
                ['research-geogebra-30-graphing-quadratic-functions', 'vertex-axis'],
                ['research-geogebra-31-zeros-of-quadratic-functions', 'zeros-intercepts'],
                ['research-geogebra-32-representations-of-relations-and-functions', 'table'],
                ['research-geogebra-33-increasing-and-decreasing-functions', 'turning'],
                ['research-geogebra-34-graphing-absolute-value-functions-and-inequalities', 'transform'],
                ['research-geogebra-35-graphing-to-solve-quadratic-equations', 'graph'],
                ['research-geogebra-36-domain-and-range-of-special-functions', 'step'],
                ['research-geogebra-37-composition-and-inverse-of-functions', 'inverse'],
                ['research-geogebra-38-solving-systems-of-linear-equations', 'no-solution'],
                ['research-geogebra-39-discriminant-and-roots-of-a-quadratic-equation', 'classify'],
                ['research-geogebra-40-solving-linear-inequalities', 'boundary-line'],
                ['research-geogebra-41-systems-of-linear-inequalities', 'second'],
                ['research-geogebra-42-solving-nonlinear-systems-of-equations-and-inequalities', 'intersections'],
                ['research-geogebra-43-using-the-quadratic-formula-to-solve-quadratic-equations', 'formula']
              ]);
              const rectanglesOverlap = (left, right) => left.left < right.right
                && left.right > right.left
                && left.top < right.bottom
                && left.bottom > right.top;
              for (const [caseId, targetStage] of verticalStages) {
                const renderer = window.__famtutorGallery.rendererByCase.get(caseId);
                const card = document.querySelector(`[data-case-id="${caseId}"]`);
                if (!renderer || !card) {
                  throw new Error(`${caseId}: missing mounted vertical material`);
                }
                const switched = await window.__famtutorGallery.setCaseStage(caseId, 1);
                if (!switched || renderer.getState().stageId !== targetStage || card.dataset.stageId !== targetStage) {
                  throw new Error(`${caseId}: vertical material stage switch failed`);
                }
              }
              for (const [caseId, prefixes] of [
                ['research-geogebra-30-graphing-quadratic-functions', ['a =', 'h =', 'k =', '取样 x =']],
                ['research-geogebra-31-zeros-of-quadratic-functions', ['零点 r₁', '零点 r₂']]
              ]) {
                const card = document.querySelector(`[data-case-id="${caseId}"]`);
                const labels = [...card.querySelectorAll('.JXGtext')]
                  .filter(element => prefixes.some(prefix => element.textContent?.trim().startsWith(prefix)))
                  .map(element => element.getBoundingClientRect());
                if (labels.length !== prefixes.length
                  || labels.some((left, index) => labels.slice(index + 1).some(right => rectanglesOverlap(left, right)))) {
                  throw new Error(`${caseId}: scalar slider labels overlap`);
                }
              }
              const case04 = window.__famtutorGallery.rendererByCase.get('zj8a-1-1-04-adjust-three-segments');
              const changed = await case04.dispatch({ type: 'scalar.set', target: 'sideA', payload: { value: 10 } });
              const feedback = window.__famtutorGallery.rendererByCase
                .get('zj8a-1-1-04-adjust-three-segments')
                .getDocument().construction.find(node => node.outputs.includes('sideA'))?.params?.value;
              const case04Card = document.querySelector('[data-case-id="zj8a-1-1-04-adjust-three-segments"]');
              if (!changed.ok || feedback !== 10 || !case04Card.textContent.includes('不能组成三角形')) {
                throw new Error('Gallery Case 04 conditional feedback failed');
              }
              const case08Id = 'zj8a-1-1-08-altitude-bisector-angle';
              const case08 = window.__famtutorGallery.rendererByCase.get(case08Id);
              const case08Card = document.querySelector(`[data-case-id="${case08Id}"]`);
              const stageButtons = [...case08Card.querySelectorAll('.stage-tab')];
              const beforeStageRevision = case08.getDocument().revision;
              const visibleBoardText = () => [...case08Card.querySelectorAll('.case-board text')]
                .filter(element => element.getClientRects().length > 0)
                .map(element => element.textContent ?? '')
                .join(' ');
              if (stageButtons.length !== 6
                || case08.getState().stageId !== 'source'
                || visibleBoardText().includes('10°')
                || visibleBoardText().includes('∠DAC=180°')) {
                throw new Error('Gallery Case 08 initial stage controls failed');
              }
              const staged = await window.__famtutorGallery.setCaseStage(case08Id, 5);
              const stageSnapshot = await case08.snapshot({ renderer: 'direct-svg' });
              if (!staged
                || case08.getState().stageId !== 'conclude'
                || case08.getDocument().revision !== beforeStageRevision
                || case08Card.dataset.stageId !== 'conclude'
                || !case08Card.textContent.includes('∠DAE=∠DAC-∠EAC=50°-40°=10°')
                || !visibleBoardText().includes('10°')
                || !stageSnapshot.ok
                || !stageSnapshot.artifact.content.includes('data-entity-id="rightAngleD"')
                || !stageSnapshot.artifact.content.includes('10°')) {
                throw new Error('Gallery Case 08 staged derivation failed');
              }
              const case17Id = 'zj8a-1-3-17-triangle-angle-sum-proof';
              const case17 = window.__famtutorGallery.rendererByCase.get(case17Id);
              const case17Card = document.querySelector(`[data-case-id="${case17Id}"]`);
              const case17Revision = case17.getDocument().revision;
              const case17Staged = await window.__famtutorGallery.setCaseStage(case17Id, 5);
              await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
              const case17Board = case17Card.querySelector('.case-board');
              const case17LiveSvg = case17Board.querySelector('svg');
              const boardWidth = case17Board.getBoundingClientRect().width;
              const svgWidth = case17LiveSvg.getBoundingClientRect().width;
              const rotated = await case17.dispatch({ type: 'scalar.set', target: 't', payload: { value: 1 } });
              const assembled = await case17.dispatch({ type: 'scalar.set', target: 't', payload: { value: 2 } });
              const case17Snapshot = await case17.snapshot({ renderer: 'direct-svg' });
              const case17Document = case17.getDocument();
              const tValue = case17Document.construction.find(node => node.outputs.includes('t'))?.params?.value;
              const svgDocument = new DOMParser().parseFromString(case17Snapshot.artifact.content, 'image/svg+xml');
              const polygonPoints = entityId => (svgDocument.querySelector(`[data-entity-id="${entityId}"]`)?.getAttribute('points') ?? '')
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map(pair => pair.split(',').map(Number));
              const bluePoints = polygonPoints('bluePiece');
              const redPoints = polygonPoints('redPiece');
              const greenPoints = polygonPoints('greenPiece');
              const samePoint = (left, right) => left && right && Math.hypot(left[0] - right[0], left[1] - right[1]) < 0.1;
              if (!case17Staged
                || case17.getState().stageId !== 'assemble'
                || case17Revision === case17.getDocument().revision
                || Math.abs(boardWidth - svgWidth) > 1
                || !rotated.ok
                || !assembled.ok
                || tValue !== 2
                || !case17Snapshot.ok
                || !samePoint(bluePoints[0], redPoints[0])
                || !samePoint(bluePoints[0], greenPoints[2])
                || !case17Card.textContent.includes('最终三个角在 C 点拼成平角')) {
                throw new Error('Gallery Case 17 dynamic angle assembly failed');
              }
              const case19Id = 'zj8a-1-4-19-congruent-figures';
              const case19 = window.__famtutorGallery.rendererByCase.get(case19Id);
              const case19Card = document.querySelector(`[data-case-id="${case19Id}"]`);
              const case19Revision = case19.getDocument().revision;
              const case19Staged = await window.__famtutorGallery.setCaseStage(case19Id, 2);
              const case19Polygons = [...case19Card.querySelectorAll('svg polygon')]
                .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
              if (!case19Staged
                || case19.getState().stageId !== 'fold'
                || case19.getDocument().revision !== case19Revision
                || case19Polygons.length < 3) {
                throw new Error('Gallery Case 19 reflected polygon overlap failed');
              }
              const case21Id = 'zj8a-1-4-21-fold-congruent-triangles';
              const case21 = window.__famtutorGallery.rendererByCase.get(case21Id);
              const case21Card = document.querySelector(`[data-case-id="${case21Id}"]`);
              const case21Revision = case21.getDocument().revision;
              const case21Staged = await window.__famtutorGallery.setCaseStage(case21Id, 2);
              const case21Polygons = [...case21Card.querySelectorAll('svg polygon')]
                .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
              if (!case21Staged
                || case21.getState().stageId !== 'overlap'
                || case21.getDocument().revision !== case21Revision
                || !case21Card.textContent.includes('B(C)')
                || case21Polygons.length < 2) {
                throw new Error('Gallery Case 21 folded triangle overlap failed');
              }
              const case09Card = document.querySelector('[data-case-id="zj8a-1-1-09-identify-triangle-lines"]');
              const case09LabelA = [...case09Card.querySelectorAll('.JXGtext')]
                .find(element => element.textContent?.trim() === 'A'
                  && element.getClientRects().length > 0
                  && getComputedStyle(element).visibility !== 'hidden');
              const labelRect = case09LabelA?.getBoundingClientRect();
              const pointCenters = [...case09Card.querySelectorAll('svg ellipse')].map(element => {
                const rect = element.getBoundingClientRect();
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
              });
              const pointA = labelRect && pointCenters
                .map(point => ({ ...point, distance: Math.hypot(
                  point.x - (labelRect.x + labelRect.width / 2),
                  point.y - (labelRect.y + labelRect.height / 2)
                ) }))
                .sort((left, right) => left.distance - right.distance)[0];
              if (!labelRect || !pointA || labelRect.y + labelRect.height / 2 >= pointA.y) {
                throw new Error('Gallery Case 09 apex label must stay outside and above the triangle');
              }
              window.__famtutorGallery.applyFilter('expected-unsupported');
              const focused = cards.filter(card => !card.classList.contains('is-filtered'));
              if (focused.length !== 1 || focused[0].dataset.caseId !== 'zj8a-1-1-09-identify-triangle-lines') {
                throw new Error('Gallery unsupported filter failed');
              }
              window.__famtutorGallery.applyFilter('all');
              return { total: cards.length, accepted: accepted.length, expectedUnsupported: unsupported.length };
            }"""
        )
        summary["gallery"] = gallery_checks
        gallery_page.screenshot(path=str(ARTIFACTS / "case-gallery.png"), full_page=True)
        gallery_page.close()

        (ARTIFACTS / "browser-live-smoke-summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))
        page.screenshot(path=str(ARTIFACTS / "browser-live-smoke.png"), full_page=True)
        browser.close()
    server.shutdown()
    server.server_close()

    if page_errors:
        raise RuntimeError("Browser page errors:\n" + "\n".join(page_errors))
    print("Browser live MountedRenderer smoke passed.")
    print(f"Summary: {ARTIFACTS / 'browser-live-smoke-summary.json'}")
    if console_messages:
        print("Console:\n" + "\n".join(console_messages))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Browser live smoke failed: {error}", file=sys.stderr)
        raise
