import test from "node:test";
import assert from "node:assert/strict";
import { AgentMathRuntime } from "../dist/index.js";

test("AgentMathRuntime supports transactional create/apply/inspect/render/evaluate", async () => {
  const runtime = new AgentMathRuntime();
  const create = await runtime.callTool("math_create", { documentId: "agent-demo", title: "Agent Demo", purpose: "authoring" });
  assert.equal(create.ok, true);
  assert.equal(create.document.revision, 1);

  const applyOps = [
      { op: "construct", command: "point.free", outputs: [{ id: "A", label: "A" }], params: { coords: [-3,0] } },
      { op: "construct", command: "point.free", outputs: [{ id: "B", label: "B" }], params: { coords: [3,0] } },
      { op: "construct", command: "segment.through_points", outputs: ["AB"], inputs: [{ ref: "A" }, { ref: "B" }] },
      { op: "construct", command: "point.midpoint", outputs: [{ id: "M", label: "M" }], inputs: [{ ref: "A" }, { ref: "B" }] },
      { op: "set_style", targets: ["AB"], style: { token: "accent", strokeWidth: 3 } },
      { op: "set_interaction", policy: { target: "A", permissions: ["drag"] } },
      { op: "set_interaction", policy: { target: "B", permissions: ["drag"] } },
      { op: "add_assertion", assertion: { id: "midpoint-distance", predicate: "expression_equal", arguments: [{ expr: "distance(M,A)" }, { expr: "distance(M,B)" }], tolerance: 1e-9 } }
    ];
  const apply = await runtime.callTool("math_apply", {
    documentId: "agent-demo",
    expectedRevision: 1,
    idempotencyKey: "construct-v1",
    operations: applyOps
  });
  assert.equal(apply.ok, true, JSON.stringify(apply));
  assert.equal(apply.revision, 2);
  assert.deepEqual(apply.created.sort(), ["A","AB","B","M"].sort());

  const replay = await runtime.callTool("math_apply", {
    documentId: "agent-demo",
    expectedRevision: 1,
    idempotencyKey: "construct-v1",
    operations: applyOps
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.revision, 2);

  const reused = await runtime.callTool("math_apply", {
    documentId: "agent-demo",
    expectedRevision: 1,
    idempotencyKey: "construct-v1",
    operations: [{ op: "construct", command: "point.free", outputs: ["ignored"], params: { coords: [0,0] } }]
  });
  assert.equal(reused.ok, false);
  assert.equal(reused.error.code, "IDEMPOTENCY_KEY_REUSED");

  const conflict = await runtime.callTool("math_apply", { documentId: "agent-demo", expectedRevision: 1, operations: [{ op: "set_entity", entityId: "A", patch: { label: "A1" } }] });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, "REVISION_CONFLICT");

  const inspect = await runtime.callTool("math_inspect", { documentId: "agent-demo", entityIds: ["M"], includeValues: true });
  assert.equal(inspect.ok, true);
  assert.deepEqual(inspect.entities[0].value, { kind: "point2", x: 0, y: 0 });

  const evaluate = await runtime.callTool("math_evaluate", { documentId: "agent-demo", expression: "distance(A,B)" });
  assert.equal(evaluate.value, 6);

  const render = await runtime.callTool("math_render", { documentId: "agent-demo", width: 720, height: 420 });
  assert.equal(render.ok, true);
  assert.ok(render.svg.startsWith("<svg"));
  assert.equal(render.report.skippedEntities.length, 0);
});

test("dry-run, simulation commit, cascade delete and undo preserve revision semantics", async () => {
  const runtime = new AgentMathRuntime();
  await runtime.callTool("math_create", { documentId: "flow", title: "Flow" });
  const constructed = await runtime.callTool("math_apply", {
    documentId: "flow",
    expectedRevision: 1,
    operations: [
      { op: "construct", command: "point.free", outputs: ["A"], params: { coords: [-2,0] } },
      { op: "construct", command: "point.free", outputs: ["B"], params: { coords: [2,0] } },
      { op: "construct", command: "segment.through_points", outputs: ["AB"], inputs: [{ ref: "A" }, { ref: "B" }] },
      { op: "set_interaction", policy: { target: "A", permissions: ["drag"] } }
    ]
  });
  assert.equal(constructed.revision, 2);

  const dry = await runtime.callTool("math_apply", {
    documentId: "flow",
    expectedRevision: 2,
    dryRun: true,
    operations: [{ op: "set_entity", entityId: "A", patch: { label: "Preview" } }]
  });
  assert.equal(dry.ok, true);
  assert.equal(dry.revision, 3);
  const afterDry = await runtime.callTool("math_inspect", { documentId: "flow", entityIds: ["A"], includeDocument: true });
  assert.notEqual(afterDry.entities[0].label, "Preview");
  assert.equal(afterDry.summary.revision, 2);

  const simulation = await runtime.callTool("math_simulate", {
    documentId: "flow",
    expectedRevision: 2,
    action: { type: "drag", target: "A", path: [[-2,0],[-3,1]], samples: 5, commit: true },
    observe: ["distance(A,B)"]
  });
  assert.equal(simulation.ok, true, JSON.stringify(simulation));
  assert.equal(simulation.simulation.committedRevision, 3);

  const blocked = await runtime.callTool("math_apply", { documentId: "flow", expectedRevision: 3, operations: [{ op: "delete", targets: ["A"] }] });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, "DELETE_HAS_DEPENDENTS");

  const deleted = await runtime.callTool("math_apply", { documentId: "flow", expectedRevision: 3, operations: [{ op: "delete", targets: ["A"], cascade: true }] });
  assert.equal(deleted.ok, true, JSON.stringify(deleted));
  assert.ok(deleted.removed.includes("A"));
  assert.ok(deleted.removed.includes("AB"));
  assert.equal(deleted.revision, 4);

  const undone = await runtime.callTool("math_apply", { documentId: "flow", expectedRevision: 4, operations: [{ op: "undo" }] });
  assert.equal(undone.ok, true);
  assert.equal(undone.document.revision, 5);
  assert.ok(undone.document.entities.some(entity => entity.id === "A"));
});

test("invalid transactional edits are rejected atomically with structured errors", async () => {
  const runtime = new AgentMathRuntime();
  await runtime.callTool("math_create", { documentId: "invalid", title: "Invalid" });
  const result = await runtime.callTool("math_apply", {
    documentId: "invalid",
    expectedRevision: 1,
    operations: [
      { op: "construct", command: "point.free", outputs: ["A"], params: { coords: [0,0] } },
      { op: "construct", command: "line.through_points", outputs: ["bad"], inputs: [{ ref: "A" }, { ref: "A" }] }
    ]
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "TRANSACTION_VALIDATION_FAILED");
  const inspect = await runtime.callTool("math_inspect", { documentId: "invalid" });
  assert.equal(inspect.summary.revision, 1);
  assert.equal(inspect.summary.entities, 0);
});
