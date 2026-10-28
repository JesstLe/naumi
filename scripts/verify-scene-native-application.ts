import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import {newCharacterProject,characterInputIdentity} from "../src/lib/character/project";
import { newSceneProject, sceneInputIdentity } from "../src/lib/scene/project";
import { createVideoFixture, CAP_RICH } from "./video-fusion/harness";
import { verifySceneInteractions } from "./verify-scene-native-interactions";
import { prepareVideoAssets } from "./video-fusion/assets.mjs";

/** Real local app/DB/task/worker/media/billing. Suppliers are isolated fixtures, not paid providers. */
async function main() {
  const out = path.resolve(process.argv[2] || "output/scene-native-application");
  await mkdir(out, { recursive: true });
  const owner = "canvas-scene-native-20261028", name = "scene-native-app-" + randomUUID();
  const password = randomBytes(24).toString("hex"), database = "naumi_video_fixture_native_" + randomBytes(6).toString("hex");
  const envFile = path.join(out, name + ".env");
  await writeFile(envFile, `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`, { mode: 0o600 });
  function docker(args: string[]) {
    const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  }
  let container = "", pool: Pool | undefined, fixture: Awaited<ReturnType<typeof createVideoFixture>> | undefined, listening = false;
  let digest = "";
  const publications = new Map<string, unknown>();
  const router = createServer(async (req, res) => {
    try {
      const parts: Buffer[] = []; for await (const part of req) parts.push(part);
      const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
      const send = (status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value)); };
      if (req.url === "/internal/config/state") return send(200, { digest });
      if (req.url === "/internal/config/prepare") return send(200, { digest: body.digest, phase: "prepared" });
      if (req.url === "/internal/config/activate") { if (body.expectedDigest !== digest) return send(409, {}); digest = body.digest; const value = { id: body.id, digest, phase: "applied" }; publications.set(body.id, value); return send(200, value); }
      if (req.url?.startsWith("/internal/config/publications/")) { const value = publications.get(req.url.split("/").at(-1)!); return send(value ? 200 : 404, value || {}); }
      send(404, {});
    } catch { res.writeHead(500); res.end(); }
  });
  try {
    container = docker(["run", "--detach", "--rm", "--name", name, "--label", `naumi.task=${owner}`, "--memory", "768m", "--cpus", "2", "--tmpfs", "/var/lib/postgresql/data", "--publish", "127.0.0.1::5432", "--env-file", envFile, "postgres:16-alpine"]);
    let ready = false;
    for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", database], { windowsHide: true, stdio: "ignore" }).status === 0) { ready = true; break; } await new Promise(resolve => setTimeout(resolve, 200)); }
    assert.ok(ready);
    const port = Number(docker(["port", container, "5432/tcp"]).split(":").at(-1));
    const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
    // pg_isready in the container can observe initdb's temporary Unix-socket
    // server. Verify the published TCP database before starting the application.
    let tcpReady = false;
    for (let i = 0; i < 60; i++) {
      const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });
      client.on("error", () => undefined);
      try { await client.connect(); await client.query("SELECT 1"); tcpReady = true; }
      catch { await new Promise(resolve => setTimeout(resolve, 200)); }
      finally { await client.end().catch(() => undefined); }
      if (tcpReady) break;
    }
    assert.ok(tcpReady, "Published isolated PostgreSQL TCP connection must be ready");
    pool = new Pool({ connectionString: databaseUrl, max: 2 });
    await pool.query("CREATE TABLE public.naumi_video_fixture_guard(owner text NOT NULL)");
    await pool.query("INSERT INTO public.naumi_video_fixture_guard VALUES($1)", ["canvas-video-fusion-20261013"]);
    await new Promise<void>(resolve => router.listen(0, "127.0.0.1", resolve)); listening = true;
    process.env.NAUMI_VERIFY_ISOLATED_DB = "1"; process.env.VIDEO_FIXTURE_DATABASE_URL = databaseUrl;
    process.env.VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL = `http://127.0.0.1:${(router.address() as { port: number }).port}`;
    process.env.VIDEO_FIXTURE_ROUTER_TOKEN = randomBytes(32).toString("hex"); process.env.VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET = randomBytes(32).toString("hex");
    const assetsRoot = path.join(out, "assets"); await prepareVideoAssets(assetsRoot, [4]);
    const h = fixture = await createVideoFixture({ startWorker: false, databaseUrl, assetsRoot, videoDefinition: { ...CAP_RICH, providerOptions: { seed: { type: "integer", minimum: 0, maximum: 9999 } } } });
    const id = "scene-" + randomUUID(), projectKey = `tree:${id}`, scene = newSceneProject("庭院");
    scene.description = "石阶连接木廊，石桌靠东"; scene.states[0].referenceArtworkIds = [h.refs.image.id]; scene.states[0].background = {artworkId:h.refs.image.id,projection:"image"};
    scene.states.push({ id: "night", name: "夜景", description: "木廊暖灯照明", referenceArtworkIds: [h.refs.lastImage.id], background:{artworkId:h.refs.lastImage.id,projection:"panorama"} });
    const create = { id, projectKey, scene, expectedRevision: 0, operationId: randomUUID() };
    const freeBefore = await h.creditState("a");
    const created = await h.request<any>("a", "POST", "/api/canvas/scene-nodes", create);
    assert.equal(created.status, 201, JSON.stringify(created.body)); assert.equal(created.body.node.revision, 1);
    assert.equal((await h.request<any>("a", "POST", "/api/canvas/scene-nodes", create)).body.node.revision, 1);
    assert.equal((await h.request("b", "GET", `/api/canvas/scene-nodes/${id}`)).status, 404);
    const foreign = await h.request("b", "POST", "/api/canvas/scene-nodes", { ...create, id: "scene-" + randomUUID(), projectKey: undefined, operationId: randomUUID() }); assert.equal(foreign.status, 404);
    const concurrent = await Promise.all([0, 10].map(x => h.request<any>("a", "PATCH", `/api/canvas/scene-nodes/${id}`, { expectedRevision: 1, operationId: randomUUID(), x })));
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
    const saved = (await h.request<any>("a", "GET", `/api/canvas/scene-nodes/${id}`)).body.node;
    assert.equal(saved.revision, 2);
    const invalid = await h.request("a", "PATCH", `/api/canvas/scene-nodes/${id}`, { expectedRevision: 2, operationId: randomUUID(), scene: { ...scene, states: [{ ...scene.states[0], referenceArtworkIds: [h.refs.video.id], background:{artworkId:h.refs.video.id,projection:"image"} }] } }); assert.equal(invalid.status, 404);
    assert.deepEqual(await h.creditState("a"), freeBefore);

    const characterId="character-scene-"+randomUUID(),character=newCharacterProject("司灯人");character.description="蓝色工作服";character.appearances[0].referenceArtworkIds=[h.refs.lastImage.id];
    const characterCreated=await h.request<any>("a","POST","/api/canvas/character-nodes",{id:characterId,projectKey,character,expectedRevision:0,operationId:randomUUID()});assert.equal(characterCreated.status,201,JSON.stringify(characterCreated.body));
    const input = { id: "role-identity", nodeId: sceneInputIdentity(id, "base"), kind: "text", role: "context", value: "FORGED_CLIENT_DESCRIPTION" };
    const inputs = [input, {id:"person",nodeId:characterInputIdentity(characterId,"base"),kind:"text",role:"context",value:"FORGED_CHARACTER"}, { id: "comparison", nodeId: h.refs.lastImage.id, kind: "image", role: "reference", value: h.refs.lastImage.url }];
    const config = { modelId: "video-a", providerId: "managed-video", mode: "reference", prompt: "保持 {{ref 1}}，人物 {{ref 2}}，对比 {{ref 3}}，另看 图片1", durationSeconds: 4, resolution: "720p", aspectRatio: "16:9", generateAudio: false, providerOptions: { seed: 0 } };
    async function videoNode(nodeId: string) {
      const result = await h.request<any>("a", "POST", "/api/canvas/video-nodes", { id: nodeId, projectKey, expectedRevision: 0, operationId: randomUUID(), config, inputs });
      assert.equal(result.status, 201, JSON.stringify(result.body)); return result.body.node;
    }
    async function generate(nodeId: string) {
      const request = { expectedRevision: 1, idempotencyKey: randomUUID() };
      const sent = await h.request<any>("a", "POST", `/api/canvas/video-nodes/${nodeId}/generate`, request); assert.equal(sent.status, 202, JSON.stringify(sent.body));
      assert.equal((await h.request<any>("a", "POST", `/api/canvas/video-nodes/${nodeId}/generate`, request)).body.taskId, sent.body.taskId);
      let task: any;
      for (const deadline = Date.now() + 180000; Date.now() < deadline;) {
        await h.forceVideoPollDue(sent.body.taskId); await h.tick(); task = (await h.request<any>("a", "GET", `/api/video/tasks?id=${sent.body.taskId}`)).body.task;
        if (task.status === "completed") break;
        assert.ok(!["failed", "cancelled", "needs_attention"].includes(task.status), JSON.stringify(task)); await new Promise(resolve => setTimeout(resolve, 300));
      }
      assert.equal(task.status, "completed"); return { task, request };
    }
    const firstId = "vnode-role-first-" + randomUUID(); await videoNode(firstId);
    const first = await generate(firstId), frozen = await h.taskPersistence("a", first.task.id);
    const request = frozen.parameters.request;
    assert.ok(request.prompt.includes("石阶连接木廊，石桌靠东")); assert.ok(!request.prompt.includes("FORGED_CLIENT_DESCRIPTION"));
    assert.ok(request.prompt.includes("对比 图片3，另看 图片3")); assert.ok(request.prompt.includes("场景参考：图片1"));
    assert.equal(request.orderedInputs[0].nodeId, `inline:scene:${id}#base@2`);
    assert.deepEqual(frozen.video_references.map((ref: any) => ref.artworkId), [h.refs.image.id, h.refs.lastImage.id, h.refs.lastImage.id]);
    assert.equal(request.orderedInputs[2].nodeId,`inline:character:${characterId}#base@1`);assert.ok(request.prompt.includes("角色参考：图片2"));assert.ok(!request.prompt.includes("FORGED_CHARACTER"));
    const firstRequest = JSON.stringify(request);
    const changed = structuredClone(scene); changed.description = "石阶连接木廊，石桌靠东，夜雨"; changed.states[0].referenceArtworkIds = [h.refs.lastImage.id]; changed.states[0].background={artworkId:h.refs.lastImage.id,projection:"image"};
    const edited = await h.request<any>("a", "PATCH", `/api/canvas/scene-nodes/${id}`, { expectedRevision: 2, operationId: randomUUID(), scene: changed }); assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.equal(edited.body.node.revision, 3);
    const secondId = "vnode-role-next-" + randomUUID(); await videoNode(secondId);
    const second = await generate(secondId), next = await h.taskPersistence("a", second.task.id);
    assert.ok(next.parameters.request.prompt.includes("夜雨")); assert.equal(next.parameters.request.orderedInputs[0].nodeId, `inline:scene:${id}#base@3`);
    assert.equal(next.video_references[0].artworkId, h.refs.lastImage.id);
    assert.equal(JSON.stringify((await h.taskPersistence("a", first.task.id)).parameters.request), firstRequest);
    const asset = first.task.resultAssets.find((item: any) => item.kind === "video"); assert.ok(asset);
    const bytes = await h.request<ArrayBuffer>("a", "GET", asset.url); assert.equal(bytes.status, 200); assert.equal(createHash("sha256").update(Buffer.from(bytes.body)).digest("hex"), asset.sha256);
    assert.equal((await h.request("b", "GET", asset.url)).status, 404);
    const removed = await h.request("a", "PATCH", `/api/canvas/scene-nodes/${id}`, { expectedRevision: 3, operationId: randomUUID(), deleted: true }); assert.equal(removed.status, 200);
    assert.equal((await h.request("a", "GET", `/api/canvas/scene-nodes/${id}`)).status, 404);
    assert.equal((await h.request<any>("a", "POST", `/api/canvas/video-nodes/${firstId}/generate`, first.request)).body.taskId, first.task.id);
    const credits = await h.creditState("a"), current = (await h.request<any>("a", "GET", `/api/canvas/video-nodes/${secondId}`)).body.node;
    const missing = await h.request("a", "POST", `/api/canvas/video-nodes/${secondId}/generate`, { expectedRevision: current.revision, idempotencyKey: randomUUID() }); assert.equal(missing.status, 404, JSON.stringify(missing.body)); assert.deepEqual(await h.creditState("a"), credits);
    const imageRemoved = await h.request("a", "POST", "/api/canvas/nodes/delete", { artworkIds: [h.refs.image.id], operationId: randomUUID() });
    assert.equal(imageRemoved.status, 200, JSON.stringify(imageRemoved.body));
    const replayAfterRemoval = await h.request<any>("a", "POST", "/api/canvas/scene-nodes", create); assert.equal(replayAfterRemoval.status, 201, JSON.stringify(replayAfterRemoval.body)); assert.equal(replayAfterRemoval.body.node.revision, 1);
    assert.equal((await h.request("a", "GET", `/api/canvas/scene-nodes/${id}`)).status, 404);
    assert.equal(h.supplierCalls().filter(call => call.phase === "create").length, 2);
    if(process.argv.includes("--api-only")){await writeFile(path.join(out,"result.json"),JSON.stringify({realAppDbWorker:true,mixedCharacterSceneNumbering:true,sceneSnapshotImmutable:true,privateMediaHash:true,simulatedCreates:2,paidCalls:0},null,2));console.log("SCENE_API=PASS MIXED_CHARACTER_SCENE_IMAGES=NUMBERED_ONCE REAL_APP_DB_WORKER=PASS SNAPSHOTS=IMMUTABLE CROSS_ACCOUNT=404 MEDIA_HASH=PASS SIMULATED_CREATES=2 PAID_CALLS=0");return;}
    const interactions = await verifySceneInteractions(h, out, secondId);
    assert.equal(h.supplierCalls().filter(call => call.phase === "create").length, 5);
    await writeFile(path.join(out, "result.json"), JSON.stringify({ realApp: true, realPostgres: true, realWorkerStorageBilling: true, sceneRevisionOneWinner: true, crossAccount404: true, forgedClientDefinitionIgnored: true, expandedReferenceOrderStable: true, sceneAndStateIdentityFrozen: true, laterEditLeavesOldTaskUnchanged: true, twoNodesReuseSameScene: true, savedReplayAfterDependencyDeletion: true, acceptedTaskReplayAfterSceneDeletion: true, missingSceneNoCharge: true, privateOutputHash: true, simulatedSupplierCreates: 5, paidCalls: 0, uiTested: true, menuEnabled: true, interactions, taskIds: [first.task.id, second.task.id] }, null, 2));
    console.log("SCENE_APPLICATION=PASS REAL_APP_DB_WORKER_STORAGE_BILLING=PASS REVISION=ONE_WINNER CROSS_ACCOUNT=404 SERVER_SCENE=TRUSTED EXPANDED_ORDER=STABLE SNAPSHOTS=IMMUTABLE TWO_NODE_REUSE=PASS REPLAY_AFTER_DELETE=PASS MISSING_SCENE=NO_CHARGE MEDIA_HASH=PASS UI_CREATE_UPLOAD_STATES_DRAG_LOCK_COPY_DELETE_UNDO_REDO=PASS HANDLE_AND_MENTION=PASS MIXED_HISTORY=ATOMIC WORKFLOW_FROZEN_AFTER_EDIT_DELETE=PASS SIMULATED_CREATES=5 PAID_CALLS=0 PAGE_ERRORS=0");
  } catch (error) {
    if (container) {
      const logs = spawnSync("docker", ["logs", container], { encoding: "utf8", windowsHide: true });
      await writeFile(path.join(out, "postgres-failure.log"), logs.stdout + logs.stderr);
    }
    throw error;
  } finally {
    if (fixture) await fixture.stop(); if (listening) await new Promise<void>(resolve => router.close(() => resolve())); if (pool) await pool.end();
    if (container) { assert.equal(docker(["inspect", "--format", '{{index .Config.Labels "naumi.task"}}', container]), owner); docker(["rm", "--force", container]); }
    await unlink(envFile).catch(() => undefined);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
