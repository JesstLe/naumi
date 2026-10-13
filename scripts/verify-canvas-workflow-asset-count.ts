// Local PostgreSQL and generated pixels only; no external assets or model calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { getPool, getOrCreateUser } from "../src/lib/db";
import type { prepareWorkflowPixels } from "../src/lib/canvas-workflow-import";
import { readWorkflowClipboard } from "../src/lib/canvas/workflow-clipboard";
import { MEDIA_DIR } from "../src/lib/storage";
import { signUserSession } from "../src/lib/native-auth";
import { POST } from "../src/app/api/canvas/workflow-import/route";
import { clipboardHtml, gaodingFixture } from "./fixtures/gaoding-clipboard";

const baseline = process.argv.includes("--baseline");
const email = "asset-count@fixture.local";
function input(count: number) {
  const prototype = gaodingFixture().elements[0].elements![0];
  const elements = Array.from({ length: count }, (_, i) => ({ ...prototype,
    title: `asset-${i}`, left: i * 100, top: 0,
    metaInfo: { $clipboard: { sourceUuid: `asset-${i}` }, workflow: { previous: [] } },
  }));
  return { operationId: randomUUID(), html: clipboardHtml({ version: "10.0.0", elements }), projectKey: null, x: 0, y: 0 };
}
async function main() {
  const { importCanvasWorkflow } = await import(process.env.WORKFLOW_IMPORT_SOURCE_PATH
    ? pathToFileURL(process.env.WORKFLOW_IMPORT_SOURCE_PATH).href : "../src/lib/canvas-workflow-import");
  assert.equal(process.env.DATABASE_URL, "postgresql://count_fixture:count_fixture_only@127.0.0.1:55471/count_fixture");
  assert.match(MEDIA_DIR.replaceAll("\\", "/"), /canvas-workflow-asset-limit-20261013\/media$/);
  const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#eef2ff" } }).png().toBuffer();
  let active = 0, peak = 0;
  const prepare: typeof prepareWorkflowPixels = async () => {
    active++; peak = Math.max(peak, active);
    try { await new Promise(r => setTimeout(r, 2)); return { bytes: png, width: 8, height: 8 }; }
    finally { active--; }
  };
  if (baseline) {
    let calls = 0;
    await assert.rejects(() => importCanvasWorkflow(email, input(61), { prepare: async (...args) => { calls++; return prepare(...args); } }), /一次最多同步 60 个图片素材，请分批复制/);
    assert.equal(calls, 0);
    console.log("BASELINE=PASS assets=61 result=REJECTED error=一次最多同步 60 个图片素材，请分批复制 downloads=0");
    return;
  }
  await getOrCreateUser(email, "素材数量验收");
  const ledger = async () => (await getPool().query("SELECT count(*)::int AS count,coalesce(sum(delta),0)::int AS delta FROM app_ledger")).rows[0];
  const before = await ledger();
  for (const count of [61, 100, 200]) {
    const request = input(count), ticks: number[] = [];
    const result = await importCanvasWorkflow(email, request, { prepare, progress: (done, total) => { assert.equal(total, count); ticks.push(done); } });
    assert.equal(result.artworks.length, count);
    assert.deepEqual(ticks, Array.from({ length: count + 1 }, (_, i) => i));
    const persisted = await getPool().query("SELECT count(*)::int AS count FROM app_artworks WHERE email=$1 AND id=ANY($2::text[])", [email, result.artworks.map(n => n.id)]);
    assert.equal(persisted.rows[0].count, count);
    for (const n of result.artworks) assert.deepEqual(await readFile(path.join(MEDIA_DIR, n.image!.slice(7))), png);
    const retried = await importCanvasWorkflow(email, request, { prepare: async () => { throw Error("retry must not download"); } });
    assert.deepEqual(retried, result);
    console.log(`IMPORT=PASS assets=${count} persisted=${count} progress=0..${count} retry=IDEMPOTENT`);
  }
  const request = input(61), cookie = `nv_user=${signUserSession(email, Date.now())}`;
  // Small path vectors exercise production pixel preparation through the real route.
  const vectors = { type: "path", title: "vector", width: 2048, height: 1600, left: 0, top: 0,
    path: "M0 0 L2048 0 L2048 1600 L0 1600 Z" };
  request.html = clipboardHtml({ version: "10.0.0", elements: [...Array.from({ length: 61 }, (_, i) => ({ ...vectors,
    metaInfo: { $clipboard: { sourceUuid: `vector-${i}` } },
  })), { ...gaodingFixture().elements[0].elements![1], metaInfo: { $clipboard: { sourceUuid: "text-anchor" } } }] });
  const response = await POST(new Request("http://fixture/api/canvas/workflow-import", { method: "POST", headers: { cookie }, body: JSON.stringify(request) }));
  const responseBody = await response.text();
  assert.equal(response.status, 200, responseBody);
  const events = responseBody.trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(events.filter(e => e.type === "progress").map(e => e.done), Array.from({ length: 62 }, (_, i) => i));
  assert.equal(events.at(-1).type, "complete");
  assert.equal(events.at(-1).result.artworks.length, 61);
  console.log("ROUTE=PASS nontext_assets=61 complete=61 progress=0..61 production_vectors=YES");
  async function noPartial(operationId: string) {
    assert.equal((await getPool().query("SELECT count(*)::int AS count FROM app_canvas_workflow_imports WHERE operation_id=$1", [operationId])).rows[0].count, 0);
    assert.equal((await getPool().query("SELECT count(*)::int AS count FROM app_artworks WHERE creation_provenance->>'ref'=$1", [operationId])).rows[0].count, 0);
    assert.deepEqual(await readdir(path.join(MEDIA_DIR, "canvas-imports", operationId)).catch(() => []), []);
  }
  let cancelled = false;
  const cancel = input(61);
  await assert.rejects(() => importCanvasWorkflow(email, cancel, { prepare, cancelled: () => cancelled, progress: done => { if (done === 5) cancelled = true; } }), /取消/);
  await noPartial(cancel.operationId);
  let calls = 0;
  const fail = input(100);
  await assert.rejects(() => importCanvasWorkflow(email, fail, { prepare: async (...args) => { if (++calls === 10) throw Error("图片素材故障"); return prepare(...args); } }), /素材故障/);
  await noPartial(fail.operationId);
  assert.throws(() => readWorkflowClipboard(input(201).html), /一次最多导入 200 个元素/);
  assert.ok(peak <= 4 && peak > 1, `peak=${peak}`);
  assert.deepEqual(await ledger(), before);
  console.log(`REGRESSION=PASS max_concurrency=${peak} cancel=ZERO_PARTIAL failure=ZERO_PARTIAL element_201=REJECTED ledger=UNCHANGED model_calls=0`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => getPool().end());
