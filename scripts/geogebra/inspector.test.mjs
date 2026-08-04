import assert from "node:assert/strict";
import test from "node:test";
import { inspectGgb, readZipEntries } from "./inspector.mjs";
import { buildCapabilityPlan } from "./planner.mjs";

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(value);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(centrals.length, 8);
  eocd.writeUInt16LE(centrals.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, eocd]);
}

test("offline inspector extracts construction, controls, animation, macros and redacted scripts", () => {
  const ggb = storedZip({
    "geogebra.xml": `<?xml version="1.0"?>
      <geogebra version="6.0" app="geometry">
        <euclidianView/><spreadsheetView/>
        <macro cmdName="InlineTool" toolName="Inline Tool"><input a0="A"/><output a0="B"/></macro>
        <construction>
          <element type="point" label="A"><show object="true"/></element>
          <element type="numeric" label="t">
            <slider min="0" max="2" width="220" horizontal="true"/>
            <animation step="0.02" speed="1" type="1" playing="true"/>
          </element>
          <element type="boolean" label="showPieces"/>
          <element type="button" label="reset"><ggbscript val="SetValue[t,0]"/></element>
          <javascript>function update(){ return 1; }</javascript>
          <command name="Rotate"/><command name="Sequence"/><command name="SetValue"/><command name="MysteryCommand"/>
        </construction>
      </geogebra>`,
    "geogebra_macro.xml": `<geogebra><macro cmdName="RotationArrow" toolName="Rotation Arrow"><input a0="A" a1="B"/><output a0="arrow"/></macro></geogebra>`,
    "geogebra_javascript.js": "function ggbOnInit(){ applet.setValue('t', 0); }",
    "geogebra_thumbnail.png": Buffer.from([9, 8, 7]),
    "images/icon.png": Buffer.from([1, 2, 3, 4])
  });
  const manifest = inspectGgb(ggb, { fileName: "motion.ggb", materialId: "demo123" });
  assert.equal(manifest.schema, "famtutor.geogebra.manifest.v1");
  assert.equal(manifest.source.materialId, "demo123");
  assert.equal(manifest.construction.elements.total, 4);
  assert.equal(manifest.construction.commands.total, 4);
  assert.equal(manifest.construction.controls.sliders[0].label, "t");
  assert.equal(manifest.construction.controls.checkboxes[0].label, "showPieces");
  assert.equal(manifest.construction.controls.buttons[0].label, "reset");
  assert.equal(manifest.construction.animations[0].playing, true);
  assert.deepEqual(manifest.macros.map(macro => macro.commandName), ["InlineTool", "RotationArrow"]);
  assert.deepEqual(manifest.macros[1].inputLabels, ["A", "B"]);
  assert.deepEqual(manifest.macros[1].outputLabels, ["arrow"]);
  assert.equal(manifest.scripts.length, 3);
  assert.equal(manifest.scripts.every(script => script.redacted === true), true);
  assert.equal(JSON.stringify(manifest).includes("SetValue[t,0]"), false);
  assert.equal(manifest.security.scriptsExecuted, false);
  assert.equal(manifest.preview.thumbnail.bytes, 3);
  assert.deepEqual(manifest.capabilityTags, ["animation", "custom_tool", "geometry", "script", "sequence", "simulation", "spreadsheet", "transform"]);
  assert.equal(manifest.engineMapping.exact.some(item => item.command === "Rotate"), true);
  assert.equal(manifest.engineMapping.gaps.some(item => item.requiredCapability === "declarative_sequence"), true);
  assert.equal(manifest.engineMapping.gaps.some(item => item.requiredCapability === "control_action"), true);
  assert.deepEqual(manifest.engineMapping.unknown, [{ command: "MysteryCommand", count: 1 }]);
});

test("ZIP reader rejects traversal before extracting archive content", () => {
  const unsafe = storedZip({ "../escape.txt": "nope", "geogebra.xml": "<geogebra/>" });
  assert.throws(() => readZipEntries(unsafe), error => error.code === "GGB_UNSAFE_ENTRY_PATH");
});

test("public index planner counts valuable mechanism candidates without downloading resources", () => {
  const plan = buildCapabilityPlan({
    schema: "famtutor.geogebra.public-corpus-index.v0.2",
    generated_at: "2026-08-04T00:00:00Z",
    profile: { username: "example" },
    coverage: { scope_label: "test" },
    books: [{ id: "book1" }],
    book_entries: [{ entry_title: "A" }, { entry_title: "B" }],
    known_materials: [{ material_id: "m1" }, { material_id: "m2" }],
    capability_counts_unique_titles: { sequence: 2, animation: 1, geometry: 1 },
    command_script_evidence: [{ material_id: "m1", confidence: "explicit", commands: ["Sequence"], scripts: [], custom_tools: [] }],
    unique_book_entries: [
      { title: "A", normalized_title: "a", known_material_ids: ["m1"], domains: ["math.geometry"], capability_tags: ["sequence", "geometry"], books: [{ book_id: "book1", book_title: "Book" }] },
      { title: "B", normalized_title: "b", known_material_ids: [], domains: ["math.general"], capability_tags: ["sequence"], books: [{ book_id: "book1", book_title: "Book" }] },
      { title: "C", normalized_title: "c", known_material_ids: ["m2"], domains: ["math.general"], capability_tags: ["animation"], books: [{ book_id: "book1", book_title: "Book" }] }
    ]
  });
  assert.equal(plan.summary.uniqueTitles, 3);
  assert.equal(plan.summary.knownMaterials, 2);
  assert.equal(plan.summary.mechanismCandidates, 2);
  assert.equal(plan.summary.mechanismMaterialIds, 2);
  assert.equal(plan.summary.evidenceMaterialIds, 1);
  assert.equal(plan.summary.explicitEvidenceMaterialIds, 1);
  assert.equal(plan.summary.scriptsMayExecute, false);
  assert.equal(plan.capabilityCoverage.find(item => item.tag === "sequence").knownIdTitles, 1);
  assert.equal(plan.topCandidates[0].title, "A");
  assert.deepEqual(plan.topCandidates[0].inferredResearchTracks, ["sequence"]);
  assert.equal(plan.legalGate.rawDownloadsCommitted, false);
});
