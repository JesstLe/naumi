import assert from "node:assert/strict";
import { createVideoFixture } from "./video-fusion/harness";
const h=await createVideoFixture();
try {
  const other=await h.request("b","GET",`/media/${h.refs.image.storageKey}`);
  assert.equal(other.status,404);
  assert.ok(h.refs.video.durationSeconds>=4);assert.ok(h.refs.video.hasVideoStream);
  const mine=await h.request("a","GET",`/media/${h.refs.video.storageKey}`);
  assert.equal(mine.status,200);assert.ok((mine.body as ArrayBuffer).byteLength>1000);
  assert.equal(await h.dbCount("app_video_tasks"),0);
  assert.equal(h.supplierCalls().filter(c=>c.phase==="create").length,0);
  assert.ok(h.supplierCalls().some(c=>c.signatureVerified));
  process.stdout.write("VIDEO_FIXTURE=PASS private_media=true original_assets=true paid_calls=0\n");
} finally {await h.stop();}
