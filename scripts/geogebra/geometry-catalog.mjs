export const GGB_GEOMETRY_CATALOG_SCHEMA = "famtutor.geogebra.geometry-catalog.v1";

const FAMILY_RULES = Object.freeze([
  ["triangle", /三角|triangle/i],
  ["circle", /圓|circle|阿波羅尼|steiner/i],
  ["conic", /圓錐|橢圓|雙曲|拋物|ellipse|hyperbola|parabola|conic/i],
  ["construction", /作圖|垂足|根軸|共線|中點|線外一點|construction/i],
  ["area", /面積|area|黎曼和/i],
  ["angle-trigonometry", /廣義角|角度|夾角|angle|sin|cos|三角函數/i],
  ["transform", /變換|平移|旋轉|對稱|反射|translate|rotate|reflect|transform/i],
  ["locus", /軌跡|locus|trace/i],
  ["curve", /曲線|螺旋|curve|bezier|貝氏|貝式/i],
  ["vector", /向量|線性組合|vector/i],
  ["solid-3d", /空間|立體|角錐|三角柱|平面|surface|3d/i]
]);

const DEPENDENCY_BY_TAG = Object.freeze({
  "3d": "scene3d-renderer",
  animation: "control-clock",
  calculus: "calculus-kernel",
  curve: "curve-kernel",
  custom_tool: "macro-package",
  region_boolean: "boolean-region",
  sequence: "declarative-sequence",
  transform: "transform-2d",
  vector_matrix: "vector-matrix"
});

function unique(values) {
  return [...new Set(values.filter(value => value !== undefined && value !== null && value !== ""))].sort((a, b) => String(a).localeCompare(String(b)));
}

function familiesFor(title, tags = []) {
  const families = FAMILY_RULES.filter(([, pattern]) => pattern.test(title)).map(([family]) => family);
  if (tags.includes("3d")) families.push("solid-3d");
  if (tags.includes("curve")) families.push("curve");
  if (tags.includes("transform")) families.push("transform");
  return unique(families.length ? families : ["general-geometry"]);
}

function evidenceByMaterial(index) {
  const result = new Map();
  for (const evidence of index.command_script_evidence ?? []) {
    if (evidence.material_id) result.set(evidence.material_id, evidence);
  }
  return result;
}

function priorityFor(record) {
  if (record.capabilityTags.includes("3d") || record.families.includes("solid-3d")) return "deferred-specialized-renderer";
  if (record.capabilityTags.includes("agent_generated")) return "review-source-quality";
  if (record.reuse.bookCount >= 2 || record.evidence.confidence === "explicit") return "A";
  return "B";
}

function extractionState(record) {
  if (record.capabilityTags.includes("3d") || record.families.includes("solid-3d")) return "needs-specialized-renderer-review";
  if (record.dependencies.length > 0) return "inspect-then-resolve-dependencies";
  return "ready-for-ggb-inspection";
}

function validateIndex(index) {
  if (!index || typeof index !== "object" || !Array.isArray(index.unique_book_entries)) {
    throw new Error("GeoGebra public index must contain unique_book_entries.");
  }
}

/** Build a deterministic research catalog. This does not download or copy .ggb content. */
export function buildGeometryCatalog(index, options = {}) {
  validateIndex(index);
  const evidenceMap = evidenceByMaterial(index);
  const manifestsById = new Map((options.manifests ?? [])
    .filter(manifest => manifest?.source?.materialId)
    .map(manifest => [manifest.source.materialId, manifest]));
  const geometryTitles = index.unique_book_entries.filter(entry => (entry.capability_tags ?? []).includes("geometry"));
  const domainGeometryOnlyTitles = index.unique_book_entries.filter(entry =>
    (entry.domains ?? []).includes("math.geometry") && !(entry.capability_tags ?? []).includes("geometry")
  );
  const byMaterial = new Map();
  for (const entry of geometryTitles) {
    for (const materialId of entry.known_material_ids ?? []) {
      const current = byMaterial.get(materialId) ?? {
        materialId,
        titles: [],
        normalizedTitles: [],
        books: [],
        capabilityTags: [],
        domains: [],
        families: []
      };
      current.titles.push(entry.title);
      current.normalizedTitles.push(entry.normalized_title);
      current.books.push(...(entry.books ?? []));
      current.capabilityTags.push(...(entry.capability_tags ?? []));
      current.domains.push(...(entry.domains ?? []));
      current.families.push(...familiesFor(entry.title, entry.capability_tags ?? []));
      byMaterial.set(materialId, current);
    }
  }

  const materials = [...byMaterial.values()].map(raw => {
    const books = new Map(raw.books.map(book => [book.book_id, {
      bookId: book.book_id,
      title: book.book_title,
      ownership: book.ownership
    }]));
    const evidence = evidenceMap.get(raw.materialId);
    const record = {
      materialId: raw.materialId,
      sourceUrl: `https://www.geogebra.org/m/${raw.materialId}`,
      titles: unique(raw.titles),
      normalizedTitles: unique(raw.normalizedTitles),
      families: unique(raw.families),
      domains: unique(raw.domains),
      capabilityTags: unique(raw.capabilityTags),
      dependencies: unique(raw.capabilityTags.map(tag => DEPENDENCY_BY_TAG[tag])),
      reuse: {
        bookCount: books.size,
        books: [...books.values()].sort((a, b) => a.title.localeCompare(b.title))
      },
      evidence: {
        confidence: evidence?.confidence ?? "index-only",
        commands: unique(evidence?.commands ?? []),
        customTools: unique(evidence?.custom_tools ?? []),
        scriptKinds: unique(evidence?.scripts ?? [])
      }
    };
    const manifest = manifestsById.get(raw.materialId);
    const inspection = manifest ? {
      manifestSchema: manifest.schema,
      fileName: manifest.source.fileName,
      sha256: manifest.source.sha256,
      bytes: manifest.source.bytes,
      elementCount: manifest.construction.elements.total,
      elementTypes: manifest.construction.elements.byType,
      commandCount: manifest.construction.commands.total,
      commandNames: manifest.construction.commands.byName,
      exactCommandCount: manifest.engineMapping.exact.reduce((sum, item) => sum + item.count, 0),
      gapCommandCount: manifest.engineMapping.gaps.reduce((sum, item) => sum + item.count, 0),
      unknownCommandCount: manifest.engineMapping.unknown.reduce((sum, item) => sum + item.count, 0),
      controlCount: Object.values(manifest.construction.controls).reduce((sum, items) => sum + items.length, 0),
      animationCount: manifest.construction.animations.length,
      macroCount: manifest.macros.length,
      macroNames: manifest.macros.map(macro => macro.commandName),
      gapCapabilities: manifest.engineMapping.gaps.map(item => ({
        command: item.command,
        count: item.count,
        requiredCapability: item.requiredCapability,
        ...(item.condition ? { condition: item.condition } : {})
      })),
      scriptCount: manifest.scripts.length,
      scriptsExecuted: manifest.security.scriptsExecuted
    } : undefined;
    return {
      ...record,
      inspectionPriority: priorityFor(record),
      extractionState: manifest ? "ggb-inspected-needs-semantic-review" : extractionState(record),
      ...(inspection ? { inspection } : {})
    };
  }).sort((a, b) => {
    const rank = { A: 0, B: 1, "review-source-quality": 2, "deferred-specialized-renderer": 3 };
    return rank[a.inspectionPriority] - rank[b.inspectionPriority]
      || b.reuse.bookCount - a.reuse.bookCount
      || a.titles[0].localeCompare(b.titles[0]);
  });

  const unresolvedTitles = geometryTitles
    .filter(entry => (entry.known_material_ids ?? []).length === 0)
    .map(entry => ({
      title: entry.title,
      normalizedTitle: entry.normalized_title,
      families: familiesFor(entry.title, entry.capability_tags ?? []),
      capabilityTags: unique(entry.capability_tags ?? []),
      books: unique((entry.books ?? []).map(book => book.book_title)),
      discoveryState: "material-id-unknown"
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const familyCounts = {};
  for (const material of materials) for (const family of material.families) familyCounts[family] = (familyCounts[family] ?? 0) + 1;
  const priorityCounts = {};
  for (const material of materials) priorityCounts[material.inspectionPriority] = (priorityCounts[material.inspectionPriority] ?? 0) + 1;

  const firstWave = materials
    .filter(material => material.inspectionPriority === "A")
    .sort((a, b) => a.dependencies.length - b.dependencies.length
      || b.reuse.bookCount - a.reuse.bookCount
      || a.titles[0].localeCompare(b.titles[0]))
    .slice(0, options.firstWaveSize ?? 12);

  return {
    schema: GGB_GEOMETRY_CATALOG_SCHEMA,
    source: {
      schema: index.schema,
      generatedAt: index.generated_at,
      profile: index.profile,
      rawGgbIncluded: false
    },
    summary: {
      geometryTitles: geometryTitles.length,
      titlesWithMaterialIds: geometryTitles.length - unresolvedTitles.length,
      uniqueMaterialIds: materials.length,
      inspectedMaterials: materials.filter(material => material.inspection).length,
      unresolvedTitles: unresolvedTitles.length,
      domainGeometryOnlyLeads: domainGeometryOnlyTitles.length,
      familyCounts: Object.fromEntries(Object.entries(familyCounts).sort(([a], [b]) => a.localeCompare(b))),
      priorityCounts
    },
    extractionPolicy: {
      identityKey: "materialId",
      rawGgbCommitted: false,
      scriptsExecuted: false,
      outputStages: ["cataloged", "ggb-inspected", "semantic-pattern-reviewed", "famtutor-reproduced", "cross-renderer-verified"],
      note: "A catalog entry is a research candidate, not a completed FamTutor asset."
    },
    firstWave: firstWave.map(material => material.materialId),
    materials,
    unresolvedTitles,
    externalInspectedSamples: [...manifestsById.entries()]
      .filter(([materialId]) => !byMaterial.has(materialId))
      .map(([materialId, manifest]) => ({
        materialId,
        sourceUrl: manifest.source.sourceUrl,
        manifestFile: manifest.source.fileName,
        sha256: manifest.source.sha256,
        extractionState: "ggb-inspected-needs-semantic-review"
      }))
      .sort((a, b) => a.materialId.localeCompare(b.materialId)),
    domainGeometryOnlyLeads: domainGeometryOnlyTitles.map(entry => ({
      title: entry.title,
      normalizedTitle: entry.normalized_title,
      capabilityTags: unique(entry.capability_tags ?? []),
      knownMaterialIds: unique(entry.known_material_ids ?? []),
      books: unique((entry.books ?? []).map(book => book.book_title)),
      discoveryState: "outside-geometry-capability-tag"
    })).sort((a, b) => a.title.localeCompare(b.title))
  };
}

export function geometryFamilies() {
  return FAMILY_RULES.map(([id]) => id).concat("general-geometry");
}
