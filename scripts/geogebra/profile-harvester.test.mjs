import assert from "node:assert/strict";
import test from "node:test";
import { parsePreloadedProfile } from "./profile-harvester.mjs";

test("parsePreloadedProfile decodes GeoGebra preloaded profile state", () => {
  const state = {
    preloadDataState: {
      data: {
        user: { id: 2204239, username: "秋风", displayname: "魏文杰" },
        data: [{ id: "abc123", title: "三角形" }]
      }
    }
  };
  const html = `<html><script id=__PRELOADED_DATA__ type=application/json>${encodeURIComponent(JSON.stringify(state))}</script></html>`;
  assert.deepEqual(parsePreloadedProfile(html), {
    user: { id: 2204239, username: "秋风", displayname: "魏文杰" },
    initialMaterials: [{ id: "abc123", title: "三角形" }]
  });
});
test("parsePreloadedProfile rejects pages without public profile data", () => {
  assert.throws(() => parsePreloadedProfile("<html></html>"), /__PRELOADED_DATA__/);
});
