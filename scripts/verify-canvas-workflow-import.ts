import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getPool, getOrCreateUser, listArtworksByIds, listCanvasTextNodes, type ArtworkRecord } from "../src/lib/db";
import { importCanvasWorkflow, prepareWorkflowPixels, fillWorkflowAsset, listWorkflowManifests, type WorkflowImportResult } from "../src/lib/canvas-workflow-import";
import { saveCanvasHistory, historyRequest } from "../src/lib/canvas-history";
import { listCanvasNodeSettings } from "../src/lib/canvas-node-settings-store";
import { readWorkflowClipboard } from "../src/lib/canvas/workflow-clipboard";
import { MEDIA_DIR } from "../src/lib/storage";
import { signUserSession } from "../src/lib/native-auth";
import { POST, GET } from "../src/app/api/canvas/workflow-import/route";
import { POST as saveText } from "../src/app/api/canvas/text-nodes/route";
import { POST as fillRoute } from "../src/app/api/canvas/workflow-import/asset/route";
import { gaodingFixture, clipboardHtml } from "./fixtures/gaoding-clipboard";

async function main() {
  assert.equal(process.env.DATABASE_URL, "postgresql://naumi_fixture:fixture_local_only@127.0.0.1:13049/naumi_workflow_paste_acceptance", "isolated test DB only");
  assert.match(MEDIA_DIR.replaceAll("\\", "/"), /canvas-workflow-paste-20261010\/media$/);
  const out = path.dirname(MEDIA_DIR);
  const email = "workflow-paste@fixture.local", other = "workflow-other@fixture.local";
  const user = await getOrCreateUser(email, "工作流验收"); await getOrCreateUser(other, "隔离账号");
  const ledger = async () => (await getPool().query("SELECT count(*)::int AS count,coalesce(sum(delta),0)::int AS delta FROM app_ledger")).rows[0];
  const before = await ledger();
  const png = await sharp({ create: { width: 64, height: 48, channels: 4, background: "#e4e9f2" } }).png().toBuffer();
  const fakePixels: typeof prepareWorkflowPixels = async () => ({ bytes: png, width: 64, height: 48 });
  const html = clipboardHtml(gaodingFixture());
  const input = { html, operationId: randomUUID(), projectKey: null, x: 100, y: 140 };
  const ticks: number[] = [];
  const r = await importCanvasWorkflow(email, input, { prepare: fakePixels, progress: (done, total) => { assert.equal(total, 4); ticks.push(done); } });
  assert.equal(r.artworks.length, 4); assert.equal(r.textNodes.length, 2);
  assert.equal(r.manifest.groups.length, 2); assert.equal(r.manifest.decorations.length, 2);
  assert.deepEqual(ticks, [0, 1, 2, 3, 4]);
  assert.deepEqual(await importCanvasWorkflow(email, input, { prepare: async () => { throw Error("must not download on retry"); } }), r);
  await assert.rejects(() => importCanvasWorkflow(email, { ...input, x: 0 }, { prepare: fakePixels }), /编号已使用/);
  await assert.rejects(() => importCanvasWorkflow(other, { ...input, operationId: randomUUID(), projectKey: r.projectKey }, { prepare: fakePixels }), /无权访问/);
  const art = await listArtworksByIds(email, r.artworks.map(n => n.id)), text = await listCanvasTextNodes(email);
  assert.equal(art.length, 4); assert.equal(text.length, 2);
  assert.deepEqual(await listArtworksByIds(other, r.artworks.map(n => n.id)), []);
  const bySource = new Map(r.manifest.origins.map(n => [n.sourceId, n.id]));
  assert.deepEqual(text.find(n => n.id === bySource.get("text-b"))!.sourceIds, [bySource.get("text-a")]);
  assert.equal(text.find(n => n.id === bySource.get("text-b"))!.height, 7812.5);
  assert.equal(art.find(n => n.id === bySource.get("image-b"))!.parentId, bySource.get("image-a"));
  assert.deepEqual(text.find(n => n.id === bySource.get("text-b"))!.targetIds, [bySource.get("image-b")]);
  for (const n of art) {
    assert.match(n.image!, /^\/media\/canvas-imports\//);
    const bytes = await fs.readFile(path.join(MEDIA_DIR, n.image!.slice("/media/".length)));
    assert.equal((await sharp(bytes).metadata()).format, "png");
  }
  const cookie = `nv_user=${signUserSession(email, Date.now())}`;
  assert.equal((await POST(new Request("http://fixture/api/canvas/workflow-import", { method: "POST", body: "{}" }))).status, 401);
  assert.equal((await GET(new Request("http://fixture/api/canvas/workflow-import"))).status, 401);
  assert.equal((await GET(new Request(`http://fixture/api/canvas/workflow-import?email=${other}`, { headers: { cookie } }))).status, 401);
  assert.equal((await POST(new Request("http://fixture/api/canvas/workflow-import", { method: "POST", body: "{}", headers: { cookie } }))).status, 400);
  assert.equal((await POST(new Request("http://fixture/api/canvas/workflow-import", { method: "POST", body: "x".repeat(8*1024*1024+4097), headers: { cookie } }))).status, 413);
  const retry = await POST(new Request("http://fixture/api/canvas/workflow-import", { method: "POST", body: JSON.stringify(input), headers: { cookie } }));
  const events = (await retry.text()).trim().split("\n").map(v => JSON.parse(v));
  assert.equal(events.at(-1).type, "complete"); assert.equal(events.at(-1).result.operationId, r.operationId);
  const node = text.find(n => n.id === bySource.get("text-b"))!;
  const saved = await saveText(new Request("http://fixture/api/canvas/text-nodes", { method: "POST", headers: { cookie }, body: JSON.stringify({ ...node, content: node.content + "\n已编辑" }) }));
  assert.equal(saved.status, 200); assert.equal((await saved.json()).node.height, 7813);
  const cycleText=text.find(n=>n.id===bySource.get("text-a"))!;
  const rejected=await saveText(new Request("http://fixture/api/canvas/text-nodes",{method:"POST",headers:{cookie},body:JSON.stringify({...cycleText,sourceIds:[node.id]})}));
  assert.equal(rejected.status,400);assert.match((await rejected.json()).error,/循环/);
  const hide = historyRequest.parse({ operationId: randomUUID(), operations: [...r.artworks.map(n => ({ type: "visibility", id: n.id, visible: false })), ...r.textNodes.map(n => ({ type: "text-delete", id: n.id }))] });
  await saveCanvasHistory(email, hide);
  assert.equal((await listArtworksByIds(email, r.artworks.map(n => n.id))).length, 0);
  assert.equal((await listCanvasTextNodes(email)).length, 0);
  await assert.rejects(() => importCanvasWorkflow(email, input, { prepare: fakePixels }), /撤销或删除/);
  const restore = historyRequest.parse({ operationId: randomUUID(), operations: [...r.artworks.map(n => ({ type: "visibility", id: n.id, visible: true })), ...r.textNodes.map(node => ({ type: "text-restore", node }))] });
  await saveCanvasHistory(email, restore);
  assert.equal((await listCanvasTextNodes(email)).find(n => n.id === node.id)!.height, 7812.5);
  assert.deepEqual(await listCanvasNodeSettings(email), r.settings);
  assert.deepEqual((await listWorkflowManifests(email))[0], r.manifest);
  console.log("POSTGRES=PASS ATOMIC=6_LEAVES GROUPS=2 LINKS=4 RETRY=IDEMPOTENT OWNER=ENFORCED ROUTES=401_400_413 LONG_TEXT=7812.5 UNDO_REDO=ONE_STEP STYLES=RESTORED FIXTURE_PIXELS=LOCAL");

  async function noPartial(operationId: string) {
    assert.equal((await getPool().query("SELECT count(*)::int AS count FROM app_canvas_workflow_imports WHERE operation_id=$1", [operationId])).rows[0].count, 0);
    const files = await fs.readdir(path.join(MEDIA_DIR, "canvas-imports", operationId)).catch(() => []);
    assert.deepEqual(files, []);
    assert.equal((await listCanvasTextNodes(email)).length, 2);
    assert.equal((await getPool().query("SELECT count(*)::int AS count FROM app_artworks WHERE email=$1", [email])).rows[0].count, 4);
  }
  let calls = 0;
  const badMedia = randomUUID();
  await assert.rejects(() => importCanvasWorkflow(email, { ...input, operationId: badMedia }, { prepare: async () => { if (++calls === 2) throw Error("图片素材故障"); return fakePixels(readWorkflowClipboard(html)!.nodes[0], 1); } }), /素材故障/);
  await noPartial(badMedia);
  let cancelled = false; const cancelId = randomUUID();
  await assert.rejects(() => importCanvasWorkflow(email, { ...input, operationId: cancelId }, { prepare: fakePixels, cancelled: () => cancelled, progress: done => { if (done) cancelled = true; } }), /取消/);
  await noPartial(cancelId);
  const dbFailure = randomUUID();
  await getPool().query("ALTER TABLE app_canvas_text_nodes ADD CONSTRAINT workflow_fixture_failure CHECK (email <> 'workflow-paste@fixture.local' OR id IN (SELECTED))".replace("(SELECTED)", `('${r.textNodes.map(n => n.id).join("','")}')`));
  try { await assert.rejects(() => importCanvasWorkflow(email, { ...input, operationId: dbFailure }, { prepare: fakePixels })); }
  finally { await getPool().query("ALTER TABLE app_canvas_text_nodes DROP CONSTRAINT workflow_fixture_failure"); }
  await noPartial(dbFailure);
  console.log("FAULTS=PASS MEDIA_FAILURE=ZERO_PARTIAL DB_FAILURE=ZERO_PARTIAL CANCEL=ZERO_PARTIAL UPLOADED_FILES=CLEANED");

  let real: WorkflowImportResult | null = null, publicHtml = html;
  if (process.env.WORKFLOW_REAL_SAMPLE) {
    const realHtml = await fs.readFile(process.env.WORKFLOW_REAL_SAMPLE, "utf8");
    const actual = readWorkflowClipboard(realHtml)!;
    const pixels = new Map<string, Awaited<ReturnType<typeof prepareWorkflowPixels>>>(), unavailable: string[] = [];
    for (const n of actual.nodes.filter(n => n.kind !== "text")) {
      const pixel = await prepareWorkflowPixels(n, actual.scale);
      if (pixel.missingAsset) unavailable.push(n.sourceId); else pixels.set(n.sourceId, pixel);
    }
    assert.equal(pixels.size, 8); assert.equal(unavailable.length, 9);
    let count = 0;
    real = await importCanvasWorkflow(other, { ...input, operationId: randomUUID(), html: realHtml }, { progress: done => { count = done; } });
    assert.equal(count, 17); assert.equal(real.artworks.length, 17); assert.equal(real.textNodes.length, 16);
    assert.equal(real.manifest.groups.length, 5); assert.equal(real.manifest.decorations.length, 6);
    const edges = real.artworks.reduce((s,n) => s + Number(!!n.parentId) + (n.parentIds?.length || 0), 0) + real.textNodes.reduce((s,n) => s + n.sourceIds.length + n.targetIds.length, 0);
    assert.equal(edges, 19);
    for (const n of real.artworks) assert.equal((await sharp(await fs.readFile(path.join(MEDIA_DIR, n.image!.slice(7)))).metadata()).format, "png");
    assert.equal(actual.nodes.filter(n => n.kind === "text").reduce((s,n) => s + n.content.length, 0), real.textNodes.reduce((s,n) => s + n.content.length, 0));
    assert.equal(real.artworks.filter(n=>n.source==="workflow-placeholder").length,9);
    for (const origin of real.manifest.origins.filter(o=>o.missingAsset)) {
      const original=actual.nodes.find(n=>n.sourceId===origin.sourceId)!;
      const imported: ArtworkRecord=real.artworks.find(n=>n.id===origin.id)!;
      assert.equal(imported.canvasWidth,original.width);assert.equal(imported.canvasHeight,original.height);
      assert.equal(imported.canvasX,input.x+original.x);assert.equal(imported.canvasY,input.y+original.y);
      assert.equal(origin.missingAsset,"素材 HTTP 403");
    }
    const fixture = JSON.parse(JSON.stringify(gaodingFixture()));
    const publicUrl = actual.nodes.find(n => n.kind === "image" && pixels.has(n.sourceId))!.url;
    const replace = (nodes: typeof fixture.elements) => { for (const n of nodes) { if (n.type === "image") n.url = publicUrl; if (n.elements) replace(n.elements); } }; replace(fixture.elements);
    publicHtml = clipboardHtml(fixture);
    console.log("REAL_IMPORT=PASS TEXT=16 GROUPS=5 DECORATIONS=6 LINKS=19 TEXT_LOSS=0 PUBLIC_ASSETS=8 HTTP_403_PLACEHOLDERS=9 ORIGINAL_LAYOUT=RETAINED");
    const placeholder=real.artworks.find(n=>n.source==="workflow-placeholder")!,fillId=randomUUID();
    await assert.rejects(()=>fillWorkflowAsset(email,placeholder.id,randomUUID(),png),/无权/);
    await getPool().query("UPDATE app_canvas_node_settings SET settings=jsonb_set(settings,'{locked}','true') WHERE email=$1 AND node_id=$2",[other,placeholder.id]);
    await assert.rejects(()=>fillWorkflowAsset(other,placeholder.id,randomUUID(),png),/解锁/);
    await getPool().query("UPDATE app_canvas_node_settings SET settings=jsonb_set(settings,'{locked}','false') WHERE email=$1 AND node_id=$2",[other,placeholder.id]);
    await assert.rejects(()=>fillWorkflowAsset(other,placeholder.id,randomUUID(),Buffer.from('<svg/>')));
    const filled=await fillWorkflowAsset(other,placeholder.id,fillId,png);
    assert.deepEqual(await fillWorkflowAsset(other,placeholder.id,fillId,png),filled);
    await assert.rejects(()=>fillWorkflowAsset(other,placeholder.id,fillId,Buffer.from('other')),/编号已使用/);
    assert.equal(filled.node.id,placeholder.id);assert.equal(filled.node.source,"workflow-import");
    const late=await importCanvasWorkflow(other,{...input,operationId:real.operationId,html:realHtml});
    assert.equal(late.artworks.find(n=>n.id===placeholder.id)!.image,filled.node.image);
    assert.equal(late.artworks.find(n=>n.id===placeholder.id)!.source,"workflow-import");
    for(const key of ["canvasX","canvasY","canvasWidth","canvasHeight","groupId","canvasGroupId","parentId","parentIds","prompt"] as const)assert.deepEqual(filled.node[key],placeholder[key],key);
    assert.equal((await fillRoute(new Request("http://fixture/api/canvas/workflow-import/asset",{method:"POST"}))).status,401);
    const swap=async(filled:boolean)=>saveCanvasHistory(other,historyRequest.parse({operationId:randomUUID(),operations:[{type:"workflow-asset",id:placeholder.id,assetOperationId:fillId,filled}]}));
    await swap(false);assert.equal((await listArtworksByIds(other,[placeholder.id]))[0].image,placeholder.image);
    await swap(true);assert.equal((await listArtworksByIds(other,[placeholder.id]))[0].image,filled.node.image);
    await swap(false);
    console.log("FILL=PASS SAME_NODE=YES RELATIONS_LAYOUT=UNCHANGED RETRY=IDEMPOTENT OWNER=ENFORCED INVALID_MEDIA=REJECTED UNDO_REDO=PIXEL_VERSIONS");
  }
  assert.deepEqual(await ledger(), before);
  // Private fixture seed, ignored output only. Never embed customer clipboard in committed tests.
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, "browser-seed.json"), JSON.stringify({ user, cookie, email, input: { ...input, html: publicHtml }, result: r, real, realEmail: other, realCookie: `nv_user=${signUserSession(other, Date.now())}`, ledger: before }));
  console.log("LEDGER=UNCHANGED MODEL_CALLS=0 BROWSER_SEED=READY");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => getPool().end());
