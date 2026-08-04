import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const PATTERN_ROOT = new URL("../../research/geogebra/patterns/", import.meta.url);

test("geometry patterns are sourced, non-executable and structurally complete", async () => {
  const names = (await readdir(PATTERN_ROOT)).filter(name => name.endsWith(".pattern.json")).sort();
  assert.equal(names.length >= 3, true);
  const ids = new Set();
  for (const name of names) {
    const raw = await readFile(new URL(name, PATTERN_ROOT), "utf8");
    const pattern = JSON.parse(raw);
    assert.equal(pattern.schema, "famtutor.geometry.pattern.v1", name);
    assert.match(pattern.patternId, /^[a-z][a-z0-9.-]+$/);
    assert.equal(ids.has(pattern.patternId), false, pattern.patternId);
    ids.add(pattern.patternId);
    assert.equal(pattern.sourceResearch.sourceUrl, `https://www.geogebra.org/m/${pattern.sourceResearch.materialId}`);
    assert.equal(pattern.construction.length > 0, true);
    assert.equal(pattern.invariants.length > 0, true);
    assert.equal(Array.isArray(pattern.famTutorMapping.existingCommands), true);
    assert.equal(pattern.evidence.scriptsExecuted, false);
    assert.equal(/<ggbscript|<javascript|function\s+ggbOnInit/i.test(raw), false);
    await access(new URL(pattern.sourceResearch.manifest, new URL(name, PATTERN_ROOT)));
  }
});
