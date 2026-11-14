import assert from "node:assert/strict";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createServer} from "node:http";
import {mkdir,writeFile,unlink} from "node:fs/promises";
import path from "node:path";
import {Pool} from "pg";
import {createVideoFixture} from "./video-fusion/harness";
import {prepareVideoAssets} from "./video-fusion/assets.mjs";
import {MULTIMODAL_VIDEO_FAMILIES} from "../src/lib/model-config/video-family-multimodal";
import {resolveVideoCapability} from "../src/lib/video/contract";
import {reconcileVideoSettings} from "../src/lib/video/legacy-client-settings";
import type {VideoMode} from "../src/lib/video/capability-schema";

// Complete local application pipeline. Nothing contacts a production supplier.
async function main(){
 const out=path.resolve(process.argv[2]||"output/video-modes-application");await mkdir(out,{recursive:true});
 const owner="canvas-video-modes-20261102",name="video-modes-"+randomUUID(),password=randomBytes(24).toString("hex"),database="naumi_video_fixture_modes_"+randomBytes(6).toString("hex");
 const envFile=path.join(out,name+".env");await writeFile(envFile,`POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`,{mode:0o600});
 const docker=(args:string[])=>{const r=spawnSync("docker",args,{encoding:"utf8",windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim()};
 let container="",pool:Pool|undefined,fixture:Awaited<ReturnType<typeof createVideoFixture>>|undefined,listening=false,digest="";const publications=new Map<string,unknown>();
 const router=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};const send=(status:number,data:unknown)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(data))};
  if(req.url==="/internal/config/state")return send(200,{digest});if(req.url==="/internal/config/prepare")return send(200,{digest:body.digest,phase:"prepared"});
  if(req.url==="/internal/config/activate"){if(body.expectedDigest!==digest)return send(409,{});digest=body.digest;const p={id:body.id,digest,phase:"applied"};publications.set(body.id,p);return send(200,p)}
  if(req.url?.startsWith("/internal/config/publications/")){const p=publications.get(req.url.split("/").at(-1)!);return send(p?200:404,p||{})}send(404,{});
 }catch{res.writeHead(500);res.end()}});
 try{
  container=docker(["run","--detach","--rm","--name",name,"--label",`naumi.task=${owner}`,"--memory","768m","--cpus","2","--tmpfs","/var/lib/postgresql/data","--publish","127.0.0.1::5432","--env-file",envFile,"postgres:16-alpine"]);
  let ready=false;for(let i=0;i<60;i++){if(spawnSync("docker",["exec",container,"pg_isready","-U","postgres","-d",database],{windowsHide:true,stdio:"ignore"}).status===0){ready=true;break}await new Promise(r=>setTimeout(r,200))}assert.ok(ready);
  const port=Number(docker(["port",container,"5432/tcp"]).split(":").at(-1)),databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
  pool=new Pool({connectionString:databaseUrl,max:2});await pool.query("CREATE TABLE public.naumi_video_fixture_guard(owner text NOT NULL)");await pool.query("INSERT INTO public.naumi_video_fixture_guard VALUES($1)",["canvas-video-fusion-20261013"]);
  await new Promise<void>(r=>router.listen(0,"127.0.0.1",r));listening=true;
  Object.assign(process.env,{NAUMI_VERIFY_ISOLATED_DB:"1",VIDEO_FIXTURE_DATABASE_URL:databaseUrl,VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL:`http://127.0.0.1:${(router.address() as {port:number}).port}`,VIDEO_FIXTURE_ROUTER_TOKEN:randomBytes(32).toString("hex"),VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET:randomBytes(32).toString("hex")});
  const assetsRoot=path.join(out,"assets");await prepareVideoAssets(assetsRoot,[4]);
  const spec=MULTIMODAL_VIDEO_FAMILIES.find(item=>item.model==="seedance-2.0"&&item.providerId==="apib-video")!;assert.ok(spec);
  const h=fixture=await createVideoFixture({startWorker:false,databaseUrl,assetsRoot,videoProfile:spec.profile,videoWireModel:spec.model,videoDefinition:spec.definition});
  const cap=resolveVideoCapability({manual:spec.definition}),checks:unknown[]=[],cases:Array<{name:string;mode:VideoMode;refs:Array<{which:"image"|"lastImage"|"video"|"audio";kind:"image"|"video"|"audio";role:"reference"|"first_frame"|"last_frame"|"source_video"|"source_audio"}>}>=[
   {name:"text",mode:"text",refs:[]},
   {name:"single-image",mode:"single_image",refs:[{which:"image",kind:"image",role:"first_frame"}]},
   {name:"first-last",mode:"frames_required",refs:[{which:"image",kind:"image",role:"first_frame"},{which:"lastImage",kind:"image",role:"last_frame"}]},
   {name:"image-reference",mode:"reference",refs:[{which:"image",kind:"image",role:"reference"},{which:"lastImage",kind:"image",role:"reference"}]},
   {name:"all-reference",mode:"reference",refs:[{which:"image",kind:"image",role:"reference"},{which:"video",kind:"video",role:"source_video"},{which:"audio",kind:"audio",role:"source_audio"}]},
  ];
  const taskIds:string[]=[];let finishedAsset:any;
  for(const item of cases){
   const id="mode-"+randomUUID(),projectKey=`tree:${id}`,prompt="A red cube rotates slowly on a white table.";
   const config=reconcileVideoSettings({providerId:"managed-video",modelId:"video-a",mode:item.mode,prompt,durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},cap).config;
   const inputs=item.refs.map((r,index)=>({id:"input-"+index,nodeId:h.refs[r.which].id,kind:r.kind,role:r.role,value:h.refs[r.which].url}));
   const created=await h.request<any>("a","POST","/api/canvas/video-nodes",{id,projectKey,expectedRevision:0,operationId:randomUUID(),title:item.name,config,inputs});assert.equal(created.status,201,JSON.stringify(created.body));
   assert.equal((await h.request("b","GET",`/api/canvas/video-nodes/${id}`)).status,404);
   const intent={expectedRevision:1,idempotencyKey:randomUUID()},url=`/api/canvas/video-nodes/${id}/generate`;
   const sent=await h.request<any>("a","POST",url,intent);assert.equal(sent.status,202,JSON.stringify(sent.body));
   const replay=await h.request<any>("a","POST",url,intent);assert.equal(replay.body.taskId,sent.body.taskId);
   const deadline=Date.now()+180000;let task:any;
   while(Date.now()<deadline){await h.forceVideoPollDue(sent.body.taskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks?id=${sent.body.taskId}`)).body.task;if(task.status==="completed")break;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status),JSON.stringify(task));await new Promise(r=>setTimeout(r,300))}
   assert.equal(task?.status,"completed",JSON.stringify(task));const frozen=await h.taskPersistence("a",task.id);assert.equal(frozen.video_references.length,item.refs.length);
   assert.deepEqual(frozen.video_references.map((r:any)=>r.kind),item.refs.map(r=>r.kind));
   for(const ref of frozen.video_references){assert.ok(ref.sha256);assert.ok(ref.bytes>0);if(ref.kind!=="image")assert.ok(ref.durationSeconds>0)}
   const asset=task.resultAssets.find((asset:any)=>asset.kind==="video");assert.ok(asset?.artworkId);finishedAsset=asset;
   const bytes=await h.request<ArrayBuffer>("a","GET",asset.url);assert.equal(bytes.status,200);assert.equal(createHash("sha256").update(Buffer.from(bytes.body)).digest("hex"),asset.sha256);
   const node=(await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}`)).body.node;assert.equal(node.lastTaskId,task.id);assert.ok(node.lastResultId);
   const billing=await h.videoBillingEvidence("a",task.id);assert.equal(billing.operation.state,"settled");assert.equal(Number(billing.operation.reserved_credits),0);assert.ok(Number(billing.operation.charged_credits)>0);assert.equal(billing.reservation.length,0);assert.deepEqual(billing.ledger,[{delta:-Number(billing.operation.charged_credits),kind:"consume"}]);
   taskIds.push(task.id);checks.push({case:item.name,mode:config.mode,referenceKinds:item.refs.map(r=>r.kind),taskId:task.id,resultArtworkId:asset.artworkId,billing});console.log('VIDEO_MODE_CASE=PASS MODE='+item.name);
  }
  const creates=h.supplierCalls().filter(call=>call.phase==="create");assert.equal(creates.length,5);
  const mixed=creates.at(-1) as any;assert.ok(JSON.stringify(mixed.body).includes("video"));assert.ok(JSON.stringify(mixed.body).includes("audio"));
  const after=await h.creditState("a"),billingBefore=await Promise.all(taskIds.map(id=>h.videoBillingEvidence("a",id)));await h.tick();assert.deepEqual(await h.creditState("a"),after);assert.deepEqual(await Promise.all(taskIds.map(id=>h.videoBillingEvidence("a",id))),billingBefore);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,5);
  assert.equal((await h.request("b","GET",finishedAsset.url)).status,404);
  await writeFile(path.join(out,"RESULT.json"),JSON.stringify({checks,taskIds,realApp:true,realPostgres:true,realWorker:true,realStorage:true,realBilling:true,simulatedSupplierCreates:5,realSupplierCalls:0,referenceReads:h.supplierCalls().filter(call=>call.phase==="reference-read").length},null,2));
  console.log("VIDEO_MODES_APPLICATION=PASS CASES=5 REAL_APP_DB_WORKER_STORAGE_BILLING=PASS REPLAY=IDEMPOTENT REFERENCES=AUTHORIZED RESULT=NODE MEDIA_HASH=PASS CROSS_ACCOUNT=404 SIMULATED_CREATES=5 REAL_SUPPLIER_CALLS=0");
 }finally{if(fixture)await fixture.stop();if(listening)await new Promise<void>(r=>router.close(()=>r()));if(pool)await pool.end();if(container){assert.equal(docker(["inspect","--format",'{{index .Config.Labels "naumi.task"}}',container]),owner);docker(["rm","--force",container])}await unlink(envFile);}
}
main().catch(error=>{console.error(error);process.exitCode=1});
