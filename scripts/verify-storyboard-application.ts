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
import {reconcileVideoSettings} from "../src/lib/video/client-settings";
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
  pool=new Pool({connectionString:databaseUrl,max:2});await pool.query("CREATE TABLE public.naumi_video_fixture_guard(owner text NOT NULL)");await pool.query("INSERT INTO public.naumi_video_fixture_guard VALUES($1)",["canvas-video-fusion-20261013"]);
  await new Promise<void>(r=>router.listen(0,"127.0.0.1",r));listening=true;
  Object.assign(process.env,{NAUMI_VERIFY_ISOLATED_DB:"1",VIDEO_FIXTURE_DATABASE_URL:databaseUrl,VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL:`http://127.0.0.1:${(router.address() as {port:number}).port}`,VIDEO_FIXTURE_ROUTER_TOKEN:randomBytes(32).toString("hex"),VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET:randomBytes(32).toString("hex")});
  const assetsRoot=path.join(out,"assets");await prepareVideoAssets(assetsRoot,[4]);
  const spec=STORYBOARD_VIDEO_FAMILIES.find(item=>item.model==="kling-v3")!;assert.ok(spec);
  console.log("STORYBOARD_APP_STAGE=real_app_worker_start");
  const h=fixture=await createVideoFixture({startWorker:false,databaseUrl,assetsRoot,videoProfile:spec.profile,videoWireModel:spec.model,videoDefinition:spec.definition});
  await h.setMediaPrice(3);
  const project=`tree:${h.refs.image.id}`,canvas={anchorId:h.refs.image.id,imageUrls:[h.refs.image.url],ratio:"1:1",resolution:"2K",quality:"max",video:{projectKey:project}};
  const internal=async(api:string,signal?:AbortSignal,init:RequestInit={})=>{assertInternalAgentPath(api,init.method||"GET");const response=await fetch(h.baseUrl+api,{...init,signal,headers:{...Object.fromEntries(new Headers(init.headers)),cookie:h.cookies.a}});const body=await response.json();if(!response.ok)throw Object.assign(new Error(JSON.stringify(body)),{status:response.status});return body};
  const tools=createCanvasVideoTools({actor:h.accounts.a,canvas,internal});
  const invoke=async(name:string,args:Record<string,unknown>,callId=randomUUID())=>{const tool=tools.find(item=>item.name===name)!;assert.ok(tool);validateToolArguments(tool.parameters,args);return(await tool.execute(callId,args)).details as any};
  const config=reconcileVideoSettings({modelId:"video-a",providerId:"managed-video",mode:"text",prompt:"Storyboard fixture",durationSeconds:4,resolution:"720p",aspectRatio:"16:9"},resolveVideoCapability({manual:spec.definition})).config;
  const parts=["第一镜：红色方块缓慢转动。\n","第二镜：蓝色方块进入画面。\n","第三镜：两个方块停止。\n"],creditBefore=await h.creditState("a"),source=await invoke("plan_video_script",{title:"分镜端到端原稿",content:parts.join("")});
  const callId=randomUUID(),storyArgs={mode:"independent",script_source:{node_id:source.node.id},config,shots:parts.map((part,index)=>({id:`shot-${index}`,title:`镜头${index+1}`,prompt:`Shot ${index+1}: original test cubes.`,originalText:part,durationSeconds:4}))};
  const story=await invoke("plan_video_storyboard",storyArgs,callId);assert.equal(story.nodes.length,3);const persisted=await h.request<any>("a","GET",`/api/canvas/storyboards?projectKey=${encodeURIComponent(project)}`);assert.equal(persisted.status,200);assert.equal(persisted.body.plans[0].id,story.planId);assert.deepEqual((await invoke("plan_video_storyboard",storyArgs,callId)).nodeIds,story.nodeIds);
  const fullRange={start:0,end:parts.join("").length};
  const cinematic=await invoke("plan_video_storyboard",{mode:"independent",script_source:{node_id:source.node.id,mapping:"cinematic"},config,shots:[
    {id:"speaking",prompt:"发声镜头",durationSeconds:4,mapping:{ranges:[fullRange],dialogue:[{start:0,end:3,speaker:"旁白"}]}},
    {id:"reaction",prompt:"反应镜头，无新增对白",durationSeconds:4,mapping:{ranges:[fullRange],dialogue:[]}},
    {id:"insert",prompt:"站台空镜",durationSeconds:4,mapping:{ranges:[],dialogue:[],supplement:"无对白空镜"}}
  ]});
  const cinematicPlan=(await h.request<any>("a","GET",`/api/canvas/storyboards?projectKey=${encodeURIComponent(project)}`)).body.plans.find((plan:any)=>plan.id===cinematic.planId);assert.equal(cinematicPlan.document.shots.length,3);assert.equal(cinematicPlan.document.shots[0].source.mapping.dialogue.length,1);assert.equal(cinematicPlan.document.shots[1].source.mapping.dialogue.length,0);pass("cinematic_mapping_real_agent_api_original_overlap_dialogue_once");
  assert.deepEqual(await h.creditState("a"),creditBefore);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
  for(let i=0;i<3;i++){assert.ok(story.nodes[i].config.prompt.includes(parts[i]));assert.ok(story.nodes[i].inputs.some((input:any)=>input.kind==="text"&&input.value===parts[i]));}
  pass("agent_saves_full_original_three_editable_shots_no_supplier_or_charge");
  const nodes=async()=>Promise.all(story.nodeIds.map(async(id:string)=>{const r=await h.request<any>("a","GET",`/api/canvas/video-nodes/${id}`);assert.equal(r.status,200);return r.body.node}));
  const intent=async(reuse:boolean|number[]=false,order=story.nodeIds)=>({id:randomUUID(),projectKey:project,nodes:(await nodes()).map((node:any,index:number)=>({id:node.id,revision:node.revision,...(reuse===true||Array.isArray(reuse)&&reuse.includes(index)?{reuseCompleted:true}:{})})),assembly:{nodeIds:order}});
  const submit=async(body:any)=>{const r=await h.request<any>("a","POST","/api/canvas/video-workflows",body);assert.equal(r.status,202,JSON.stringify(r.body));assert.equal(r.body.runId,body.id);return r.body};
  const read=async(id:string)=>{const r=await h.request<any>("a","GET",`/api/video/workflows/${id}`);assert.equal(r.status,200,JSON.stringify(r.body));return r.body.run};
  const resume=async(id:string)=>{const r=await h.request<any>("a","POST",`/api/video/workflows/${id}`,{action:"resume"});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.run};
  const wait=async(id:string,status="completed")=>{const deadline=Date.now()+240000;let last="";while(Date.now()<deadline){let run=await read(id);for(const node of run.nodes)if(node.taskId)await h.forceVideoPollDue(node.taskId);await h.tick();run=await resume(id);const current=JSON.stringify({nodes:run.nodes.map((n:any)=>n.status),assembly:run.assembly?.status});if(current!==last){console.log("STORYBOARD_APP_PROGRESS="+current);last=current}if(run.assembly?.status===status)return run;assert.ok(!run.nodes.some((n:any)=>["blocked","needs_attention"].includes(n.status)),JSON.stringify(run));assert.ok(!["failed","cancelled","needs_attention"].includes(run.assembly?.status),JSON.stringify(run));await new Promise(r=>setTimeout(r,250))}throw Error("Storyboard application timeout")};
  const validateOutput=async(run:any,label:string)=>{const output=run.assembly.outputs.find((o:any)=>o.mimeType.startsWith("video/"));assert.ok(output);const r=await h.request<ArrayBuffer>("a","GET",output.url);assert.equal(r.status,200);assert.equal(createHash("sha256").update(Buffer.from(r.body)).digest("hex"),output.sha256);assert.equal((await h.request("b","GET",output.url)).status,404);const file=path.join(out,label+".mp4");await writeFile(file,Buffer.from(r.body));const p=spawnSync("ffprobe",["-v","error","-show_streams","-show_format","-of","json",file],{encoding:"utf8",windowsHide:true});assert.equal(p.status,0,p.stderr);const probe=JSON.parse(p.stdout);assert.ok(probe.streams.some((s:any)=>s.codec_type==="audio"));assert.ok(Math.abs(Number(probe.format.duration)-12)<.15);return {output,probe}};
  const first=await intent();await submit(first);assert.equal((await h.request("b","GET",`/api/video/workflows/${first.id}`)).status,404);await submit(first);
  console.log("STORYBOARD_APP_STAGE=restart_app_with_original_run");await h.restartApp();await submit(first);
  const complete=await wait(first.id);assert.equal(complete.progress,100);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,3);await validateOutput(complete,"first-assembly");
  const videoIds=complete.nodes.map((n:any)=>n.taskId);for(const id of videoIds){const bill=await h.videoBillingEvidence("a",id);assert.equal(bill.operation.state,"settled");assert.equal(bill.reservation.length,0);assert.equal(bill.ledger.length,1)}
  const mediaBill=await h.mediaBillingEvidence("a",complete.assembly.jobId);assert.equal(mediaBill.operation.state,"settled");assert.equal(Number(mediaBill.operation.charged_credits),3);assert.equal(mediaBill.ledger.length,1);
  const beforeReplay={video:await h.dbCount("app_video_tasks"),media:await h.dbCount("app_video_media_jobs"),credits:await h.creditState("a")};await submit(first);await h.restartMediaWorker();await resume(first.id);assert.deepEqual({video:await h.dbCount("app_video_tasks"),media:await h.dbCount("app_video_media_jobs"),credits:await h.creditState("a")},beforeReplay);
  pass("three_shots_auto_assembly_restart_replay_hash_audio_billing",{runId:first.id,jobId:complete.assembly.jobId,videoIds});
  const current=await nodes(),edited=await invoke("set_video_prompt",{node_id:current[1].id,expected_revision:current[1].revision,prompt:current[1].config.prompt+"\n仅修改第二镜的运镜。"});assert.ok(edited.node.revision>current[1].revision);
  const partial=await intent([0,2]);await submit(partial);const partialRun=await wait(partial.id);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,4);assert.equal(partialRun.nodes.filter((n:any)=>n.taskId).length,1);await validateOutput(partialRun,"partial-assembly");pass("local_edit_generates_one_shot_reuses_other_two",{runId:partial.id});
  const savedPlan=(await h.request<any>("a","GET",`/api/canvas/storyboards?projectKey=${encodeURIComponent(project)}`)).body.plans.find((plan:any)=>plan.id===story.planId);
  const adoptedIds:string[]=[];
  for(const shot of savedPlan.document.shots){const stage=complete.nodes.find((n:any)=>n.id===shot.nodeId),task=(await h.request<any>("a","GET",`/api/video/tasks/${stage.taskId}`)).body.task;const art=task.resultAssets.find((asset:any)=>asset.kind==="video").artworkId;adoptedIds.push(art);shot.adoptedArtworkId=art;shot.takes=[{artworkId:art,taskId:task.id,status:"approved",note:"original take"}];}
  const adoption=await h.request<any>("a","POST","/api/canvas/storyboards",{id:savedPlan.id,projectKey:project,expectedRevision:savedPlan.revision,operationId:randomUUID(),document:savedPlan.document});assert.equal(adoption.status,200,JSON.stringify(adoption.body));
  const adoptedIntent={...await intent(true),storyboard:{id:savedPlan.id,revision:adoption.body.plan.revision}};await submit(adoptedIntent);const adoptedRun=await wait(adoptedIntent.id);assert.deepEqual(adoptedRun.plan.nodes.map((n:any)=>n.existingArtworkId),adoptedIds);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,4);await validateOutput(adoptedRun,"adopted-assembly");pass("persistent_plan_adopted_old_take_survives_new_result_zero_generation");
  const reorder=await intent(true,[...story.nodeIds].reverse());await submit(reorder);const reordered=await wait(reorder.id);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,4);assert.equal(reordered.nodes.filter((n:any)=>n.taskId).length,0);assert.deepEqual(reordered.plan.assembly.nodeIds,[...story.nodeIds].reverse());await validateOutput(reordered,"reordered-assembly");pass("all_reused_reorder_only_assembles_zero_video_calls");
  const invalid={...await intent(true),assembly:{nodeIds:[story.nodeIds[0],story.nodeIds[0]]}},invalidBefore=await h.dbCount("app_video_media_jobs");assert.equal((await h.request<any>("a","POST","/api/canvas/video-workflows",invalid)).status,422);assert.equal(await h.dbCount("app_video_media_jobs"),invalidBefore);pass("invalid_order_rejected_without_media_purchase");
  const failedIntent=await intent(true);await submit(failedIntent);const queued=await read(failedIntent.id);assert.equal(queued.assembly.status,"queued");await h.failOwnedQueuedAssembly(queued.assembly.jobId);const failed=await wait(failedIntent.id,"failed");assert.equal(failed.assembly.error,"媒体处理失败，请检查输入与处理参数");assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,4);const failedBilling=await h.mediaBillingEvidence("a",failed.assembly.jobId);assert.equal(Number(failedBilling.operation.charged_credits),0);assert.equal(failedBilling.ledger.length,0);
  const retry=await h.request<any>("a","POST",`/api/video/workflows/${failedIntent.id}`,{action:"retry-assembly",expectedAttempt:0});assert.equal(retry.status,200,JSON.stringify(retry.body));const retryReplay=await h.request<any>("a","POST",`/api/video/workflows/${failedIntent.id}`,{action:"retry-assembly",expectedAttempt:0});assert.equal(retryReplay.status,200);const recovered=await wait(failedIntent.id);assert.equal(recovered.assembly.attempt,1);assert.notEqual(recovered.assembly.jobId,failed.assembly.jobId);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,4);const retryBill=await h.mediaBillingEvidence("a",recovered.assembly.jobId);assert.equal(retryBill.ledger.length,1);pass("real_media_failure_retry_only_new_media_attempt_no_video_replay",{failedJob:failed.assembly.jobId,retryJob:recovered.assembly.jobId});
  const cancelledIntent=await intent(true);await submit(cancelledIntent);const cancelled=await h.request<any>("a","POST",`/api/video/workflows/${cancelledIntent.id}`,{action:"cancel"});assert.equal(cancelled.status,200);assert.ok(cancelled.body.run.cancellationRequestedAt);assert.equal(cancelled.body.run.assembly.status,"cancelled");assert.equal((await h.request("a","POST",`/api/video/workflows/${cancelledIntent.id}`,{action:"retry-assembly",expectedAttempt:0})).status,409);assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,4);pass("cancelled_run_does_not_restart_generation_or_assembly");
  const native=await invoke("plan_video_storyboard",{mode:"multi_shot",config,shots:[{id:"native-a",prompt:"Red cube",durationSeconds:2},{id:"native-b",prompt:"Blue cube",durationSeconds:2}]});assert.equal(native.node.config.shots.length,2);const generated=await h.request<any>("a","POST",`/api/canvas/video-nodes/${native.node.id}/generate`,{expectedRevision:native.node.revision,idempotencyKey:randomUUID()});assert.equal(generated.status,202,JSON.stringify(generated.body));let task:any;const nativeDeadline=Date.now()+120000;while(Date.now()<nativeDeadline){await h.forceVideoPollDue(generated.body.taskId);await h.tick();task=(await h.request<any>("a","GET",`/api/video/tasks?id=${generated.body.taskId}`)).body.task;if(task.status==="completed")break;assert.ok(!["failed","cancelled","needs_attention"].includes(task.status),JSON.stringify(task));await new Promise(r=>setTimeout(r,250))}assert.equal(task.status,"completed");const nativeCall=h.supplierCalls().filter(call=>call.phase==="create").at(-1) as any;assert.equal(nativeCall.body.multi_prompt.length,2);assert.equal(nativeCall.body.multi_shot,true);pass("native_multi_shot_actual_task_and_wire");
  await writeFile(path.join(out,"RESULT.json"),JSON.stringify({checks,realApp:true,realPostgres:true,actualAgentTools:true,actualMediaWorker:true,realBilling:true,simulatedSupplierCreates:h.supplierCalls().filter(call=>call.phase==="create").length,realSupplierCalls:0,creativeModelNotTested:true,root:process.cwd()},null,2));
  console.log(`STORYBOARD_APPLICATION=PASS CHECKS=${checks.length} REAL_APP_DB_WORKER_STORAGE_BILLING=PASS PLANNING=FREE REUSE=PASS REPLAY=PASS FAILED_ASSEMBLY_RETRY=MEDIA_ONLY CANCEL=PASS NATIVE_SHOTS=PASS REAL_SUPPLIER_CALLS=0`);
 }finally{if(fixture)await fixture.stop();if(listening)await new Promise<void>(r=>router.close(()=>r()));if(pool)await pool.end();if(container){assert.equal(docker(["inspect","--format",'{{index .Config.Labels "naumi.task"}}',container]),owner);docker(["rm","--force",container])}await unlink(envFile);console.log("STORYBOARD_APP_CLEANUP=OWN_FIXTURE_REMOVED");}
}
main().catch(error=>{console.error(error);process.exitCode=1});
