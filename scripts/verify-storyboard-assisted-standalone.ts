import {verifyStoryboardAssistedApplication} from "./verify-storyboard-assisted-application";
import {verifyStoryboardStructureApplication} from "./verify-storyboard-structure-application";
import {verifyStoryboardProductionApplication} from "./verify-storyboard-production-application";
import {verifyStoryboardIndependentApplication} from "./verify-storyboard-independent-application";
import {verifyStoryboardReviewApplication} from "./verify-storyboard-review-application";
import {verifyStoryboardDialogueApplication} from "./verify-storyboard-dialogue-application";
import assert from "node:assert/strict";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createServer} from "node:http";
import {mkdir,writeFile,unlink} from "node:fs/promises";
import path from "node:path";
import {Pool} from "pg";
import {createVideoFixture} from "./video-fusion/harness";
import {prepareVideoAssets} from "./video-fusion/assets.mjs";
import {STORYBOARD_VIDEO_FAMILIES} from "../src/lib/model-config/video-family-storyboard";
import {resolveVideoCapability} from "../src/lib/video/contract";
import {reconcileVideoSettings} from "../src/lib/video/legacy-client-settings";
import {createCanvasVideoTools} from "../src/lib/agent/canvas-video-tools";
import {validateToolArguments} from "../src/lib/agent/harness";
import {assertInternalAgentPath} from "../src/lib/agent/harness-network";

// Real App + isolated PG + actual media Worker. Supplier video bytes are fixture
// media. Agent tool execution is real; creative model behavior is not claimed.
async function main(){
 const out=path.resolve(process.argv[2]||"E:/Workspace/naumi/output/storyboard-flow-20261102/application");await mkdir(out,{recursive:true});
 process.env.VIDEO_FIXTURE_OUTPUT_ROOT||="E:/tmp/nsb1102";
 const owner="storyboard-flow-20261102",name="storyboard-"+randomUUID(),password=randomBytes(24).toString("hex"),database="naumi_video_fixture_storyboard_"+randomBytes(5).toString("hex");
 const envFile=path.join(out,name+".env");await writeFile(envFile,`POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`,{mode:0o600});
 const docker=(args:string[])=>{const r=spawnSync("docker",args,{encoding:"utf8",windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim()};
 let container="",pool:Pool|undefined,fixture:Awaited<ReturnType<typeof createVideoFixture>>|undefined,listening=false,digest="";const publications=new Map<string,unknown>(),checks:Array<{name:string;detail?:unknown}>=[];
 const pass=(name:string,detail?:unknown)=>{checks.push({name,detail});console.log("STORYBOARD_APP_CHECK=PASS "+name)};
 const router=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};const send=(status:number,data:unknown)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(data))};
  if(req.url==="/internal/config/state")return send(200,{digest});if(req.url==="/internal/config/prepare")return send(200,{digest:body.digest,phase:"prepared"});
  if(req.url==="/internal/config/activate"){if(body.expectedDigest!==digest)return send(409,{});digest=body.digest;const p={id:body.id,digest,phase:"applied"};publications.set(body.id,p);return send(200,p)}
  if(req.url?.startsWith("/internal/config/publications/")){const p=publications.get(req.url.split("/").at(-1)!);return send(p?200:404,p||{})}send(404,{});
 }catch{res.writeHead(500);res.end()}});
 try{
  console.log("STORYBOARD_APP_STAGE=isolated_database");
  let databaseUrl=process.env.STORYBOARD_NATIVE_FIXTURE_URL||"";
  if(databaseUrl){const supplied=new URL(databaseUrl);assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");assert.equal(supplied.hostname,"127.0.0.1");assert.equal(supplied.pathname,"/naumi_video_fixture_storyboard_director");}
  else {
  container=docker(["run","--detach","--rm","--name",name,"--label",`naumi.task=${owner}`,"--memory","768m","--cpus","2","--tmpfs","/var/lib/postgresql/data","--publish","127.0.0.1::5432","--env-file",envFile,"postgres:16-alpine"]);
  let ready=false;for(let i=0;i<60;i++){if(spawnSync("docker",["exec",container,"pg_isready","-U","postgres","-d",database],{windowsHide:true,stdio:"ignore"}).status===0){ready=true;break}await new Promise(r=>setTimeout(r,200))}assert.ok(ready);
  const port=Number(docker(["port",container,"5432/tcp"]).split(":").at(-1));databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
  }
  pool=new Pool({connectionString:databaseUrl,max:2});await pool.query("CREATE TABLE IF NOT EXISTS public.naumi_video_fixture_guard(owner text NOT NULL)");await pool.query("INSERT INTO public.naumi_video_fixture_guard SELECT $1 WHERE NOT EXISTS(SELECT 1 FROM public.naumi_video_fixture_guard)",["canvas-video-fusion-20261013"]);
  assert.equal((await pool.query("SELECT owner FROM public.naumi_video_fixture_guard")).rows[0].owner,"canvas-video-fusion-20261013");
  await new Promise<void>(r=>router.listen(0,"127.0.0.1",r));listening=true;
  Object.assign(process.env,{NAUMI_VERIFY_ISOLATED_DB:"1",VIDEO_FIXTURE_DATABASE_URL:databaseUrl,VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL:`http://127.0.0.1:${(router.address() as {port:number}).port}`,VIDEO_FIXTURE_ROUTER_TOKEN:randomBytes(32).toString("hex"),VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET:randomBytes(32).toString("hex")});
  const assetsRoot=path.join(out,"assets");await prepareVideoAssets(assetsRoot,[4]);
  const spec=STORYBOARD_VIDEO_FAMILIES.find(item=>item.model==="kling-v3")!;assert.ok(spec);
  console.log("STORYBOARD_APP_STAGE=real_app_worker_start");
  let assistedMode="valid";
  const h=fixture=await createVideoFixture({...({agentVision:true,agentReply:async(body:any)=>{assert.ok(body.messages[0].content.includes("抽样静帧"));assert.equal(body.messages[1].content.filter((part:any)=>part.type==="image_url").length,3);return {text:assistedMode==="invalid"?"{}":JSON.stringify({summary:"静帧中手机颜色待核对",findings:[{frameIndexes:[1],issue:"visual",observation:"1号帧的手中物体呈红色",uncertainty:"抽样帧不能核对完整动作，也没有角色参考图",suggestion:"人工确认手机是否应为红色"}],limitations:["仅3张静帧；未检查声音、对白或整片连续性"]})}}}),startWorker:false,databaseUrl,assetsRoot,videoProfile:spec.profile,videoWireModel:spec.model,videoDefinition:spec.definition});
  await h.setMediaPrice(3);await h.setTextPrice(2);
  const project=`tree:${h.refs.image.id}`,canvas={anchorId:h.refs.image.id,imageUrls:[h.refs.image.url],ratio:"1:1",resolution:"2K",quality:"max",video:{projectKey:project}};
  const internal=async(api:string,signal?:AbortSignal,init:RequestInit={})=>{assertInternalAgentPath(api,init.method||"GET");const response=await fetch(h.baseUrl+api,{...init,signal,headers:{...Object.fromEntries(new Headers(init.headers)),cookie:h.cookies.a}});const body=await response.json();if(!response.ok)throw Object.assign(new Error(JSON.stringify(body)),{status:response.status});return body};
  const tools=createCanvasVideoTools({actor:h.accounts.a,canvas,internal});
  const invoke=async(name:string,args:Record<string,unknown>,callId=randomUUID())=>{const tool=tools.find(item=>item.name===name)!;assert.ok(tool);validateToolArguments(tool.parameters,args);return(await tool.execute(callId,args)).details as any};
  const config=reconcileVideoSettings({modelId:"video-a",providerId:"managed-video",mode:"text",prompt:"Storyboard fixture",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},resolveVideoCapability({manual:spec.definition})).config;
  const story=await invoke("plan_video_storyboard",{mode:"independent",config,shots:[{id:"assist-shot",prompt:"A red cube on a blue table",durationSeconds:4}]});
  const node=story.nodes[0],generated=await h.request<any>("a","POST",`/api/canvas/video-nodes/${node.id}/generate`,{expectedRevision:node.revision,idempotencyKey:randomUUID()});assert.equal(generated.status,202,JSON.stringify(generated.body));
  let task:any;const deadline=Date.now()+120000;
  while(Date.now()<deadline){await h.forceVideoPollDue(generated.body.taskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks/${generated.body.taskId}`)).body.task;if(task.status==="completed")break;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status));await new Promise(resolve=>setTimeout(resolve,250));}
  assert.equal(task.status,"completed");const plan=(await h.request<any>("a","GET",`/api/canvas/storyboards?projectKey=${encodeURIComponent(project)}`)).body.plans.find((value:any)=>value.id===story.planId),artworkId=task.resultAssets.find((asset:any)=>asset.kind==="video").artworkId;
  plan.document.shots[0].takes=[{artworkId,taskId:task.id,status:"approved",note:"original adopted take"}];plan.document.shots[0].adoptedArtworkId=artworkId;
  assert.equal((await h.request("a","POST","/api/canvas/storyboards",{id:plan.id,projectKey:project,expectedRevision:plan.revision,operationId:randomUUID(),document:plan.document})).status,200);
  await verifyStoryboardAssistedApplication(h,project,story.planId,value=>{assistedMode=value;},pass);
  await writeFile(path.join(out,"RESULT.json"),JSON.stringify({checks,realApp:true,realPostgres:true,actualMediaWorker:true,realBilling:true,realSupplierCalls:0},null,2));
  console.log(`STORYBOARD_ASSISTED_APPLICATION=PASS CHECKS=${checks.length} REAL_APP_PG_MEDIA_BILLING=1 REAL_SUPPLIER_CALLS=0`);
 }finally{if(fixture)await fixture.stop();if(listening)await new Promise<void>(r=>router.close(()=>r()));if(pool)await pool.end();if(container){assert.equal(docker(["inspect","--format",'{{index .Config.Labels "naumi.task"}}',container]),owner);docker(["rm","--force",container])}await unlink(envFile);console.log("STORYBOARD_APP_CLEANUP=OWN_FIXTURE_REMOVED");}
}
main().catch(error=>{console.error(error);process.exitCode=1});
