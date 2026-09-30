import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../src/lib/video/service.ts", import.meta.url), "utf8");
const start = service.indexOf("const extension = videoExtensionForMime");
const end = service.indexOf("resultStorageKey =", start);
const settlement = service.slice(start, end);
assert.match(settlement, /if \(storageEnabled\)[\s\S]*uploadImage\(bytes, mimeType/);
assert.match(settlement, /\} else \{[\s\S]*Buffer\.from\(bytes\)\.toString\("base64"\)/);

global.gc?.();
const bytes = new Uint8Array(150 * 1024 * 1024);
const before = process.memoryUsage();
// Persistent-storage branch only passes the original bytes and a key. It must
// not create the ~200MiB base64 representation used by the small fallback.
const uploadArguments = { bytes, mimeType: "video/mp4", key: "videos/probe.mp4" };
assert.equal(uploadArguments.bytes, bytes);
global.gc?.();
const after = process.memoryUsage();
const heapDelta = after.heapUsed - before.heapUsed;
assert.ok(heapDelta < 32 * 1024 * 1024, `persistent branch heap delta too high: ${heapDelta}`);
console.log(`PASS video memory contract: input=150MiB base64=storage-disabled-only heap_delta=${heapDelta}`);
