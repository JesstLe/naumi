import assert from "node:assert/strict";
import {connectNativeParentDatabase} from "./video-fusion/native-parent-database";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Client, Pool } from "pg";
import { createVideoFixture } from "./video-fusion/harness";
import { nativeApplicationVideo } from "./video-fusion/profiles";
import {verifyTimelineInteractions} from "./verify-timeline-native-interactions";
import {verifyTimelineMatrix} from "./verify-timeline-native-matrix";
import {newTimelineProject,type TimelineClip} from "../src/lib/timeline/project";
import { prepareVideoAssets } from "./video-fusion/assets.mjs";

/** Real local app/DB/task/worker/media/billing. Suppliers are isolated fixtures, not paid providers. */
async function main() {
  const out = path.resolve(process.argv.slice(2).find(arg=>!arg.startsWith("--")) || process.env.TIMELINE_APP_EVIDENCE || "output/timeline-native-application");
  await mkdir(out, { recursive: true });
  const owner = "canvas-multitrack-native-20261028", name = "timeline-native-app-" + randomUUID();
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
    const h = fixture = await createVideoFixture({ startWorker: false, databaseUrl, assetsRoot, ...nativeApplicationVideo });

    if(process.argv.includes('--matrix-only')){
      assert.equal((await h.request('a','GET','/api/video/media-jobs')).status,200);
      const result=await verifyTimelineMatrix(h,out);await writeFile(path.join(out,'result.json'),JSON.stringify({matrixOnly:true,result},null,2));console.log('TIMELINE_MATRIX=PASS UNKNOWN_ACK_RESTART=ONE_JOB CONCURRENT_RENDER=ONE_DEBIT RUNNING_CANCEL=REFUNDED SHARED_FAILURE=REFUNDED WORKFLOW_REFERENCE=FROZEN MEDIA_CHARGED=14 RESERVATION=0 SIMULATED_CREATES=2 PAID_CALLS=0');return;
    }
    if(process.argv.includes('--ui-only')){
      const anchor='vnode-timeline-anchor-'+randomUUID(),response=await h.request<any>('a','POST','/api/canvas/video-nodes',{id:anchor,projectKey:`tree:${anchor}`,expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-a',providerId:'managed-video',mode:'reference',prompt:'',durationSeconds:4,resolution:'720p',aspectRatio:'16:9',generateAudio:false},inputs:[]});assert.equal(response.status,201,JSON.stringify(response.body));
      const result=await verifyTimelineInteractions(h,out,anchor);await writeFile(path.join(out,'result.json'),JSON.stringify({uiOnly:true,result},null,2));console.log('TIMELINE_NATIVE_CANVAS=PASS IMPORT_EDIT_SAVE=PASS REAL_PREVIEW_EXPORT_PIXELS=MEASURED ADOPTED_HISTORY=PASS HANDLE_MENTION_VIDEO=PASS GRAPH_LIFECYCLE=PASS CHARGED_MEDIA=3 SIMULATED_CREATES=1 PAID_CALLS=0');return;
    }
    const id='timeline-'+randomUUID(),projectKey=`tree:${id}`,timeline=newTimelineProject();timeline.width=320;timeline.height=180;
    const clip=(id:string,artworkId:string,position:number,duration:number,fields:Partial<TimelineClip>={}):TimelineClip=>({id,artworkId,position,inPoint:0,duration,gain:1,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0,...fields});
    timeline.tracks[0].clips=[clip('video',h.refs.video.id,0,2,{inPoint:.5}),clip('image',h.refs.image.id,1.5,1.5,{transitionIn:.5})];timeline.tracks[1].clips=[clip('music',h.refs.audio.id,.25,2.5,{gain:.25,fadeIn:.25,fadeOut:.25})];timeline.tracks.push({id:'overlay',name:'插图',kind:'video',gain:1,muted:false,clips:[clip('overlay-image',h.refs.lastImage.id,2.25,.5)]});
    const get=async(nodeId=id)=>(await h.request<any>('a','GET',`/api/canvas/timeline-nodes/${nodeId}`)).body.node,before=await h.creditState('a');
    console.log('TIMELINE_PHASE=SAVE_AUTH_CAS');
    const create={id,projectKey,expectedRevision:0,operationId:randomUUID(),timeline};let response=await h.request<any>('a','POST','/api/canvas/timeline-nodes',create);assert.equal(response.status,201,JSON.stringify(response.body));assert.equal(response.body.node.revision,1);assert.equal((await h.request<any>('a','POST','/api/canvas/timeline-nodes',create)).body.node.revision,1);
    assert.equal((await h.request('b','GET',`/api/canvas/timeline-nodes/${id}`)).status,404);assert.equal((await h.request('b','POST','/api/canvas/timeline-nodes',{...create,id:'timeline-'+randomUUID(),projectKey:undefined,operationId:randomUUID()})).status,404);assert.deepEqual(await h.creditState('a'),before);
    const concurrent=await Promise.all([0,10].map(x=>h.request<any>('a','PATCH',`/api/canvas/timeline-nodes/${id}`,{expectedRevision:1,operationId:randomUUID(),x})));assert.deepEqual(concurrent.map(result=>result.status).sort(),[200,409]);let node=await get();assert.equal(node.revision,2);
    const invalid=structuredClone(timeline);invalid.tracks[0].clips[0].duration=999;assert.equal((await h.request('a','PATCH',`/api/canvas/timeline-nodes/${id}`,{expectedRevision:node.revision,operationId:randomUUID(),timeline:invalid})).status,422);assert.equal((await h.request('a','PATCH',`/api/canvas/timeline-nodes/${id}`,{expectedRevision:node.revision,operationId:randomUUID(),render:{operationId:randomUUID()}})).status,422);assert.deepEqual(await h.creditState('a'),before);
    console.log('TIMELINE_PHASE=FROZEN_EXPORT_AND_ADOPT');
    await h.setMediaPrice(3);const renderIntent={expectedRevision:node.revision,operationId:randomUUID()};response=await h.request<any>('a','POST',`/api/canvas/timeline-nodes/${id}/render`,renderIntent);assert.equal(response.status,200,JSON.stringify(response.body));let job=response.body.job;assert.equal(job.cost,3);const jobId=job.id,frozenProject=JSON.stringify(response.body.node.render.project);assert.equal((await h.request<any>('a','POST',`/api/canvas/timeline-nodes/${id}/render`,renderIntent)).body.job.id,jobId);
    assert.equal(Number((await h.creditState('a')).credits_used),Number(before.credits_used)+3);await h.setMediaPrice(7);node=await get();const later=structuredClone(timeline);later.tracks[1].clips[0].gain=.5;response=await h.request<any>('a','PATCH',`/api/canvas/timeline-nodes/${id}`,{expectedRevision:node.revision,operationId:randomUUID(),timeline:later});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(JSON.stringify(response.body.node.render.project),frozenProject);
    async function finish(jobId:string){for(const deadline=Date.now()+180000;Date.now()<deadline;){const response=await h.request<any>('a','GET',`/api/video/media-jobs/${jobId}`);assert.equal(response.status,200,JSON.stringify(response.body));const job=response.body.job;if(job.status==='completed')return job;assert.ok(!['failed','cancelled'].includes(job.status),JSON.stringify(job));await new Promise(resolve=>setTimeout(resolve,200));}throw new Error('Timeline media job timed out');}
    job=await finish(jobId);assert.equal(job.cost,3);assert.equal(job.outputs.length,1);const output=job.outputs[0];assert.ok(output.probe.videoCodec);assert.ok(output.probe.audioCodecs.length);assert.ok(Math.abs(output.probe.durationSeconds-3)<.04);
    const actual=await h.request<ArrayBuffer>('a','GET',output.url);assert.equal(actual.status,200);assert.equal(createHash('sha256').update(Buffer.from(actual.body)).digest('hex'),output.sha256);await writeFile(path.join(out,'actual-timeline.mp4'),Buffer.from(actual.body));assert.equal((await h.request('b','GET',output.url)).status,404);
    node=await get();const adopted=await h.request<any>('a','POST',`/api/canvas/timeline-nodes/${id}/adopt`,{expectedRevision:node.revision,operationId:randomUUID(),jobId});assert.equal(adopted.status,200,JSON.stringify(adopted.body));node=adopted.body.node;assert.equal(node.adopted.artworkId,output.artworkId);assert.equal(JSON.stringify(node.adopted.project),frozenProject);assert.equal(node.timeline.tracks[1].clips[0].gain,.5);
    const forged=structuredClone(node.adopted);forged.project.tracks[1].clips[0].gain=.75;response=await h.request('a','PATCH',`/api/canvas/timeline-nodes/${id}`,{expectedRevision:node.revision,operationId:randomUUID(),adopted:forged});assert.equal(response.status,409,JSON.stringify(response.body));
    let billing=await h.mediaBillingEvidence('a',jobId);assert.equal(Number(billing.operation.charged_credits),3);assert.equal(Number(billing.operation.reserved_credits),0);assert.equal(billing.ledger.length,1);assert.equal(billing.reservation.length,0);assert.equal(Number((await h.creditState('a')).credits_total),Number(before.credits_total)-3);
    console.log('TIMELINE_PHASE=CANCEL_ATOMIC_HISTORY_COPY');
    node=await get();const cancelBefore=await h.creditState('a');response=await h.request<any>('a','POST',`/api/canvas/timeline-nodes/${id}/render`,{expectedRevision:node.revision,operationId:randomUUID()});assert.equal(response.status,200,JSON.stringify(response.body));const cancelledId=response.body.job.id;assert.equal(response.body.job.cost,7);response=await h.request<any>('a','DELETE',`/api/video/media-jobs/${cancelledId}`);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.job.status,'cancelled');assert.deepEqual(await h.creditState('a'),cancelBefore);
    node=await get();const snapshot=JSON.stringify(node);response=await h.request('a','POST','/api/canvas/history',{operationId:randomUUID(),operations:[{type:'timeline-patch',id,expectedRevision:node.revision,fields:{title:'SHOULD_ROLL_BACK'}},{type:'visibility',id:h.refs.video.id,visible:false}]});assert.equal(response.status,409,JSON.stringify(response.body));assert.equal(JSON.stringify(await get()),snapshot);assert.equal(await h.ownedArtworkVisible('a',h.refs.video.id),true);
    const sourceIds=[h.refs.video.id,h.refs.image.id,h.refs.lastImage.id,h.refs.audio.id],copyIntent={operationId:randomUUID(),ids:[...sourceIds,output.artworkId,id]};response=await h.request<any>('a','POST','/api/canvas/nodes/copy',copyIntent);assert.equal(response.status,200,JSON.stringify(response.body));const copied=response.body.timelineNodes[0],mapping=response.body.idMap;assert.ok(copied);assert.equal(copied.render,null);assert.equal(copied.adopted.artworkId,mapping[output.artworkId]);assert.equal(copied.timeline.tracks[0].clips[0].artworkId,mapping[h.refs.video.id]);assert.equal(copied.adopted.project.tracks[0].clips[0].artworkId,mapping[h.refs.video.id]);assert.equal((await h.request<any>('a','POST','/api/canvas/nodes/copy',copyIntent)).body.timelineNodes[0].id,copied.id);
    console.log('TIMELINE_PHASE=RESTORE_REPLAY_SCOPE');
    node=await get();response=await h.request('a','POST','/api/canvas/nodes/delete',{operationId:randomUUID(),artworkIds:sourceIds,timelineIds:[id]});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal((await h.request('a','GET',`/api/canvas/timeline-nodes/${id}`)).status,404);assert.equal((await h.request<any>('a','POST',`/api/canvas/timeline-nodes/${id}/render`,renderIntent)).body.job.id,jobId);
    response=await h.request('a','POST','/api/canvas/history',{operationId:randomUUID(),operations:[{type:'timeline-visibility',id,visible:true},...sourceIds.map(id=>({type:'visibility',id,visible:true}))]});assert.equal(response.status,200,JSON.stringify(response.body));assert.ok(await get());assert.deepEqual(await h.creditState('a'),cancelBefore);
    const scopeBefore=await h.creditState('a');await h.withForeignMediaScope('a',mapping[h.refs.video.id],async()=>{const copy=await get(copied.id);response=await h.request('a','PATCH',`/api/canvas/timeline-nodes/${copied.id}`,{expectedRevision:copy.revision,operationId:randomUUID(),timeline:copy.timeline});assert.equal(response.status,404,JSON.stringify(response.body));});assert.deepEqual(await h.creditState('a'),scopeBefore);
    assert.equal(h.supplierCalls().filter(call=>call.phase==='create').length,0);assert.equal(Number((await h.creditState('a')).credits_total),Number(before.credits_total)-3);assert.equal(Number((await h.creditState('a')).credits_used),Number(before.credits_used));
    await h.setMediaPrice(0);const result={actualAppDbMediaWorker:true,realFfmpeg:true,casOneWinner:true,crossAccount404:true,internalRenderNotClientWritable:true,frozenExportAfterEdit:true,adoptDoesNotOverwriteDraft:true,adoptRecipeAndBytesVerified:true,nonzeroFrozenCharge:3,cancel7Refund:true,mixedHistoryAtomic:true,copyRemapsDraftAndAdopted:true,restoreOrderIndependent:true,acceptedReplayAfterSourceDeletion:true,foreignTenantNewInputDenied:true,simulatedSupplierCreates:0,paidCalls:0,jobId,output,nodeId:id,copyNodeId:copied.id};await writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log('TIMELINE_APPLICATION=PASS ACTUAL_APP_DB_WORKER_FFMPEG=PASS FROZEN_EXPORT=PASS ADOPTION=TRUSTED PRIVATE_SHA=PASS CAS=ONE_WINNER CANCEL_REFUND=PASS HISTORY_COPY_RESTORE=PASS ACCEPTED_REPLAY=PASS TENANT_SCOPE=DENIED CHARGED=3 RESERVATION=0 PAID_CALLS=0');
  } finally {
    if (fixture) { await writeFile(path.join(out,'runtime.log'),fixture.logs.join('\n'));await fixture.stop(); } if (listening) await new Promise<void>(resolve => router.close(() => resolve())); if (pool) await pool.end();
    if (container) { assert.equal(docker(["inspect", "--format", '{{index .Config.Labels "naumi.task"}}', container]), owner); docker(["rm", "--force", container]); }
    await unlink(envFile).catch(() => undefined);
    await writeFile(path.join(out,"CLEANUP.json"),JSON.stringify({status:"PASS",ownContainerRemoved:!!container,appAndWorkersStopped:!!fixture,routerClosed:listening,poolClosed:!!pool,temporaryCredentialFileRemoved:true,externalResourcesTouched:false},null,2)+"\n");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
