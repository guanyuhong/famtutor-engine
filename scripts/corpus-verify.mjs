import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  loadCases,
  repoRoot,
  validateCorpusSources,
  verifyAcceptedCase,
  verifyExpectedUnsupportedCase
} from "./corpus-lib.mjs";

const cases = await loadCases();
if (cases.length !== 41) throw new Error(`Expected exactly 41 textbook cases, found ${cases.length}.`);
await validateCorpusSources(cases);

const results = [];
for (const caseSpec of cases) {
  if (caseSpec.status === "accepted") {
    results.push(await verifyAcceptedCase(caseSpec));
    continue;
  }
  if (caseSpec.status !== "expected-unsupported") {
    throw new Error(`${caseSpec.caseId}: seed case must be accepted or expected-unsupported, got '${caseSpec.status}'.`);
  }
  results.push(await verifyExpectedUnsupportedCase(caseSpec));
}

const accepted = results.filter(result => result.status === "accepted");
const unsupported = results.filter(result => result.status === "expected-unsupported");
const acceptedTypes = new Set(cases.filter(item => item.status === "accepted").map(item => item.caseType));
for (const type of ["demonstration", "exploration", "guided-construction"]) {
  if (!acceptedTypes.has(type)) throw new Error(`No accepted '${type}' seed case.`);
}

const report = {
  schema: "famtutor.corpus-report.v1",
  generatedFrom: "committed-seed-cases",
  totals: {
    cases: results.length,
    accepted: accepted.length,
    expectedUnsupported: unsupported.length,
    invalid: 0,
    regression: 0
  },
  coverage: {
    caseTypes: [...acceptedTypes].sort(),
    sourcePrintedPages: [...new Set(cases.flatMap(item => item.source.printedPages))].sort((a, b) => a - b),
    sourcePdfPages: [...new Set(cases.flatMap(item => item.source.pdfPages))].sort((a, b) => a - b)
  },
  results: results.map(({ document, bundle, ...summary }) => summary)
};

if (process.argv.includes("--write-report")) {
  const artifacts = join(repoRoot, "artifacts");
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(artifacts, "corpus-report.json"), `${JSON.stringify(report, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
