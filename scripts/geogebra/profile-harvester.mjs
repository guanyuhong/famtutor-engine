#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_API_BASE = "https://api.geogebra.org/v1.0";
const DEFAULT_BATCH_SIZE = 24;
const DEFAULT_CONCURRENCY = 6;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function usage() {
  return `Harvest a public GeoGebra profile into an external research directory.

Usage:
  node scripts/geogebra/profile-harvester.mjs <profile-url> --output <external-directory>
    [--concurrency <1-12>] [--no-assets] [--limit <top-level-count>]

Example:
  node scripts/geogebra/profile-harvester.mjs 'https://www.geogebra.org/u/秋风' \\
    --output /private/tmp/geogebra-qiu-feng

Policy:
  - The output directory must be outside the repository.
  - Public metadata, thumbnails, previews and .ggb files are research inputs only.
  - No GGBScript or JavaScript is executed.
  - The command is resumable: already downloaded assets are reused and re-hashed.
`;
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output") options.output = argv[++index];
    else if (value === "--concurrency") options.concurrency = Number(argv[++index]);
    else if (value === "--limit") options.limit = Number(argv[++index]);
    else if (value === "--no-assets") options.downloadAssets = false;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value.startsWith("--")) throw new Error(`Unknown option '${value}'.`);
    else positional.push(value);
  }
  return { profileUrl: positional[0], options };
}

function assertExternalOutput(outputDirectory) {
  const repositoryRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const output = path.resolve(outputDirectory);
  if (output === repositoryRoot || output.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error(`Research downloads must remain outside the repository: ${repositoryRoot}`);
  }
  return output;
}

function profileSlug(profileUrl) {
  const url = new URL(profileUrl);
  if (!/^\/(?:u|profile)\//.test(url.pathname)) throw new Error(`Unsupported GeoGebra profile URL: ${profileUrl}`);
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1));
}

export function parsePreloadedProfile(html) {
  const match = html.match(/<script\s+id=(?:["'])?__PRELOADED_DATA__(?:["'])?\s+type=(?:["'])?application\/json(?:["'])?>([^<]+)<\/script>/i);
  if (!match) throw new Error("GeoGebra profile page did not contain __PRELOADED_DATA__.");
  const decoded = decodeURIComponent(match[1]);
  const state = JSON.parse(decoded);
  const data = state?.preloadDataState?.data;
  if (!data?.user?.id) throw new Error("GeoGebra preloaded profile data did not contain a user id.");
  return { user: data.user, initialMaterials: data.data ?? [] };
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url, options = {}, retry = {}) {
  const attempts = retry.attempts ?? 4;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          accept: options.accept ?? "application/json, text/plain, */*",
          "user-agent": "FamTutor-GeoGebra-Research/1.0",
          ...(options.headers ?? {})
        }
      });
      if (response.ok) return response;
      const detail = await response.text();
      const error = new Error(`HTTP ${response.status} for ${url}: ${detail.slice(0, 240)}`);
      error.status = response.status;
      if (!RETRYABLE_STATUS.has(response.status)) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (error.status && !RETRYABLE_STATUS.has(error.status)) throw error;
    }
    if (attempt + 1 < attempts) await sleep(350 * (2 ** attempt));
  }
  throw lastError;
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  return response.json();
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function writeJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

function stableUnique(items, key) {
  const seen = new Set();
  return items.filter(item => {
    const identity = key(item);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function materialChildren(material) {
  if (material.type !== "book") return [];
  return (material.chapters ?? []).flatMap(chapter => chapter.pages ?? []).map(page => ({
    id: page.id,
    title: page.title,
    relation: "book-page",
    bookId: material.id
  }));
}

function collectResourceUrls(value, owner, result = []) {
  if (Array.isArray(value)) {
    for (const child of value) collectResourceUrls(child, owner, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && /^(?:https?:)?\/\/www\.geogebra\.org\/resource\//.test(child)) {
      const normalized = child.startsWith("//") ? `https:${child}` : child;
      result.push({ url: normalized, field: key, owner });
    } else {
      collectResourceUrls(child, owner, result);
    }
  }
  return result;
}

function assetRelativePath(assetUrl) {
  const url = new URL(assetUrl);
  const resourcePath = url.pathname.match(/^\/resource\/(.+)$/)?.[1];
  if (!resourcePath) throw new Error(`Not a GeoGebra resource URL: ${assetUrl}`);
  const safeSegments = resourcePath.split("/").map(segment => segment.replace(/[^a-zA-Z0-9._-]/g, "_"));
  return path.join("assets", ...safeSegments);
}

async function sha256File(file) {
  const data = await fs.readFile(file);
  return { sha256: crypto.createHash("sha256").update(data).digest("hex"), bytes: data.length };
}

async function downloadAsset(asset, outputDirectory) {
  const relativePath = assetRelativePath(asset.url);
  const target = path.join(outputDirectory, relativePath);
  try {
    const existing = await sha256File(target);
    return { ...asset, relativePath, ...existing, reused: true };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const response = await fetchWithRetry(asset.url, { accept: "*/*" });
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return {
    ...asset,
    relativePath,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    contentType: response.headers.get("content-type"),
    reused: false
  };
}

async function listAllMaterials(userId, options = {}) {
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const limit = options.limit;
  const materials = [];
  for (let offset = 0; ; offset += batchSize) {
    const url = new URL(`${apiBase}/users/${userId}/materials`);
    url.searchParams.set("embed", "creator");
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(batchSize));
    const batch = await fetchJson(url);
    materials.push(...batch);
    process.stderr.write(`profile page offset=${offset} received=${batch.length} total=${materials.length}\n`);
    if (batch.length < batchSize || (limit && materials.length >= limit)) break;
  }
  const unique = stableUnique(materials, item => item.id);
  return limit ? unique.slice(0, limit) : unique;
}

async function fetchMaterialClosure(topLevelMaterials, options = {}) {
  const apiBase = options.apiBase ?? DEFAULT_API_BASE;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const queued = new Map(topLevelMaterials.map(material => [material.id, {
    id: material.id,
    title: material.title,
    relation: "profile"
  }]));
  const metadata = new Map();
  while (true) {
    const pending = [...queued.values()].filter(item => !metadata.has(item.id));
    if (pending.length === 0) break;
    const batch = await mapPool(pending, concurrency, async item => {
      const material = await fetchJson(`${apiBase}/materials/${encodeURIComponent(item.id)}`);
      process.stderr.write(`metadata ${metadata.size + 1}/${queued.size} ${item.id} ${material.type}\n`);
      return { item, material };
    });
    for (const { item, material } of batch) {
      metadata.set(item.id, { ...material, _famtutorRelation: item });
      for (const child of materialChildren(material)) if (!queued.has(child.id)) queued.set(child.id, child);
    }
  }
  return [...metadata.values()];
}

function summarize(profile, topLevel, materials, assets) {
  const elementCounts = {};
  for (const material of materials) {
    for (const element of material.elements ?? []) elementCounts[element.type] = (elementCounts[element.type] ?? 0) + 1;
  }
  const downloadedAssets = assets.filter(asset => asset.downloaded !== false);
  const failedAssets = assets.filter(asset => asset.downloaded === false);
  const ggbAssets = downloadedAssets.filter(asset => asset.relativePath?.toLowerCase().endsWith(".ggb"));
  return {
    profile: {
      id: profile.id,
      username: profile.username,
      displayName: profile.displayname,
      message: profile.profilemessage
    },
    topLevelResources: topLevel.length,
    materialClosure: materials.length,
    resourceTypes: Object.fromEntries(Object.entries(materials.reduce((counts, material) => {
      counts[material.type] = (counts[material.type] ?? 0) + 1;
      return counts;
    }, {})).sort()),
    elementTypes: Object.fromEntries(Object.entries(elementCounts).sort()),
    assetReferences: assets.length,
    downloadedAssets: downloadedAssets.length,
    failedAssets: failedAssets.length,
    ggbAssets: ggbAssets.length,
    assetBytes: assets.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0),
    ggbBytes: ggbAssets.reduce((sum, asset) => sum + (asset.bytes ?? 0), 0)
  };
}

export async function harvestProfile(profileUrl, outputDirectory, options = {}) {
  const output = assertExternalOutput(outputDirectory);
  const slug = profileSlug(profileUrl);
  await fs.mkdir(output, { recursive: true });
  const html = await (await fetchWithRetry(profileUrl, { accept: "text/html" })).text();
  await fs.writeFile(path.join(output, "profile-page.html"), html);
  const preloaded = parsePreloadedProfile(html);
  const topLevel = await listAllMaterials(preloaded.user.id, options);
  await writeJson(path.join(output, "profile-index.json"), {
    schema: "famtutor.geogebra.public-profile-index.v1",
    sourceUrl: profileUrl,
    harvestedAt: new Date().toISOString(),
    user: preloaded.user,
    slug,
    batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
    materials: topLevel
  });
  const materials = await fetchMaterialClosure(topLevel, options);
  await mapPool(materials, options.concurrency ?? DEFAULT_CONCURRENCY, material =>
    writeJson(path.join(output, "materials", `${material.id}.json`), material));

  const resourceReferences = stableUnique(materials.flatMap(material =>
    collectResourceUrls(material, { materialId: material.id, materialType: material.type })), item => item.url);
  const assets = options.downloadAssets === false
    ? resourceReferences.map(asset => ({ ...asset, relativePath: assetRelativePath(asset.url), downloaded: false }))
    : await mapPool(resourceReferences, options.concurrency ?? DEFAULT_CONCURRENCY, async (asset, index) => {
      try {
        const result = await downloadAsset(asset, output);
        process.stderr.write(`asset ${index + 1}/${resourceReferences.length} ${result.reused ? "reuse" : "download"} ${result.relativePath}\n`);
        return { ...result, downloaded: true };
      } catch (error) {
        const result = {
          ...asset,
          relativePath: assetRelativePath(asset.url),
          downloaded: false,
          error: error.message,
          ...(error.status ? { status: error.status } : {})
        };
        process.stderr.write(`asset ${index + 1}/${resourceReferences.length} failed ${result.relativePath} ${error.status ?? "network"}\n`);
        return result;
      }
    });
  const summary = summarize(preloaded.user, topLevel, materials, assets);
  const manifest = {
    schema: "famtutor.geogebra.public-profile-corpus.v1",
    sourceUrl: profileUrl,
    harvestedAt: new Date().toISOString(),
    executionPolicy: {
      scriptsExecuted: false,
      rawAssetsCommittedToRepository: false,
      researchDirectory: output
    },
    summary,
    topLevelIds: topLevel.map(material => material.id),
    materials: materials.map(material => ({
      id: material.id,
      title: material.title,
      type: material.type,
      relation: material._famtutorRelation,
      metadataPath: path.join("materials", `${material.id}.json`)
    })),
    assets
  };
  await writeJson(path.join(output, "corpus-manifest.json"), manifest);
  await writeJson(path.join(output, "summary.json"), summary);
  return manifest;
}

async function main() {
  const { profileUrl, options } = parseArgs(process.argv.slice(2));
  if (options.help || !profileUrl) {
    process.stdout.write(usage());
    return;
  }
  if (!options.output) throw new Error("--output is required.");
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) throw new Error("--concurrency must be an integer from 1 to 12.");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error("--limit must be a positive integer.");
  const manifest = await harvestProfile(profileUrl, options.output, { ...options, concurrency });
  process.stdout.write(`${JSON.stringify(manifest.summary, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
