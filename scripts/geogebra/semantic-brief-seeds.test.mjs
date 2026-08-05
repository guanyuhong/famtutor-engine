import assert from "node:assert/strict";
import test from "node:test";
import { parseCurriculumTitle } from "./semantic-brief-seeds.mjs";

test("parseCurriculumTitle recognizes grade, term, chapter and theorem model", () => {
  assert.deepEqual(parseCurriculumTitle("【八上-14全等三角形】28全等三角形练习"), {
    category: "八上-14全等三角形",
    topic: "28全等三角形练习",
    grade: 8,
    term: "上",
    chapter: 14,
    kind: "exercise"
  });
  assert.deepEqual(parseCurriculumTitle("【13三角形-定理模型】02三角形的内角和"), {
    category: "13三角形-定理模型",
    topic: "02三角形的内角和",
    chapter: 13,
    kind: "theorem-model"
  });
});
