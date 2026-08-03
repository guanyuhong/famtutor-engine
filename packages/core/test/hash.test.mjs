import assert from "node:assert/strict";
import test from "node:test";
import { sha256Utf8 } from "../dist/index.js";

test("sha256Utf8 empty string matches known vector", async () => {
  assert.equal(
    await sha256Utf8(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
});
