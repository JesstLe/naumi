import assert from "node:assert/strict";
import {randomBytes, randomUUID, createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createServer} from "node:http";
import {mkdir, writeFile, unlink} from "node:fs/promises";
import path from "node:path";
import {Pool} from "pg";
import {createVideoFixture, CAP_RICH} from "./video-fusion/harness";
import {prepareVideoAssets} from "./video-fusion/assets.mjs";

/** Real Next/API/transactions/worker/storage/billing; disposable PostgreSQL and simulated upstreams only. */
async function main() {
  const out=path.resolve(process.argv[2]||"output/video-native-application");await mkdir(out,{recursive:true});
  const owner="canvas-video-native-20261027", name="video-native-app-"+randomUUID(), password=randomBytes(24).toString("hex"), database="naumi_video_fixture_native_"+randomBytes(6).toString("hex");
  const envFile=path.join(out,name+".env");await writeFile(envFile,`POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`,{mode:0o600});
  function docker(args:string[]){const r=spawnSync("docker",args,{encoding:"utf8",windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
  let container="", pool:Pool|undefined, fixture:Awaited<ReturnType<typeof createVideoFixture>>|undefined, listening=false;
  let digest="";const publications=new Map<string,unknown>();
  const router=createServer(async(req,res)=>{try{
    const parts:Buffer[]=[];for await(const part of req)parts.push(part);const body=parts.length?JSON.parse(Buffer.concat(parts).toString()):{};
    const send=(status:number,value:unknown)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(value));};
    if(req.url==="/internal/config/state")return send(200,{digest});
    if(req.url==="/internal/config/prepare")return send(200,{digest:body.digest,phase:"prepared"});
    if(req.url==="/internal/config/activate"){if(body.expectedDigest!==digest)return send(409,{});digest=body.digest;const p={id:body.id,digest,phase:"applied"};publications.set(body.id,p);return send(200,p);}
    if(req.url?.startsWith("/internal/config/publications/")){const p=publications.get(req.url.split("/").at(-1)!);return send(p?200:404,p||{});}
    send(404,{});
  }catch{res.writeHead(500);res.end();}});
  try {
    container=docker(["run","--detach","--rm","--name",name,"--label",`naumi.task=${owner}`,"--memory","768m","--cpus","2","--tmpfs","/var/lib/postgresql/data","--publish","127.0.0.1::5432","--env-file",envFile,"postgres:16-alpine"]);
    let ready=false;for(let i=0;i<60;i++){if(spawnSync("docker",["exec",container,"pg_isready","-U","postgres","-d",database],{windowsHide:true,stdio:"ignore"}).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
    const port=Number(docker(["port",container,"5432/tcp"]).split(":").at(-1));
    const databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;pool=new Pool({connectionString:databaseUrl,max:2});
    await pool.query("CREATE TABLE public.naumi_video_fixture_guard(owner text NOT NULL)");await pool.query("INSERT INTO public.naumi_video_fixture_guard VALUES($1)",["canvas-video-fusion-20261013"]);
    await new Promise<void>(r=>router.listen(0,"127.0.0.1",r));listening=true;
    const address=router.address() as {port:number};
    process.env.NAUMI_VERIFY_ISOLATED_DB="1";process.env.VIDEO_FIXTURE_DATABASE_URL=databaseUrl;
    process.env.VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL=`http://127.0.0.1:${address.port}`;process.env.VIDEO_FIXTURE_ROUTER_TOKEN=randomBytes(32).toString("hex");process.env.VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET=randomBytes(32).toString("hex");
    const assetsRoot=path.join(out,"assets");await prepareVideoAssets(assetsRoot,[4]);
    const h=fixture=await createVideoFixture({startWorker:false,databaseUrl,assetsRoot,videoDefinition:{...CAP_RICH,providerOptions:{seed:{type:"integer",minimum:0,maximum:9999}}}});
    const id="native-"+randomUUID(), key=`tree:${id}`;
    const inputs=[h.refs.image,h.refs.lastImage].map((ref,index)=>({id:`input-${index}`,nodeId:ref.id,kind:"image",role:"reference",value:ref.url}));
    const config={modelId:"video-a",providerId:"managed-video",mode:"reference",prompt:"固定 {{ref 1}}，对比 图片2",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",generateAudio:false,providerOptions:{seed:0}};
    const created=await h.request<any>("a","POST","/api/canvas/video-nodes",{id,projectKey:key,expectedRevision:0,operationId:randomUUID(),title:"原生视频",config,inputs});assert.equal(created.status,201,JSON.stringify(created.body));
    const edit={expectedRevision:1,operationId:randomUUID(),inputs:[...inputs].reverse()};
    const moved=await h.request<any>("a","PATCH",`/api/canvas/video-nodes/${id}`,edit);assert.equal(moved.status,200,JSON.stringify(moved.body));
    assert.equal(moved.body.node.config.prompt,"固定 {{ref 2}}，对比 图片1");
    assert.equal((await h.request<any>("a","PATCH",`/api/canvas/video-nodes/${id}`,edit)).body.node.revision,2);
    assert.equal((await h.request("b","GET",`/api/canvas/video-nodes/${id}`)).status,404);
    const before=await h.creditState("a");
    const removed=await h.request<any>("a","PATCH",`/api/canvas/video-nodes/${id}`,{expectedRevision:2,operationId:randomUUID(),inputs:[inputs[1]]});assert.equal(removed.status,200);assert.ok(removed.body.node.config.prompt.includes("{{ref 0}}"));
    const blocked=await h.request("a","POST",`/api/canvas/video-nodes/${id}/generate`,{expectedRevision:3,idempotencyKey:randomUUID()});assert.equal(blocked.status,422,JSON.stringify(blocked.body));assert.deepEqual(await h.creditState("a"),before);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
    const repaired=await h.request<any>("a","PATCH",`/api/canvas/video-nodes/${id}`,{expectedRevision:3,operationId:randomUUID(),inputs:[...inputs].reverse(),config:{...config,prompt:"固定 {{ref 2}}，对比 图片1"}});assert.equal(repaired.status,200);
    const copied=await h.request<any>("a","POST","/api/canvas/video-nodes/copy",{ids:[id],projectKey:key,operationId:randomUUID()});assert.equal(copied.status,200);assert.equal(copied.body.nodes[0].config.prompt,repaired.body.node.config.prompt);assert.equal(copied.body.nodes[0].lastTaskId,null);
    async function generate(nodeId:string,revision:number){
      const input={expectedRevision:revision,idempotencyKey:randomUUID()};
      const sent=await h.request<any>("a","POST",`/api/canvas/video-nodes/${nodeId}/generate`,input);assert.equal(sent.status,202,JSON.stringify(sent.body));
      const repeated=await h.request<any>("a","POST",`/api/canvas/video-nodes/${nodeId}/generate`,input);assert.equal(repeated.body.taskId,sent.body.taskId);
      const deadline=Date.now()+180000;let task:any;
      while(Date.now()<deadline){await h.forceVideoPollDue(sent.body.taskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks?id=${sent.body.taskId}`)).body.task;if(task.status==="completed")break;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status),JSON.stringify(task));await new Promise(r=>setTimeout(r,300));}
      assert.equal(task.status,"completed");return task;
    }
    const task=await generate(id,4), frozen=await h.taskPersistence("a",task.id);assert.equal(frozen.parameters.request.prompt,"固定 图片2，对比 图片1");
    assert.deepEqual(frozen.video_references.map((ref:any)=>ref.artworkId),[h.refs.lastImage.id,h.refs.image.id]);
    const asset=task.resultAssets.find((asset:any)=>asset.kind==="video");assert.ok(asset?.artworkId);
    const bytes=await h.request<ArrayBuffer>("a","GET",asset.url);assert.equal(bytes.status,200);assert.equal(createHash("sha256").update(Buffer.from(bytes.body)).digest("hex"),asset.sha256);
    assert.equal((await h.request("b","GET",asset.url)).status,404);
    const node=(await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}`)).body.node;assert.equal(node.lastTaskId,task.id);assert.ok(node.lastResultId);
    const reused="native-reuse-"+randomUUID();const again=await h.request<any>("a","POST","/api/canvas/video-nodes",{id:reused,projectKey:key,expectedRevision:0,operationId:randomUUID(),config:{...config,prompt:"延续 {{ref 1}}"},inputs:[{id:"reuse-output",nodeId:asset.artworkId,kind:"video",role:"source_video",value:asset.url}]});assert.equal(again.status,201);
    const next=await generate(reused,1), nextFrozen=await h.taskPersistence("a",next.id);assert.equal(nextFrozen.video_references[0].artworkId,asset.artworkId);
    assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,2);
    const settled=await h.creditState("a");await h.tick();assert.deepEqual(await h.creditState("a"),settled);
    await writeFile(path.join(out,"result.json"),JSON.stringify({realApp:true,realPostgres:true,realWorker:true,realStorage:true,realBilling:true,referenceIdentityStable:true,removedBlocksWithoutCharge:true,copy:true,replayIdempotent:true,ownedMediaHashes:true,resultBackToNode:true,resultReusedInSecondGeneration:true,simulatedSupplierCreates:2,paidCalls:0,taskIds:[task.id,next.id]},null,2));
    console.log("VIDEO_NATIVE_APPLICATION=PASS REAL_APP_DB_WORKER_STORAGE_BILLING=PASS REORDER=STABLE DELETE=NO_CHARGE COPY=PASS REPLAY=IDEMPOTENT RESULT=NODE_REUSED MEDIA_HASH=PASS CROSS_ACCOUNT=404 SIMULATED_CREATES=2 PAID_CALLS=0");
  }finally{
    if(fixture)await fixture.stop();if(listening)await new Promise<void>(r=>router.close(()=>r()));if(pool)await pool.end();
    if(container){assert.equal(docker(["inspect","--format",'{{index .Config.Labels "naumi.task"}}',container]),owner);docker(["rm","--force",container]);}
    await unlink(envFile);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
