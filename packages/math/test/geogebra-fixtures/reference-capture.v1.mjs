// Generated from verified Actions reference capture; never includes author assets.
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const raw=readFileSync(new URL("./reference-capture.v1.json",import.meta.url));
if(createHash("sha256").update(raw).digest("hex")!=="8d0dff9aadaea4d93029b188b0658ff00b97321a2d9d8e4eb6518315e75692b0")throw new Error("Reference fixture corruption");
export default JSON.parse(raw.toString("utf8"));
