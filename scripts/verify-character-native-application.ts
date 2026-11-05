import assert from "node:assert/strict";
import {connectNativeParentDatabase} from "./video-fusion/native-parent-database";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { newCharacterProject, characterInputIdentity } from "../src/lib/character/project";
import { createVideoFixture, CAP_RICH } from "./video-fusion/harness";
import { verifyCharacterInteractions } from "./verify-character-native-interactions";
import { prepareVideoAssets } from "./video-fusion/assets.mjs";

/** Real local app/DB/task/worker/media/billing. Suppliers are isolated fixtures, not paid providers. */
async function main() {
  const out = path.resolve(process.argv[2] || process.env.CHARACTER_APP_EVIDENCE || "output/character-native-application");
  await mkdir(out, { recursive: true });
  const owner = "canvas-character-native-20261027", name = "character-native-app-" + randomUUID();
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
    const parentDatabase=await connectNativeParentDatabase();
    let databaseUrl:string;
    if(parentDatabase){pool=parentDatabase.pool;databaseUrl=parentDatabase.url;}else{
    container = docker(["run", "--detach", "--rm", "--name", name, "--label", `naumi.task=${owner}`, "--memory", "768m", "--cpus", "2", "--tmpfs", "/var/lib/postgresql/data", "--publish", "127.0.0.1::5432", "--env-file", envFile, "postgres:16-alpine"]);
    let ready = false;
    for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", database], { windowsHide: true, stdio: "ignore" }).status === 0) { ready = true; break; } await new Promise(resolve => setTimeout(resolve, 200)); }
    assert.ok(ready);
    const port = Number(docker(["port", container, "5432/tcp"]).split(":").at(-1));
    databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
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
    }
    await new Promise<void>(resolve => router.listen(0, "127.0.0.1", resolve)); listening = true;
    process.env.NAUMI_VERIFY_ISOLATED_DB = "1"; process.env.VIDEO_FIXTURE_DATABASE_URL = databaseUrl;
    process.env.VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL = `http://127.0.0.1:${(router.address() as { port: number }).port}`;
    process.env.VIDEO_FIXTURE_ROUTER_TOKEN = randomBytes(32).toString("hex"); process.env.VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET = randomBytes(32).toString("hex");
    const assetsRoot = path.join(out, "assets"); await prepareVideoAssets(assetsRoot, [4]);
    const h = fixture = await createVideoFixture({ startWorker: false, databaseUrl, assetsRoot, videoDefinition: { ...CAP_RICH, providerOptions: { seed: { type: "integer", minimum: 0, maximum: 9999 } } } });
    const id = "character-" + randomUUID(), projectKey = `tree:${id}`, character = newCharacterProject("林舟");
    character.description = "短发，左眉有疤"; character.appearances[0].referenceArtworkIds = [h.refs.image.id];
    character.appearances.push({ id: "coat", name: "外套", description: "深蓝外套", referenceArtworkIds: [h.refs.lastImage.id] });
    const create = { id, projectKey, character, expectedRevision: 0, operationId: randomUUID() };
    const freeBefore = await h.creditState("a");
    const created = await h.request<any>("a", "POST", "/api/canvas/character-nodes", create);
    assert.equal(created.status, 201, JSON.stringify(created.body)); assert.equal(created.body.node.revision, 1);
    assert.equal((await h.request<any>("a", "POST", "/api/canvas/character-nodes", create)).body.node.revision, 1);
    assert.equal((await h.request("b", "GET", `/api/canvas/character-nodes/${id}`)).status, 404);
    const foreign = await h.request("b", "POST", "/api/canvas/character-nodes", { ...create, id: "character-" + randomUUID(), projectKey: undefined, operationId: randomUUID() }); assert.equal(foreign.status, 404);
    const concurrent = await Promise.all([0, 10].map(x => h.request<any>("a", "PATCH", `/api/canvas/character-nodes/${id}`, { expectedRevision: 1, operationId: randomUUID(), x })));
    assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
    const saved = (await h.request<any>("a", "GET", `/api/canvas/character-nodes/${id}`)).body.node;
    assert.equal(saved.revision, 2);
    const invalid = await h.request("a", "PATCH", `/api/canvas/character-nodes/${id}`, { expectedRevision: 2, operationId: randomUUID(), character: { ...character, appearances: [{ ...character.appearances[0], referenceArtworkIds: [h.refs.video.id] }] } }); assert.equal(invalid.status, 404);
    assert.deepEqual(await h.creditState("a"), freeBefore);

    const input = { id: "role-identity", nodeId: characterInputIdentity(id, "base"), kind: "text", role: "context", value: "FORGED_CLIENT_DESCRIPTION" };
    const inputs = [input, { id: "comparison", nodeId: h.refs.lastImage.id, kind: "image", role: "reference", value: h.refs.lastImage.url }];
    const config = { modelId: "video-a", providerId: "managed-video", mode: "reference", prompt: "保持 {{ref 1}}，对比 {{ref 2}}，另看 图片1", durationSeconds: 4, resolution: "720p", aspectRatio: "16:9", generateAudio: false, providerOptions: { seed: 0 } };
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
    assert.ok(request.prompt.includes("短发，左眉有疤")); assert.ok(!request.prompt.includes("FORGED_CLIENT_DESCRIPTION"));
    assert.ok(request.prompt.includes("对比 图片2，另看 图片2")); assert.ok(request.prompt.includes("角色参考：图片1"));
    assert.equal(request.orderedInputs[0].nodeId, `inline:character:${id}#base@2`);
    assert.deepEqual(frozen.video_references.map((ref: any) => ref.artworkId), [h.refs.image.id, h.refs.lastImage.id]);
    const firstRequest = JSON.stringify(request);
    const changed = structuredClone(character); changed.description = "短发，左眉有疤，蓝色围巾"; changed.appearances[0].referenceArtworkIds = [h.refs.lastImage.id];
    const edited = await h.request<any>("a", "PATCH", `/api/canvas/character-nodes/${id}`, { expectedRevision: 2, operationId: randomUUID(), character: changed }); assert.equal(edited.status, 200, JSON.stringify(edited.body)); assert.equal(edited.body.node.revision, 3);
    const secondId = "vnode-role-next-" + randomUUID(); await videoNode(secondId);
    const second = await generate(secondId), next = await h.taskPersistence("a", second.task.id);
    assert.ok(next.parameters.request.prompt.includes("蓝色围巾")); assert.equal(next.parameters.request.orderedInputs[0].nodeId, `inline:character:${id}#base@3`);
    assert.equal(next.video_references[0].artworkId, h.refs.lastImage.id);
    assert.equal(JSON.stringify((await h.taskPersistence("a", first.task.id)).parameters.request), firstRequest);
    const asset = first.task.resultAssets.find((item: any) => item.kind === "video"); assert.ok(asset);
    const bytes = await h.request<ArrayBuffer>("a", "GET", asset.url); assert.equal(bytes.status, 200); assert.equal(createHash("sha256").update(Buffer.from(bytes.body)).digest("hex"), asset.sha256);
    assert.equal((await h.request("b", "GET", asset.url)).status, 404);
    const removed = await h.request("a", "PATCH", `/api/canvas/character-nodes/${id}`, { expectedRevision: 3, operationId: randomUUID(), deleted: true }); assert.equal(removed.status, 200);
    assert.equal((await h.request("a", "GET", `/api/canvas/character-nodes/${id}`)).status, 404);
    assert.equal((await h.request<any>("a", "POST", `/api/canvas/video-nodes/${firstId}/generate`, first.request)).body.taskId, first.task.id);
    const credits = await h.creditState("a"), current = (await h.request<any>("a", "GET", `/api/canvas/video-nodes/${secondId}`)).body.node;
    const missing = await h.request("a", "POST", `/api/canvas/video-nodes/${secondId}/generate`, { expectedRevision: current.revision, idempotencyKey: randomUUID() }); assert.equal(missing.status, 404, JSON.stringify(missing.body)); assert.deepEqual(await h.creditState("a"), credits);
    const imageRemoved = await h.request("a", "POST", "/api/canvas/nodes/delete", { artworkIds: [h.refs.image.id], operationId: randomUUID() });
    assert.equal(imageRemoved.status, 200, JSON.stringify(imageRemoved.body));
    const replayAfterRemoval = await h.request<any>("a", "POST", "/api/canvas/character-nodes", create); assert.equal(replayAfterRemoval.status, 201, JSON.stringify(replayAfterRemoval.body)); assert.equal(replayAfterRemoval.body.node.revision, 1);
    assert.equal((await h.request("a", "GET", `/api/canvas/character-nodes/${id}`)).status, 404);
    assert.equal(h.supplierCalls().filter(call => call.phase === "create").length, 2);
    const interactions = await verifyCharacterInteractions(h, out, secondId);
    assert.equal(h.supplierCalls().filter(call => call.phase === "create").length, 5);
    await writeFile(path.join(out, "result.json"), JSON.stringify({ realApp: true, realPostgres: true, realWorkerStorageBilling: true, characterRevisionOneWinner: true, crossAccount404: true, forgedClientDefinitionIgnored: true, expandedReferenceOrderStable: true, roleAndAppearanceIdentityFrozen: true, laterEditLeavesOldTaskUnchanged: true, twoNodesReuseSameRole: true, savedReplayAfterDependencyDeletion: true, acceptedTaskReplayAfterRoleDeletion: true, missingRoleNoCharge: true, privateOutputHash: true, simulatedSupplierCreates: 5, paidCalls: 0, uiTested: true, menuEnabled: true, interactions, taskIds: [first.task.id, second.task.id] }, null, 2));
    console.log("CHARACTER_APPLICATION=PASS REAL_APP_DB_WORKER_STORAGE_BILLING=PASS REVISION=ONE_WINNER CROSS_ACCOUNT=404 SERVER_ROLE=TRUSTED EXPANDED_ORDER=STABLE SNAPSHOTS=IMMUTABLE TWO_NODE_REUSE=PASS REPLAY_AFTER_DELETE=PASS MISSING_ROLE=NO_CHARGE MEDIA_HASH=PASS UI_CREATE_UPLOAD_LOOKS_DRAG_LOCK_COPY_DELETE_UNDO_REDO=PASS HANDLE_AND_MENTION=PASS MIXED_HISTORY=ATOMIC WORKFLOW_FROZEN_AFTER_EDIT_DELETE=PASS SIMULATED_CREATES=5 PAID_CALLS=0 PAGE_ERRORS=0");
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
    await writeFile(path.join(out,"CLEANUP.json"),JSON.stringify({status:"PASS",fixtureStopped:true,routerClosed:true,poolClosed:true,ownContainerRemoved:container,environmentFileRemoved:true}));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
