export const GGB_PLAN_SCHEMA = "famtutor.geogebra.capability-plan.v1";

const TRACKS = Object.freeze({
  geometry: { weight: 5, priority: "P0", engineStatus: "strong", nextCapability: "expand only from repeated atomic gaps" },
  transform: { weight: 8, priority: "P0", engineStatus: "strong-2d", nextCapability: "matrix-backed transforms only when cases require them" },
  animation: { weight: 11, priority: "P0", engineStatus: "slider-autoplay", nextCapability: "control/action protocol and deterministic clock" },
  sequence: { weight: 13, priority: "P0", engineStatus: "missing", nextCapability: "declarative repeat/sequence/zip IR" },
  custom_tool: { weight: 13, priority: "P0", engineStatus: "macro-core", nextCapability: "versioned macro packages and imported signatures" },
  simulation: { weight: 14, priority: "P1", engineStatus: "offline-simulation", nextCapability: "play/pause/reset clock, trajectories and observables" },
  region_boolean: { weight: 10, priority: "P1", engineStatus: "missing", nextCapability: "boolean region entities and renderer parity" },
  spreadsheet: { weight: 9, priority: "P1", engineStatus: "missing", nextCapability: "lightweight DataTable binding" },
  vector_matrix: { weight: 7, priority: "P1", engineStatus: "vector-only", nextCapability: "matrix entity and exact/numeric operations" },
  function_plot: { weight: 5, priority: "P1", engineStatus: "explicit-functions", nextCapability: "implicit functions and richer domains" },
  curve: { weight: 7, priority: "P1", engineStatus: "parametric-curves", nextCapability: "adaptive algorithms as macros/plugins" },
  calculus: { weight: 4, priority: "P2", engineStatus: "expression-only", nextCapability: "defer until curriculum demand" },
  "3d": { weight: 2, priority: "P2", engineStatus: "missing", nextCapability: "dedicated scene3d adapter, not JSXGraph case hacks" },
  probability: { weight: 4, priority: "P2", engineStatus: "missing-domain", nextCapability: "data/simulation primitives after clock" },
  game: { weight: 3, priority: "P2", engineStatus: "out-of-scope", nextCapability: "reuse controls/state; no game-specific runtime" },
  agent_generated: { weight: 2, priority: "research", engineStatus: "reference", nextCapability: "compare authoring strategies" },
  text_annotation: { weight: 1, priority: "research", engineStatus: "supported", nextCapability: "no new capability" },
  map_globe: { weight: 1, priority: "P2", engineStatus: "missing", nextCapability: "defer to specialized map renderer" }
});

function ratio(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

function evidenceByMaterial(index) {
  return new Map((index.command_script_evidence ?? [])
    .filter(item => item.material_id)
    .map(item => [item.material_id, item]));
}

function candidateTrack(tags) {
  const ordered = ["simulation", "sequence", "custom_tool", "animation", "region_boolean", "spreadsheet", "transform", "geometry"];
  return ordered.find(tag => tags.includes(tag)) ?? tags[0] ?? "unclassified";
}

function inferEvidenceTracks(evidence) {
  const tracks = new Set();
  for (const item of evidence) {
    const commands = (item.commands ?? []).map(value => value.toLowerCase());
    if ((item.custom_tools ?? []).length > 0) tracks.add("custom_tool");
    if ((item.scripts ?? []).length > 0 || commands.some(command => /setvalue|setcolor|startanimation/.test(command))) tracks.add("animation");
    if (commands.some(command => /sequence|zip/.test(command))) tracks.add("sequence");
    if (commands.some(command => /startanimation|trace|locus/.test(command))) tracks.add("simulation");
  }
  return [...tracks].sort();
}

function scoreCandidate(entry, evidenceMap) {
  const ids = entry.known_material_ids ?? [];
  const tags = entry.capability_tags ?? [];
  const explicitEvidence = ids.some(id => evidenceMap.get(id)?.confidence === "explicit");
  const mixedEvidence = ids.some(id => evidenceMap.has(id));
  const bookCount = new Set((entry.books ?? []).map(book => book.book_id)).size;
  const score = Math.min(100,
    (ids.length > 0 ? 12 : 0)
    + (explicitEvidence ? 20 : mixedEvidence ? 10 : 0)
    + Math.min(12, bookCount * 2)
    + tags.reduce((sum, tag) => sum + (TRACKS[tag]?.weight ?? 1), 0)
  );
  const reasons = [];
  if (ids.length) reasons.push("downloadable_material_id");
  if (explicitEvidence) reasons.push("explicit_command_or_script_evidence");
  else if (mixedEvidence) reasons.push("mixed_implementation_evidence");
  if (bookCount > 1) reasons.push(`reused_across_${bookCount}_books`);
  for (const tag of tags) if ((TRACKS[tag]?.weight ?? 0) >= 9) reasons.push(`mechanism:${tag}`);
  return { score, reasons, explicitEvidence };
}

function validateIndex(index) {
  if (!index || typeof index !== "object") throw new Error("GeoGebra public index must be a JSON object.");
  if (!Array.isArray(index.unique_book_entries) || !Array.isArray(index.known_materials)) {
    throw new Error("GeoGebra public index is missing unique_book_entries or known_materials.");
  }
}

export function buildCapabilityPlan(index, options = {}) {
  validateIndex(index);
  const evidenceMap = evidenceByMaterial(index);
  const uniqueEntries = index.unique_book_entries;
  const mechanismTags = options.mechanismTags ?? ["sequence", "simulation", "custom_tool", "animation", "transform", "geometry"];
  const capabilityCounts = index.capability_counts_unique_titles ?? {};
  const capabilities = Object.entries(capabilityCounts)
    .map(([tag, titles]) => {
      const matching = uniqueEntries.filter(entry => (entry.capability_tags ?? []).includes(tag));
      const knownIdTitles = matching.filter(entry => (entry.known_material_ids ?? []).length > 0).length;
      const materialIds = new Set(matching.flatMap(entry => entry.known_material_ids ?? []));
      return {
        tag,
        titles,
        knownIdTitles,
        knownMaterialIds: materialIds.size,
        idCoveragePercent: ratio(knownIdTitles, titles),
        ...(TRACKS[tag] ?? { weight: 1, priority: "research", engineStatus: "unclassified", nextCapability: "inspect exact .ggb first" })
      };
    })
    .sort((a, b) => b.weight - a.weight || b.knownIdTitles - a.knownIdTitles || a.tag.localeCompare(b.tag));

  const candidates = uniqueEntries
    .map(entry => {
      const scored = scoreCandidate(entry, evidenceMap);
      const ids = entry.known_material_ids ?? [];
      const evidence = ids.map(id => evidenceMap.get(id)).filter(Boolean);
      const inferredResearchTracks = inferEvidenceTracks(evidence);
      return {
        title: entry.title,
        normalizedTitle: entry.normalized_title,
        materialIds: ids,
        sourceUrls: ids.map(id => `https://www.geogebra.org/m/${id}`),
        domains: entry.domains ?? [],
        capabilityTags: entry.capability_tags ?? [],
        books: [...new Set((entry.books ?? []).map(book => book.book_title))],
        inferredResearchTracks,
        primaryTrack: candidateTrack([...(entry.capability_tags ?? []), ...inferredResearchTracks]),
        valueScore: scored.score,
        reasons: scored.reasons,
        evidence: evidence.map(item => ({
          materialId: item.material_id,
          confidence: item.confidence,
          commands: item.commands ?? [],
          scripts: item.scripts ?? [],
          customTools: item.custom_tools ?? []
        }))
      };
    })
    .sort((a, b) => b.valueScore - a.valueScore || a.title.localeCompare(b.title));

  const mechanismCandidates = candidates.filter(candidate =>
    candidate.materialIds.length > 0 && candidate.capabilityTags.some(tag => mechanismTags.includes(tag))
  );
  const mechanismMaterialIds = new Set(mechanismCandidates.flatMap(candidate => candidate.materialIds));
  const titlesWithKnownIds = uniqueEntries.filter(entry => (entry.known_material_ids ?? []).length > 0).length;
  return {
    schema: GGB_PLAN_SCHEMA,
    source: {
      schema: index.schema,
      generatedAt: index.generated_at,
      profile: index.profile,
      scope: index.coverage?.scope_label
    },
    summary: {
      books: index.books?.length ?? index.counts?.books_total ?? 0,
      rawBookRows: index.book_entries?.length ?? index.counts?.book_toc_rows_raw ?? 0,
      uniqueTitles: uniqueEntries.length,
      knownMaterials: index.known_materials.length,
      titlesWithKnownIds,
      titleIdCoveragePercent: ratio(titlesWithKnownIds, uniqueEntries.length),
      evidenceRecords: index.command_script_evidence?.length ?? 0,
      evidenceMaterialIds: new Set((index.command_script_evidence ?? []).map(item => item.material_id).filter(Boolean)).size,
      explicitEvidenceMaterialIds: new Set((index.command_script_evidence ?? [])
        .filter(item => item.material_id && item.confidence === "explicit")
        .map(item => item.material_id)).size,
      mechanismCandidates: mechanismCandidates.length,
      mechanismMaterialIds: mechanismMaterialIds.size,
      scriptsMayExecute: false
    },
    capabilityCoverage: capabilities,
    recommendedWaves: [
      {
        id: "wave-1-foundations",
        targetTracks: ["animation", "sequence", "custom_tool", "simulation"],
        objective: "Add reusable controls, deterministic clock, declarative repetition, and versioned macro packages.",
        maxCandidates: 12
      },
      {
        id: "wave-2-math-regions-data",
        targetTracks: ["region_boolean", "spreadsheet", "vector_matrix", "curve"],
        objective: "Add boolean regions, lightweight data binding, matrix semantics, and reusable curve algorithms.",
        maxCandidates: 12
      },
      {
        id: "wave-3-specialized-renderers",
        targetTracks: ["3d", "map_globe"],
        objective: "Evaluate dedicated 3D/map adapters only after 2D teaching protocols stabilize.",
        maxCandidates: 6
      }
    ].map(wave => ({
      ...wave,
      candidates: candidates
        .filter(candidate => candidate.materialIds.length > 0
          && [...candidate.capabilityTags, ...candidate.inferredResearchTracks].some(tag => wave.targetTracks.includes(tag)))
        .slice(0, wave.maxCandidates)
    })),
    topCandidates: candidates.filter(candidate => candidate.materialIds.length > 0).slice(0, options.topCandidates ?? 40),
    legalGate: {
      rawDownloadsCommitted: false,
      commercialUseRequiresReview: true,
      note: "Keep raw .ggb files in a local ignored cache until GeoGebra and author permissions are confirmed. Commit only engine-owned manifests, synthetic fixtures, aggregate findings, and permitted derived cases."
    }
  };
}

export function capabilityTracks() {
  return structuredClone(TRACKS);
}
