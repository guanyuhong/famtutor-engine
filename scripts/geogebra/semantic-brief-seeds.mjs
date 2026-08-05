#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { readZipEntries } from "./inspector.mjs";

export const SEMANTIC_BRIEF_SEED_SCHEMA = "famtutor.geogebra.semantic-brief-seed.v1";

function usage() {
  return `Generate model-ready semantic brief seeds from an external harvested corpus.

Usage:
  node scripts/geogebra/semantic-brief-seeds.mjs <corpus-directory> --output <external-directory>

The command reads public metadata, thumbnails, offline manifests and .ggb XML. It never
executes scripts. Generated evidence remains outside the repository.
`;
}
function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output") options.output = argv[++index];
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value.startsWith("--")) throw new Error(`Unknown option '${value}'.`);
    else positional.push(value);
  }
  return { corpusDirectory: positional[0], options };
}

function decodeXml(value = "") {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
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

function quotedStrings(expression) {
  const values = [];
  for (const match of expression.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    const value = match[1].replaceAll("\\n", "\n").replaceAll('\\"', '"').trim();
    if (value) values.push(value);
  }
  return values;
}

function isAttributionOrContact(value) {
  return /@|\bqq\b|联系|制作|作者|魏文杰|南昌中学|高新校区/i.test(value);
}

export function extractVisibleTextEvidence(input) {
  const entries = readZipEntries(input);
  const xml = entries.get("geogebra.xml")?.toString("utf8") ?? "";
  const textLabels = new Set();
  for (const match of xml.matchAll(/<element\b([^>]*)>/gi)) {
    const attrs = attributes(match[1]);
    if (String(attrs.type).toLowerCase() === "text" && attrs.label) textLabels.add(attrs.label);
  }
  const strings = [];
  const excluded = [];
  for (const match of xml.matchAll(/<expression\b([^>]*)\/?\s*>/gi)) {
    const attrs = attributes(match[1]);
    if (!textLabels.has(attrs.label) || !attrs.exp) continue;
    for (const value of quotedStrings(attrs.exp)) {
      const normalized = value.replace(/\s+/g, " ").trim();
      if (!normalized) continue;
      if (isAttributionOrContact(normalized)) excluded.push({ label: attrs.label, reason: "attribution-or-contact" });
      else strings.push({ label: attrs.label, text: normalized.slice(0, 800) });
    }
  }
  return {
    strings: strings.filter((item, index, all) => index === all.findIndex(candidate => candidate.text === item.text)),
    excluded,
    scriptsExecuted: false
  };
}

export function parseCurriculumTitle(title) {
  const bracket = title.match(/^【([^】]+)】\s*(.*)$/);
  const category = bracket?.[1] ?? "未分类";
  const topic = bracket?.[2] ?? title;
  const gradeTerm = category.match(/(八|九)(上|下)/);
  const chapter = category.match(/(?:八|九)?(?:上|下)?-?\s*(\d+)/)?.[1];
  const kind = /定理模型/.test(category) ? "theorem-model"
    : /中考/.test(category) ? "exam"
      : /八|九/.test(category) ? "exercise"
        : "collection";
  return {
    category,
    topic,
    ...(gradeTerm ? { grade: gradeTerm[1] === "八" ? 8 : 9, term: gradeTerm[2] === "上" ? "上" : "下" } : {}),
    ...(chapter ? { chapter: Number(chapter) } : {}),
    kind
  };
}

function resourceIdFromUrl(url) {
  return new URL(url).pathname.match(/^\/resource\/([^/]+)\//)?.[1];
}

function countMapping(items = []) {
  return items.reduce((sum, item) => sum + (item.count ?? 0), 0);
}

async function findGgb(corpusDirectory, material) {
  const url = material.elements?.find(element => element.type === "G")?.url;
  if (!url) return undefined;
  const relative = new URL(url).pathname.replace(/^\/resource\//, "assets/");
  return { url, resourceId: resourceIdFromUrl(url), path: path.join(corpusDirectory, relative) };
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

export async function generateSemanticBriefSeeds(corpusDirectory, outputDirectory) {
  const corpus = JSON.parse(await fs.readFile(path.join(corpusDirectory, "corpus-manifest.json"), "utf8"));
  const materialRecords = corpus.materials.filter(item => item.type === "ws");
  const briefs = [];
  for (const record of materialRecords) {
    const material = JSON.parse(await fs.readFile(path.join(corpusDirectory, record.metadataPath), "utf8"));
    const ggb = await findGgb(corpusDirectory, material);
    if (!ggb) continue;
    const manifest = JSON.parse(await fs.readFile(path.join(corpusDirectory, "manifests", `material-${ggb.resourceId}.manifest.json`), "utf8"));
    const input = await fs.readFile(ggb.path);
    const textEvidence = extractVisibleTextEvidence(input);
    const thumbnailUrl = material.elements.find(element => element.type === "G")?.thumbUrl;
    const thumbnailPath = thumbnailUrl
      ? path.join(corpusDirectory, new URL(thumbnailUrl).pathname.replace(/^\/resource\//, "assets/"))
      : undefined;
    const brief = {
      schema: SEMANTIC_BRIEF_SEED_SCHEMA,
      source: {
        profileMaterialId: material.id,
        resourceId: ggb.resourceId,
        sourceUrl: `https://www.geogebra.org/m/${material.id}`,
        title: material.title,
        ggbSha256: manifest.source.sha256,
        ggbPath: ggb.path,
        ...(thumbnailPath ? { thumbnailPath } : {})
      },
      curriculum: parseCurriculumTitle(material.title),
      evidence: {
        visibleText: textEvidence,
        structure: {
          elements: manifest.construction.elements,
          commands: manifest.construction.commands,
          controls: manifest.construction.controls,
          conditionalVisibility: manifest.construction.conditions.visibility,
          animations: manifest.construction.animations,
          macros: manifest.macros.map(macro => ({
            commandName: macro.commandName,
            toolName: macro.toolName,
            inputLabels: macro.inputLabels,
            outputLabels: macro.outputLabels,
            engineMapping: macro.engineMapping
          })),
          scriptApiCalls: [...new Set(manifest.scripts.flatMap(script => script.apiCalls ?? []))].sort(),
          capabilityTags: manifest.capabilityTags
        }
      },
      capabilityAssessment: {
        exactCommandOccurrences: countMapping(manifest.engineMapping.exact),
        gapCommandOccurrences: countMapping(manifest.engineMapping.gaps),
        unknownCommandOccurrences: countMapping(manifest.engineMapping.unknown),
        gaps: manifest.engineMapping.gaps,
        unknown: manifest.engineMapping.unknown,
        needsConditionalVisibility: manifest.construction.conditions.visibility.length > 0
      },
      modelTask: {
        status: "needs-image-text-semantic-review",
        requiredOutputs: [
          "problem-intent",
          "geometric-scene",
          "constraints-and-invariants",
          "interaction-storyboard",
          "atomic-capability-plan",
          "original-famtutor-document-plan",
          "ambiguities"
        ],
        rule: "Use the thumbnail and visible text to infer teaching intent; use structure only as evidence. Do not copy source scripts or visual styling."
      }
    };
    briefs.push(brief);
    await writeJson(path.join(outputDirectory, `${material.id}.semantic-brief-seed.json`), brief);
  }
  const index = {
    schema: "famtutor.geogebra.semantic-brief-seed-index.v1",
    sourceCorpus: corpus.sourceUrl,
    generatedAt: new Date().toISOString(),
    scriptsExecuted: false,
    count: briefs.length,
    items: briefs.map(brief => ({
      profileMaterialId: brief.source.profileMaterialId,
      resourceId: brief.source.resourceId,
      title: brief.source.title,
      curriculum: brief.curriculum,
      capabilityAssessment: brief.capabilityAssessment,
      file: `${brief.source.profileMaterialId}.semantic-brief-seed.json`
    }))
  };
  await writeJson(path.join(outputDirectory, "index.json"), index);
  return index;
}

async function main() {
  const { corpusDirectory, options } = parseArgs(process.argv.slice(2));
  if (options.help || !corpusDirectory) {
    process.stdout.write(usage());
    return;
  }
  if (!options.output) throw new Error("--output is required.");
  const index = await generateSemanticBriefSeeds(path.resolve(corpusDirectory), path.resolve(options.output));
  process.stdout.write(`${JSON.stringify({ count: index.count, output: path.resolve(options.output) }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
