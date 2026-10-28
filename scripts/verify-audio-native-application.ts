import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import {withAudioSource,audioInputIdentity} from "../src/lib/audio/project";
import { createVideoFixture, CAP_RICH } from "./video-fusion/harness";
import {verifyAudioMatrix} from "./verify-audio-native-matrix";
import {verifyAudioInteractions} from "./verify-audio-native-interactions";
import { prepareVideoAssets } from "./video-fusion/assets.mjs";

/** Real local app/DB/task/worker/media/billing. Suppliers are isolated fixtures, not paid providers. */
async function main() {
  const out = path.resolve(process.argv[2] || "output/audio-native-application");
  await mkdir(out, { recursive: true });
  const owner = "canvas-audio-native-20261028", name = "audio-native-app-" + randomUUID();
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

    if(process.argv.includes('--matrix-only')){const matrix=await verifyAudioMatrix(h,out);await writeFile(path.join(out,'result.json'),JSON.stringify({matrixOnly:true,matrix},null,2));console.log('AUDIO_MATRIX=PASS NONZERO_FROZEN=3 CANCEL_FAILURE_REFUND=PASS UNKNOWN_ACK_RESTART=ONE_JOB CONCURRENT_CAS=ONE_WINNER MIXED_HISTORY=ATOMIC FOREIGN_TENANT_MEDIA=DENIED TOTAL_CHARGED=17 PAID_CALLS=0');return;}
    if(process.argv.includes('--ui-only')){
      const id='vnode-audio-ui-anchor-'+randomUUID(),made=await h.request<any>('a','POST','/api/canvas/video-nodes',{id,projectKey:`tree:${id}`,expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-a',providerId:'managed-video',mode:'reference',prompt:'',durationSeconds:4,resolution:'720p',aspectRatio:'16:9',generateAudio:false},inputs:[]});assert.equal(made.status,201,JSON.stringify(made.body));
      const interactions=await verifyAudioInteractions(h,out,id);await writeFile(path.join(out,'result.json'),JSON.stringify({uiOnly:true,interactions},null,2));console.log('AUDIO_NATIVE_CANVAS=PASS UI_IMPORT_EDIT_RENDER_ADOPT=PASS GRAPH_HISTORY=PASS HANDLE_MENTION_VIDEO=PASS WORKFLOW_FROZEN=PASS SIMULATED_CREATES=3 PAID_CALLS=0');return;
    }
    const id='audio-'+randomUUID(),projectKey=`tree:${id}`,audio=withAudioSource(h.refs.audio.id),create={id,projectKey,audio,expectedRevision:0,operationId:randomUUID()};
    console.log('AUDIO_PHASE=SAVE_AND_AUTH');
    const before=await h.creditState('a'),created=await h.request<any>('a','POST','/api/canvas/audio-nodes',create);
    assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.node.revision,1);
    assert.equal((await h.request<any>('a','POST','/api/canvas/audio-nodes',create)).body.node.revision,1);
    assert.equal((await h.request('b','GET',`/api/canvas/audio-nodes/${id}`)).status,404);
    const foreign=await h.request('b','POST','/api/canvas/audio-nodes',{...create,id:'audio-'+randomUUID(),projectKey:undefined,operationId:randomUUID()});assert.equal(foreign.status,404,JSON.stringify(foreign.body));
    assert.deepEqual(await h.creditState('a'),before);
    const edited={...audio,edit:{start:.5,end:2.5,gain:.5,fadeIn:.25,fadeOut:.5}},saved=await h.request<any>('a','PATCH',`/api/canvas/audio-nodes/${id}`,{expectedRevision:1,operationId:randomUUID(),audio:edited});assert.equal(saved.status,200,JSON.stringify(saved.body));
    const bad=await h.request<any>('a','PATCH',`/api/canvas/audio-nodes/${id}`,{expectedRevision:2,operationId:randomUUID(),audio:{...edited,edit:{...edited.edit,end:999}}});assert.equal(bad.status,422,JSON.stringify(bad.body));assert.deepEqual(await h.creditState('a'),before);
    console.log('AUDIO_PHASE=REAL_MEDIA_JOB');
    const renderIntent={expectedRevision:2,operationId:randomUUID()},rendered=await h.request<any>('a','POST',`/api/canvas/audio-nodes/${id}/render`,renderIntent);assert.equal(rendered.status,200,JSON.stringify(rendered.body));
    const replay=await h.request<any>('a','POST',`/api/canvas/audio-nodes/${id}/render`,renderIntent);assert.equal(replay.status,200,JSON.stringify(replay.body));assert.equal(replay.body.job.id,rendered.body.job.id);
    let job:any;
    for(const deadline=Date.now()+180000;Date.now()<deadline;){const response=await h.request<any>('a','GET',`/api/video/media-jobs/${rendered.body.job.id}`);assert.equal(response.status,200,JSON.stringify(response.body));job=response.body.job;if(job.status==='completed')break;assert.ok(!['failed','cancelled'].includes(job.status),JSON.stringify(job));await new Promise(resolve=>setTimeout(resolve,250));}
    assert.equal(job.status,'completed');const output=job.outputs.find((value:any)=>value.mimeType.startsWith('audio/'));assert.ok(output);assert.ok(Math.abs(output.probe.durationSeconds-2)<.002);assert.equal(output.probe.videoCodec,null);
    const download=await h.request<ArrayBuffer>('a','GET',output.url);assert.equal(download.status,200);assert.equal(createHash('sha256').update(Buffer.from(download.body)).digest('hex'),output.sha256);assert.equal((await h.request('b','GET',output.url)).status,404);await writeFile(path.join(out,'actual-edited.wav'),Buffer.from(download.body));
    const audioAfter=await h.creditState('a');assert.equal(Number(audioAfter.credits_used)-Number(before.credits_used),job.cost);
    const current=(await h.request<any>('a','GET',`/api/canvas/audio-nodes/${id}`)).body.node;
    const adopted={...current.audio,adopted:{artworkId:output.artworkId,sourceArtworkId:h.refs.audio.id,edit:edited.edit,jobId:job.id},render:null};
    const adopt=await h.request<any>('a','PATCH',`/api/canvas/audio-nodes/${id}`,{expectedRevision:current.revision,operationId:randomUUID(),audio:adopted});assert.equal(adopt.status,200,JSON.stringify(adopt.body));
    const forged=await h.request<any>('a','PATCH',`/api/canvas/audio-nodes/${id}`,{expectedRevision:adopt.body.node.revision,operationId:randomUUID(),audio:{...adopted,adopted:{...adopted.adopted,edit:{...edited.edit,gain:1}}}});assert.equal(forged.status,409,JSON.stringify(forged.body));
    assert.equal((await h.request<any>('a','POST',`/api/canvas/audio-nodes/${id}/render`,renderIntent)).body.job.id,job.id);
    console.log('AUDIO_PHASE=MIXED_COPY_HISTORY');
    const copied=await h.request<any>('a','POST','/api/canvas/nodes/copy',{operationId:randomUUID(),ids:[h.refs.audio.id,output.artworkId,id]});assert.equal(copied.status,200,JSON.stringify(copied.body));
    const map=copied.body.idMap,copy=copied.body.audioNodes[0];assert.equal(copy.audio.sourceArtworkId,map[h.refs.audio.id]);assert.equal(copy.audio.adopted.artworkId,map[output.artworkId]);assert.equal(copy.audio.render,null);
    const deletion=await h.request<any>('a','POST','/api/canvas/nodes/delete',{artworkIds:[map[h.refs.audio.id],map[output.artworkId]],audioIds:[copy.id],operationId:randomUUID()});assert.equal(deletion.status,200,JSON.stringify(deletion.body));
    const restored=await h.request<any>('a','POST','/api/canvas/history',{operationId:randomUUID(),operations:[{type:'audio-visibility',id:copy.id,visible:true},{type:'visibility',id:map[h.refs.audio.id],visible:true},{type:'visibility',id:map[output.artworkId],visible:true}]});assert.equal(restored.status,200,JSON.stringify(restored.body));
    assert.equal((await h.request('a','GET',`/api/canvas/audio-nodes/${copy.id}`)).status,200);
    console.log('AUDIO_PHASE=VIDEO_ACCEPTANCE');
    const baseConfig = { modelId: "video-a", providerId: "managed-video", mode: "reference", prompt: "保持 {{ref 1}}，人物 {{ref 2}}，对比 {{ref 3}}，另看 图片1", durationSeconds: 4, resolution: "720p", aspectRatio: "16:9", generateAudio: false, providerOptions: { seed: 0 } };

    const config={...baseConfig,prompt:'配音 {{ref 1}}，画面 {{ref 2}}'},inputs=[{id:'audio-source',nodeId:audioInputIdentity(id),kind:'audio',role:'source_audio',value:'/media/FORGED.wav'},{id:'image-source',nodeId:h.refs.image.id,kind:'image',role:'reference',value:h.refs.image.url}];
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

    const videoId='vnode-audio-'+randomUUID();await videoNode(videoId);const first=await generate(videoId),frozen=await h.taskPersistence('a',first.task.id);
    assert.equal(frozen.parameters.request.references.find((ref:any)=>ref.kind==='audio').artworkId,output.artworkId);
    assert.ok(!JSON.stringify(frozen).includes('FORGED.wav'));
    const frozenText=JSON.stringify(frozen);
    console.log('AUDIO_PHASE=REPLAY_AFTER_DELETE');
    const deleted=await h.request<any>('a','POST','/api/canvas/nodes/delete',{artworkIds:[h.refs.audio.id],audioIds:[id],operationId:randomUUID()});assert.equal(deleted.status,200,JSON.stringify(deleted.body));
    const afterDelete=await h.creditState('a');
    const acceptedReplay=await h.request<any>('a','POST',`/api/canvas/audio-nodes/${id}/render`,renderIntent);assert.equal(acceptedReplay.status,200,JSON.stringify(acceptedReplay.body));assert.equal(acceptedReplay.body.job.id,job.id);
    const replayVideo=await h.request<any>('a','POST',`/api/canvas/video-nodes/${videoId}/generate`,first.request);assert.equal(replayVideo.body.taskId,first.task.id);assert.deepEqual(await h.creditState('a'),afterDelete);assert.equal(JSON.stringify(await h.taskPersistence('a',first.task.id)),frozenText);
    const summary={realAppDbMediaWorker:true,realFfmpegJob:true,adoptedRecipeVerified:true,originalAndDraftSeparate:true,crossAccount404:true,sourceDeletedAcceptedReplay:true,videoSnapshotImmutable:true,mixedCopyRestore:true,mediaCost:job.cost,simulatedSupplierCreates:1,paidCalls:0,job,taskId:first.task.id};
    await writeFile(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log('AUDIO_APPLICATION_CORE=PASS REAL_APP_DB_MEDIA_WORKER=PASS REAL_FFMPEG=PASS RECIPE=TRUSTED PRIVATE_MEDIA_SHA=PASS CROSS_ACCOUNT=404 MIXED_COPY_HISTORY=PASS VIDEO_FROZEN=PASS ACCEPTED_REPLAY_AFTER_DELETE=PASS SIMULATED_CREATES=1 PAID_CALLS=0');
  } finally {
    if (fixture) await fixture.stop(); if (listening) await new Promise<void>(resolve => router.close(() => resolve())); if (pool) await pool.end();
    if (container) { assert.equal(docker(["inspect", "--format", '{{index .Config.Labels "naumi.task"}}', container]), owner); docker(["rm", "--force", container]); }
    await unlink(envFile).catch(() => undefined);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
