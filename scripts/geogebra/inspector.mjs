import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

export const GGB_MANIFEST_SCHEMA = "famtutor.geogebra.manifest.v1";

const DEFAULT_LIMITS = Object.freeze({
  maxArchiveBytes: 128 * 1024 * 1024,
  maxEntries: 512,
  maxEntryBytes: 32 * 1024 * 1024,
  maxExpandedBytes: 96 * 1024 * 1024,
  maxXmlBytes: 24 * 1024 * 1024
});

const EXACT_COMMANDS = new Map(Object.entries({
  point: "point.free/point.on_path",
  midpoint: "point.midpoint",
  intersect: "point.intersection_*",
  intersection: "point.intersection_*",
  segment: "segment.through_points",
  line: "line.through_points",
  ray: "ray.from_points",
  orthogonalline: "line.perpendicular_through",
  angularbisector: "macro.ray.angle_bisector",
  linebisector: "macro.line.perpendicular_bisector",
  parallelline: "line.parallel_through",
  perpendicularline: "line.perpendicular_through",
  circle: "circle.*",
  center: "point.circle_center",
  radius: "measurement.circle_radius",
  closestpoint: "point.projection",
  circumcircle: "circle.through_three_points",
  arc: "arc.*",
  circlearc: "arc.center_points",
  circumcirculararc: "arc.three_points",
  sector: "sector.from_arc",
  polygon: "polygon.vertices",
  angle: "angle.three_points/measurement.angle",
  distance: "measurement.distance",
  length: "measurement.segment_length/perimeter",
  area: "measurement.area",
  slope: "measurement.slope",
  ellipse: "conic.ellipse_foci",
  parabola: "conic.parabola_focus_directrix",
  hyperbola: "conic.hyperbola_foci",
  translate: "transform.translate/transform.apply",
  rotate: "transform.rotate/transform.apply",
  reflect: "transform.reflect/transform.apply",
  dilate: "transform.dilate/transform.apply",
  vector: "vector.*",
  curve: "curve.parametric",
  function: "function.explicit"
}));

const GAP_COMMANDS = new Map(Object.entries({
  sequence: "declarative_sequence",
  zip: "declarative_sequence",
  iteration: "declarative_sequence",
  startanimation: "simulation_clock",
  setvalue: "control_action",
  setcolor: "style_action",
  setvisibleinview: "control_action",
  execute: "control_action",
  matrix: "matrix_kernel",
  determinant: "matrix_kernel",
  dimension: "list_data_kernel",
  element: "list_data_kernel",
  surface: "scene3d",
  plane: "scene3d",
  sphere: "scene3d",
  infinitecone: "scene3d",
  intersectpath: "generalized_path_intersection",
  pointin: "point_in_region",
  prism: "scene3d",
  pyramid: "scene3d",
  locus: "locus_trace",
  envelope: "locus_trace",
  integral: "calculus_kernel",
  coefficients: "symbolic_polynomial",
  sum: "declarative_aggregation",
  min: "scalar_aggregation",
  max: "scalar_aggregation",
  binomialcoefficient: "combinatorics_kernel"
}));

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

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertArchive(condition, code, message, details = {}) {
  if (condition) return;
  const error = new Error(message);
  error.code = code;
  error.details = details;
  throw error;
}

function findEndOfCentralDirectory(buffer) {
  const signature = 0x06054b50;
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset;
  }
  return -1;
}

function safeEntryName(name) {
  assertArchive(!name.includes("\0"), "GGB_UNSAFE_ENTRY_PATH", "Archive entry contains NUL bytes.", { name });
  const normalized = name.replaceAll("\\", "/");
  assertArchive(!normalized.startsWith("/") && !/^[A-Za-z]:\//.test(normalized), "GGB_UNSAFE_ENTRY_PATH", "Archive entry is absolute.", { name });
  const parts = normalized.split("/");
  assertArchive(!parts.includes(".."), "GGB_UNSAFE_ENTRY_PATH", "Archive entry escapes its root.", { name });
  return parts.filter(part => part && part !== ".").join("/");
}

export function readZipEntries(input, limits = {}) {
  const resolved = { ...DEFAULT_LIMITS, ...limits };
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  assertArchive(buffer.length <= resolved.maxArchiveBytes, "GGB_ARCHIVE_TOO_LARGE", "Archive exceeds the configured byte limit.", { bytes: buffer.length });
  const eocd = findEndOfCentralDirectory(buffer);
  assertArchive(eocd >= 0, "GGB_INVALID_ZIP", "ZIP end-of-central-directory record was not found.");
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  assertArchive(disk === 0 && centralDisk === 0, "GGB_MULTIDISK_UNSUPPORTED", "Multi-disk ZIP archives are not supported.");
  assertArchive(entryCount !== 0xffff && centralOffset !== 0xffffffff, "GGB_ZIP64_UNSUPPORTED", "ZIP64 archives are not supported.");
  assertArchive(entryCount <= resolved.maxEntries, "GGB_TOO_MANY_ENTRIES", "Archive has too many entries.", { entryCount });
  assertArchive(centralOffset + centralSize <= buffer.length, "GGB_INVALID_ZIP", "Central directory is outside the archive bounds.");

  const entries = new Map();
  let offset = centralOffset;
  let expandedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    assertArchive(offset + 46 <= buffer.length && buffer.readUInt32LE(offset) === 0x02014b50, "GGB_INVALID_ZIP", "Invalid central-directory entry.", { index });
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const expectedCrc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const name = safeEntryName(rawName);
    offset += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith("/")) continue;
    assertArchive((flags & 1) === 0, "GGB_ENCRYPTED_ENTRY", "Encrypted ZIP entries are not supported.", { name });
    assertArchive(method === 0 || method === 8, "GGB_COMPRESSION_UNSUPPORTED", "Only stored and DEFLATE ZIP entries are supported.", { name, method });
    assertArchive(uncompressedSize <= resolved.maxEntryBytes, "GGB_ENTRY_TOO_LARGE", "Archive entry exceeds the configured byte limit.", { name, uncompressedSize });
    expandedBytes += uncompressedSize;
    assertArchive(expandedBytes <= resolved.maxExpandedBytes, "GGB_EXPANSION_LIMIT", "Expanded archive exceeds the configured byte limit.", { expandedBytes });
    assertArchive(localOffset + 30 <= buffer.length && buffer.readUInt32LE(localOffset) === 0x04034b50, "GGB_INVALID_ZIP", "Invalid local ZIP entry.", { name });
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    assertArchive(dataOffset + compressedSize <= buffer.length, "GGB_INVALID_ZIP", "Compressed entry data is outside archive bounds.", { name });
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: resolved.maxEntryBytes });
    assertArchive(data.length === uncompressedSize, "GGB_SIZE_MISMATCH", "Expanded entry size differs from the central directory.", { name, expected: uncompressedSize, actual: data.length });
    assertArchive(crc32(data) === expectedCrc, "GGB_CRC_MISMATCH", "Archive entry failed CRC validation.", { name });
    assertArchive(!entries.has(name), "GGB_DUPLICATE_ENTRY", "Archive contains duplicate normalized paths.", { name });
    entries.set(name, data);
  }
  return entries;
}

function decodeXml(value = "") {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attributes(source) {
  const result = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(pattern)) result[match[1]] = decodeXml(match[3] ?? match[4] ?? "");
  return result;
}

function scanXml(xml, visitors) {
  const pattern = /<\/?([A-Za-z_][\w:.-]*)([^<>]*?)\/?\s*>/g;
  for (const match of xml.matchAll(pattern)) {
    const raw = match[0];
    const closing = raw.startsWith("</");
    const selfClosing = /\/\s*>$/.test(raw);
    const name = match[1];
    if (closing) visitors.close?.(name, match.index);
    else visitors.open?.(name, attributes(match[2]), { selfClosing, index: match.index, raw });
  }
}

function increment(record, key) {
  record[key] = (record[key] ?? 0) + 1;
}

function booleanAttribute(value) {
  return value === "true" || value === "1";
}

function orderedAttributeValues(attrs) {
  return Object.entries(attrs)
    .sort(([left], [right]) => {
      const leftIndex = Number(left.replace(/^\D+/, ""));
      const rightIndex = Number(right.replace(/^\D+/, ""));
      return leftIndex - rightIndex || left.localeCompare(right);
    })
    .map(([, value]) => value)
    .filter(value => value !== "");
}

function parseConstructionXml(xml, fileName) {
  const result = {
    fileName,
    format: {},
    elements: { total: 0, byType: {}, inventory: [] },
    commands: { total: 0, byName: {}, signatures: [] },
    controls: { sliders: [], checkboxes: [], buttons: [], inputs: [] },
    animations: [],
    scripts: [],
    views: { euclidian2d: 0, euclidian3d: 0, spreadsheet: 0, algebra: 0 },
    warnings: []
  };
  let currentElement;
  let currentCommand;
  scanXml(xml, {
    open(name, attrs, token) {
      const lowered = name.toLowerCase();
      if (lowered === "geogebra") result.format = { version: attrs.version, app: attrs.app, subApp: attrs.subApp };
      if (lowered === "element") {
        currentElement = { label: attrs.label, type: attrs.type ?? "unknown", hasSlider: false };
        result.elements.total += 1;
        increment(result.elements.byType, currentElement.type);
        result.elements.inventory.push({ label: currentElement.label, type: currentElement.type });
        if (currentElement.type === "boolean") result.controls.checkboxes.push({ label: currentElement.label, type: currentElement.type });
        if (currentElement.type === "button") result.controls.buttons.push({ label: currentElement.label, type: currentElement.type });
        if (["textfield", "inputbox"].includes(currentElement.type?.toLowerCase())) result.controls.inputs.push({ label: currentElement.label, type: currentElement.type });
      } else if (lowered === "command") {
        const command = attrs.name ?? "unknown";
        result.commands.total += 1;
        increment(result.commands.byName, command);
        currentCommand = { name: command, inputs: [], outputs: [] };
        result.commands.signatures.push(currentCommand);
      } else if (lowered === "input" && currentCommand) {
        currentCommand.inputs.push(...orderedAttributeValues(attrs));
      } else if (lowered === "output" && currentCommand) {
        currentCommand.outputs.push(...orderedAttributeValues(attrs));
      } else if (lowered === "slider" && currentElement) {
        currentElement.hasSlider = true;
        result.controls.sliders.push({
          label: currentElement.label,
          min: attrs.min,
          max: attrs.max,
          width: attrs.width,
          horizontal: attrs.horizontal === undefined ? undefined : booleanAttribute(attrs.horizontal)
        });
      } else if (lowered === "animation" && currentElement) {
        result.animations.push({
          label: currentElement.label,
          step: attrs.step,
          speed: attrs.speed,
          type: attrs.type,
          playing: booleanAttribute(attrs.playing)
        });
      } else if (lowered.includes("script")) {
        const content = attrs.val ?? attrs.script ?? "";
        if (!content) return;
        result.scripts.push({
          scope: currentElement ? "object" : "document",
          label: currentElement?.label,
          language: lowered.includes("java") ? "javascript" : "ggbscript",
          event: attrs.event,
          bytes: Buffer.byteLength(content),
          sha256: sha256(Buffer.from(content)),
          redacted: true
        });
      } else if (lowered === "euclidianview") result.views.euclidian2d += 1;
      else if (lowered === "euclidianview3d") result.views.euclidian3d += 1;
      else if (lowered === "spreadsheetview") result.views.spreadsheet += 1;
      else if (lowered === "algebraview") result.views.algebra += 1;
      if (token.selfClosing && lowered === "element") currentElement = undefined;
    },
    close(name) {
      if (name.toLowerCase() === "element") currentElement = undefined;
      if (name.toLowerCase() === "command") currentCommand = undefined;
    }
  });
  const bodyScriptPattern = /<(ggbscript|javascript)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of xml.matchAll(bodyScriptPattern)) {
    const attrs = attributes(match[2]);
    const content = decodeXml(match[3].trim());
    if (!content) continue;
    const fingerprint = sha256(Buffer.from(content));
    if (result.scripts.some(script => script.sha256 === fingerprint)) continue;
    result.scripts.push({
      scope: "document",
      language: match[1].toLowerCase() === "javascript" ? "javascript" : "ggbscript",
      event: attrs.event,
      bytes: Buffer.byteLength(content),
      sha256: fingerprint,
      redacted: true
    });
  }
  return result;
}

function parseMacros(xml, fileName) {
  const macros = [];
  let current;
  let insideConstruction = false;
  scanXml(xml, {
    open(name, attrs, token) {
      const lowered = name.toLowerCase();
      if (lowered === "macro") {
        current = {
          commandName: attrs.cmdName ?? attrs.commandName ?? attrs.name,
          toolName: attrs.toolName,
          inputLabels: [],
          outputLabels: [],
          sourceFile: fileName
        };
        macros.push(current);
      } else if (current && lowered === "construction") insideConstruction = true;
      else if (current && !insideConstruction && ["input", "macroinput"].includes(lowered)) current.inputLabels.push(...orderedAttributeValues(attrs));
      else if (current && !insideConstruction && ["output", "macrooutput"].includes(lowered)) current.outputLabels.push(...orderedAttributeValues(attrs));
      if (token.selfClosing && lowered === "macro") current = undefined;
    },
    close(name) {
      if (name.toLowerCase() === "construction") insideConstruction = false;
      if (name.toLowerCase() === "macro") current = undefined;
    }
  });
  return macros;
}

function analyzeCommands(commands, elements, macros) {
  const exact = [];
  const gaps = [];
  const unknown = [];
  const typeByLabel = new Map(elements.inventory.map(element => [element.label, element.type]));
  const circleLabels = new Set(commands.signatures
    .filter(signature => signature.name.toLowerCase().replaceAll(/[^a-z0-9]/g, "") === "circle")
    .flatMap(signature => signature.outputs));
  const importedMacroNames = new Set(macros.map(macro => macro.commandName.toLowerCase().replaceAll(/[^a-z0-9]/g, "")));
  for (const [command, count] of Object.entries(commands.byName).sort(([a], [b]) => a.localeCompare(b))) {
    const normalized = command.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
    if (normalized === "mirror") {
      const signatures = commands.signatures.filter(signature => signature.name.toLowerCase().replaceAll(/[^a-z0-9]/g, "") === "mirror");
      const lineLike = signatures.filter(signature => ["line", "segment", "ray"].includes(typeByLabel.get(signature.inputs[1]))).length;
      const point = signatures.filter(signature => typeByLabel.get(signature.inputs[1]) === "point").length;
      const circleInversion = signatures.filter(signature => circleLabels.has(signature.inputs[0]) && circleLabels.has(signature.inputs[1])).length;
      const conic = signatures.filter(signature => typeByLabel.get(signature.inputs[1]) === "conic").length - circleInversion;
      const unresolved = count - lineLike - point - circleInversion - conic;
      if (lineLike) exact.push({ command, count: lineLike, mapsTo: "transform.reflect/transform.apply", condition: "line-like mirror" });
      if (point) exact.push({ command, count: point, mapsTo: "transform.rotate(angle=pi)/transform.apply", condition: "point reflection" });
      if (circleInversion) exact.push({ command, count: circleInversion, mapsTo: "circle.invert_in_circle", condition: "Circle-command source and inversion circle" });
      if (conic) gaps.push({ command, count: conic, requiredCapability: "generalized_conic_inversion", condition: "non-circle conic mirror" });
      if (unresolved) gaps.push({ command, count: unresolved, requiredCapability: "mirror_overload_type_resolution" });
    } else if (importedMacroNames.has(normalized)) gaps.push({ command, count, requiredCapability: "imported_macro_semantic_review", condition: "custom tool invocation" });
    else if (EXACT_COMMANDS.has(normalized)) exact.push({ command, count, mapsTo: EXACT_COMMANDS.get(normalized) });
    else if (GAP_COMMANDS.has(normalized)) gaps.push({ command, count, requiredCapability: GAP_COMMANDS.get(normalized) });
    else unknown.push({ command, count });
  }
  return { exact, gaps, unknown };
}

function capabilityTags(parsed, macros, globalScripts) {
  const tags = new Set();
  const types = Object.keys(parsed.elements.byType).map(value => value.toLowerCase());
  const commands = Object.keys(parsed.commands.byName).map(value => value.toLowerCase().replaceAll(/[^a-z0-9]/g, ""));
  if (types.some(type => /point|line|segment|ray|circle|polygon|angle|conic/.test(type))) tags.add("geometry");
  if (types.some(type => /function/.test(type))) tags.add("function_plot");
  if (types.some(type => /curve|conic/.test(type)) || commands.some(command => /curve|locus|envelope/.test(command))) tags.add("curve");
  if (types.some(type => /vector|matrix/.test(type)) || commands.some(command => /vector|matrix|determinant/.test(command))) tags.add("vector_matrix");
  if (commands.some(command => /translate|rotate|reflect|mirror|dilate/.test(command))) tags.add("transform");
  if (parsed.animations.length > 0 || commands.includes("startanimation")) tags.add("animation");
  if (commands.some(command => /sequence|zip|iteration/.test(command))) tags.add("sequence");
  if (commands.some(command => /integral|derivative|tangent/.test(command))) tags.add("calculus");
  if (commands.some(command => /intersectregion|union|difference|coefficients/.test(command))) tags.add("region_boolean");
  if (types.some(type => type.includes("3d")) || parsed.views.euclidian3d > 0 || commands.includes("surface")) tags.add("3d");
  if (parsed.views.spreadsheet > 0) tags.add("spreadsheet");
  if (macros.length > 0) tags.add("custom_tool");
  if (parsed.scripts.length > 0 || globalScripts.length > 0) tags.add("script");
  if (tags.has("animation") && (commands.some(command => /locus|trace/.test(command)) || parsed.controls.buttons.length > 0)) tags.add("simulation");
  return [...tags].sort();
}

function mergeParsed(parts) {
  const merged = {
    format: {},
    elements: { total: 0, byType: {}, inventory: [] },
    commands: { total: 0, byName: {}, signatures: [] },
    controls: { sliders: [], checkboxes: [], buttons: [], inputs: [] },
    animations: [],
    scripts: [],
    views: { euclidian2d: 0, euclidian3d: 0, spreadsheet: 0, algebra: 0 },
    warnings: []
  };
  for (const part of parts) {
    if (part.fileName === "geogebra.xml") merged.format = part.format;
    merged.elements.total += part.elements.total;
    merged.commands.total += part.commands.total;
    for (const [key, count] of Object.entries(part.elements.byType)) merged.elements.byType[key] = (merged.elements.byType[key] ?? 0) + count;
    merged.elements.inventory.push(...part.elements.inventory);
    for (const [key, count] of Object.entries(part.commands.byName)) merged.commands.byName[key] = (merged.commands.byName[key] ?? 0) + count;
    merged.commands.signatures.push(...part.commands.signatures);
    for (const key of Object.keys(merged.controls)) merged.controls[key].push(...part.controls[key]);
    merged.animations.push(...part.animations);
    merged.scripts.push(...part.scripts);
    for (const key of Object.keys(merged.views)) merged.views[key] += part.views[key];
    merged.warnings.push(...part.warnings);
  }
  return merged;
}

export function inspectGgb(input, options = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const entries = readZipEntries(buffer, options.limits);
  assertArchive(entries.has("geogebra.xml"), "GGB_CONSTRUCTION_MISSING", "Archive does not contain geogebra.xml.");
  const xmlEntries = [...entries.entries()].filter(([name]) => name === "geogebra.xml" || name.endsWith("/geogebra.xml"));
  const macroEntries = [...entries.entries()].filter(([name]) => name === "geogebra_macro.xml" || name.endsWith("/geogebra_macro.xml"));
  for (const [name, data] of [...xmlEntries, ...macroEntries]) {
    assertArchive(data.length <= (options.limits?.maxXmlBytes ?? DEFAULT_LIMITS.maxXmlBytes), "GGB_XML_TOO_LARGE", "XML entry exceeds the configured byte limit.", { name, bytes: data.length });
  }
  const parsedParts = xmlEntries.map(([name, data]) => parseConstructionXml(data.toString("utf8"), name));
  const parsed = mergeParsed(parsedParts);
  const macros = [...xmlEntries, ...macroEntries]
    .flatMap(([name, data]) => parseMacros(data.toString("utf8"), name))
    .filter((macro, index, all) => index === all.findIndex(candidate =>
      candidate.commandName === macro.commandName
      && candidate.toolName === macro.toolName
      && candidate.inputLabels.join("\0") === macro.inputLabels.join("\0")
      && candidate.outputLabels.join("\0") === macro.outputLabels.join("\0")
    ));
  const globalScripts = [...entries.entries()]
    .filter(([name]) => /(^|\/)(geogebra(_javascript)?\.js|geogebra\.js)$/i.test(name))
    .map(([name, data]) => ({ scope: "global-file", language: "javascript", fileName: name, bytes: data.length, sha256: sha256(data), redacted: true }));
  const knownCoreFiles = new Set(["geogebra.xml", "geogebra_macro.xml", "geogebra.js", "geogebra_javascript.js", "geogebra_thumbnail.png"]);
  const assets = [...entries.entries()]
    .filter(([name]) => !knownCoreFiles.has(name) && !name.endsWith("/geogebra.xml") && !name.endsWith("/geogebra_macro.xml"))
    .map(([name, data]) => ({ fileName: name, bytes: data.length, sha256: sha256(data) }));
  const thumbnailEntry = [...entries.entries()].find(([name]) => /(^|\/)geogebra_thumbnail\.png$/i.test(name));
  const commandAnalysis = analyzeCommands(parsed.commands, parsed.elements, macros);
  const tags = capabilityTags(parsed, macros, globalScripts);
  const warnings = [];
  if (globalScripts.length || parsed.scripts.length) warnings.push({ code: "GGB_SCRIPT_REDACTED", message: "Scripts were fingerprinted but never executed or copied into the manifest." });
  if (commandAnalysis.unknown.length) warnings.push({ code: "GGB_COMMANDS_UNMAPPED", count: commandAnalysis.unknown.reduce((sum, item) => sum + item.count, 0) });
  return {
    schema: GGB_MANIFEST_SCHEMA,
    source: {
      fileName: options.fileName,
      materialId: options.materialId,
      sourceUrl: options.sourceUrl,
      bytes: buffer.length,
      sha256: sha256(buffer)
    },
    archive: {
      entryCount: entries.size,
      entries: [...entries.entries()].map(([name, data]) => ({ fileName: name, bytes: data.length, sha256: sha256(data) }))
    },
    format: parsed.format,
    construction: {
      elements: parsed.elements,
      commands: parsed.commands,
      controls: parsed.controls,
      animations: parsed.animations,
      views: parsed.views
    },
    macros,
    scripts: [...parsed.scripts, ...globalScripts],
    preview: {
      thumbnail: thumbnailEntry
        ? { fileName: thumbnailEntry[0], bytes: thumbnailEntry[1].length, sha256: sha256(thumbnailEntry[1]) }
        : null
    },
    assets,
    capabilityTags: tags,
    engineMapping: commandAnalysis,
    security: {
      scriptsExecuted: false,
      archiveLimits: { ...DEFAULT_LIMITS, ...(options.limits ?? {}) },
      warnings
    }
  };
}
