import { loadCases, verifyAcceptedCase } from "./corpus-lib.mjs";

const requested = new Set(process.argv.slice(2));
const cases = (await loadCases()).filter(item => requested.has(item.caseId));
if (cases.length !== requested.size) {
  throw new Error(`Could not find all requested cases: ${[...requested].join(", ")}`);
}
const payload = [];
for (const caseSpec of cases) {
  const result = await verifyAcceptedCase(caseSpec);
  payload.push({
    caseId: caseSpec.caseId,
    caseType: caseSpec.caseType,
    document: result.document,
    bundle: result.bundle
  });
}
process.stdout.write(JSON.stringify(payload));
