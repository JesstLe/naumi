import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import path from "node:path";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {getPool} from "../src/platform/db/pool";

/** Actual shipped CLI/MCP -> actual Next gateway -> formal storyboard/workflow/timeline owners. */
export async function verifyStoryboardAgentGateway(input:{actor:string;project:string;planId:string;origin:string;cookie:string}){
 const {actor,project,planId,origin,cookie}=input,cliPath=path.resolve("public/agent/naumi.mjs"),checks:string[]=[];
 const pass=(name:string)=>{checks.push(name);};
 const headers={cookie,"content-type":"application/json"};
 const api=async(method:string,url:string,body?:unknown)=>{const r=await fetch(origin+url,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});const value=await r.json();assert.ok(r.ok,JSON.stringify({status:r.status,value}));return value;};
 const read=async(id:string)=>(await api("GET",`/api/canvas/storyboards?projectKey=${encodeURIComponent(project)}`)).plans.find((p:any)=>p.id===id);
 const token=async(name:string,scopes:string[],dailyCreditLimit:number|null)=>api("POST","/api/account/agent-tokens",{name,scopes,dailyCreditLimit,expiresInDays:1});
 const write=await token("storyboard gateway write",["read","write"],null),readonly=await token("storyboard gateway read",["read"],0),budget=await token("storyboard gateway zero cap",["read","write"],0);
 const env=(secret=write.secret,site=origin)=>({...process.env,NAUMI_SITE:site,NAUMI_TOKEN:secret,NAUMI_CONFIG:path.resolve("output/storyboard-gateway-no-profile.json")});
 const cli=(args:string[],secret=write.secret,site=origin)=>new Promise<{code:number|null;json:any}>((resolve,reject)=>{
  const child=spawn(process.execPath,[cliPath,...args],{env:env(secret,site),windowsHide:true,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="";
  child.stdout.on("data",chunk=>stdout+=chunk);child.stderr.on("data",chunk=>stderr+=chunk);child.on("error",reject);child.on("close",code=>{try{resolve({code,json:JSON.parse(stdout)});}catch{reject(new Error(`CLI JSON failed, code=${code}, stderr=${stderr.replaceAll(write.secret,"[redacted]").slice(-300)}`));}});
 });
 const call=async(tool:string,args:Record<string,unknown>,outer=randomUUID(),secret=write.secret,site=origin)=>cli(["call",tool,"--args",JSON.stringify(args),"--operation-id",outer],secret,site);
 const ok=(r:{code:number|null;json:any})=>{assert.equal(r.code,0,JSON.stringify(r.json));assert.equal(r.json.state,"succeeded",JSON.stringify(r.json));return r.json.output.details;};
 const state=async()=>({video:Number((await getPool().query("SELECT count(*) AS n FROM app_video_tasks WHERE email=$1",[actor])).rows[0].n),media:Number((await getPool().query("SELECT count(*) AS n FROM app_video_media_jobs WHERE email=$1",[actor])).rows[0].n),ledger:(await getPool().query("SELECT id,delta FROM app_ledger WHERE email=$1 ORDER BY id",[actor])).rows});
 let mcp:Client|undefined,proxy:ReturnType<typeof createServer>|undefined;
 try{
  const before=await state(),original=await read(planId),planKey=randomUUID();
  const schema=await cli(["tools","save_video_storyboard"]);assert.equal(schema.code,0);assert.equal(schema.json.parameters.properties.document.type,"object");assert.equal(schema.json.write,true);pass("cli_discovers_nested_formal_storyboard_schema");
  const listed=ok(await call("list_video_storyboards",{project_key:project}));assert.ok(listed.plans.some((p:any)=>p.id===planId));
  const doc=structuredClone(original.document),oldTake=doc.shots[0].takes[0];doc.title="CLI/MCP方案B";doc.shots[0].adoptedArtworkId=oldTake.artworkId;
  const saved=ok(await call("save_video_storyboard",{project_key:project,plan_id:planKey,expected_revision:0,operation_id:randomUUID(),document:doc}));let plan=saved.plan;assert.deepEqual((await read(planKey)).document,doc);pass("cli_creates_real_persistent_plan_webpage_reads_same_document");
  mcp=new Client({name:"storyboard-handoff",version:"1"});await mcp.connect(new StdioClientTransport({command:process.execPath,args:[cliPath,"mcp"],env:env() as Record<string,string>,stderr:"pipe"}));
  const discovered=await mcp.listTools(),inspectTool=discovered.tools.find(t=>t.name==="inspect_video_storyboard")!;assert.equal((inspectTool.inputSchema as any).properties.nodes.type,"array");assert.equal((inspectTool.inputSchema as any).properties.nodes.items.type,"object");
  const mcall=async(name:string,args:Record<string,unknown>)=>{const r=await mcp!.callTool({name,arguments:args});assert.equal(r.isError,false,JSON.stringify(r));const structured=r.structuredContent as any;assert.equal(structured.state,"succeeded");return structured.output.details;};
  assert.deepEqual((await mcall("get_video_storyboard",{project_key:project,plan_id:planKey})).plan,plan);pass("actual_mcp_reads_cli_plan_with_nested_schema_not_string_coercion");
  const nodes=plan.document.shots.map((s:any)=>s.nodeId),review=structuredClone(plan.document);review.shots[2].takes[0].note="MCP审片：保留旧版，稍后只重做03镜";
  plan=(await mcall("save_video_storyboard",{project_key:project,plan_id:planKey,expected_revision:plan.revision,operation_id:randomUUID(),document:review})).plan;
  assert.deepEqual((await read(planKey)).document,review);assert.deepEqual(ok(await call("get_video_storyboard",{project_key:project,plan_id:planKey})).plan,plan);pass("mcp_reviews_cli_and_web_recover_exact_plan_revision");
  const readTools=await cli(["tools","--json"],readonly.secret);assert.equal(readTools.code,0);assert.ok(!readTools.json.some((t:any)=>t.name==="save_video_storyboard"));assert.ok(readTools.json.some((t:any)=>t.name==="get_video_storyboard"));
  const readDenied=await call("save_video_storyboard",{project_key:project,plan_id:planKey,expected_revision:plan.revision,operation_id:randomUUID(),document:review},randomUUID(),readonly.secret);assert.equal(readDenied.code,3);assert.deepEqual(await state(),before);pass("readonly_token_hides_and_rejects_writes_without_charge");
  const cutArgs={project_key:project,plan_id:planKey,revision:plan.revision,operation_id:randomUUID(),mode:"create",node_ids:nodes};
  const cut=await mcall("apply_video_storyboard_roughcut",cutArgs);const actual=(await api("GET",`/api/canvas/timeline-nodes/${cut.nodeId}`)).node;assert.deepEqual(actual.timeline,cut.node.timeline);pass("mcp_creates_adopted_roughcut_webpage_opens_same_timeline");
  // Disconnect only after the real upstream gateway committed and returned its receipt.
  let disconnect=true;proxy=createServer(async(req,res)=>{try{const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const response=await fetch(origin+req.url,{method:req.method,headers:{authorization:req.headers.authorization||"","content-type":"application/json"},...(!["GET","HEAD"].includes(req.method||"GET")?{body:Buffer.concat(chunks)}:{})});const bytes=Buffer.from(await response.arrayBuffer());if(disconnect&&req.url?.endsWith("/calls")){disconnect=false;req.socket.destroy();return;}res.writeHead(response.status,{"content-type":response.headers.get("content-type")||"application/json"});res.end(bytes);}catch{res.writeHead(502);res.end("{}");}});
  await new Promise<void>(resolve=>proxy!.listen(0,"127.0.0.1",resolve));const proxyOrigin=`http://127.0.0.1:${(proxy.address() as {port:number}).port}`;
  const outer=randomUUID(),inner=randomUUID(),edited={...plan.document,title:"接手后保存"},writeArgs={project_key:project,plan_id:planKey,expected_revision:plan.revision,operation_id:inner,document:edited};
  const lost=await call("save_video_storyboard",writeArgs,outer,write.secret,proxyOrigin);assert.equal(lost.code,5);assert.ok(JSON.stringify(lost.json).includes(outer));
  const resumed=await cli(["status",outer]);plan=ok(resumed).plan;assert.deepEqual(plan.document,edited);assert.deepEqual(ok(await call("save_video_storyboard",writeArgs,outer)).plan,plan);assert.equal((await read(planKey)).revision,plan.revision);pass("cli_preheader_disconnect_status_and_same_operation_no_double_save");
  const stale=await call("save_video_storyboard",{...writeArgs,operation_id:randomUUID()});assert.notEqual(stale.code,0);assert.deepEqual(await state(),before);pass("cross_entry_stale_revision_keeps_existing_plan_and_no_charge");
  const configs=await Promise.all(nodes.map((id:string)=>api("GET",`/api/canvas/video-nodes/${id}`))),runArgs={project_key:project,operation_id:randomUUID(),storyboard:{id:planKey,revision:plan.revision},nodes:configs.map((v:any,index:number)=>({id:v.node.id,revision:v.node.revision,reuseCompleted:index!==2}))};
  const quote=await cli(["quote","run_video_workflow","--args",JSON.stringify(runArgs)],budget.secret);assert.equal(quote.code,0);assert.equal(quote.json.allowed,false);assert.equal(quote.json.refusal.code,"BUDGET_EXCEEDED");assert.ok(quote.json.credits>0);
  const capped=await call("run_video_workflow",runArgs,randomUUID(),budget.secret);assert.equal(capped.code,4);assert.deepEqual(await state(),before);pass("actual_cli_zero_budget_rejects_before_task_or_ledger");
  const run=ok(await call("run_video_workflow",runArgs));assert.equal(run.runId,runArgs.operation_id);let finished:any;const deadline=Date.now()+150000;
  while(Date.now()<deadline){await fetch(origin+"/api/video/worker/tick",{method:"POST",headers:{"x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!}});finished=(await api("GET",`/api/video/workflows/${run.runId}`)).run;for(const node of finished.nodes)if(node.taskId)await getPool().query("UPDATE app_video_tasks SET next_poll_at=now() WHERE email=$1 AND id=$2 AND status IN ('queued','processing')",[actor,node.taskId]);if(finished.nodes.every((n:any)=>n.status==="completed"))break;assert.ok(!finished.nodes.some((n:any)=>["blocked","failed","needs_attention"].includes(n.status)),JSON.stringify(finished));await new Promise(resolve=>setTimeout(resolve,250));}
  assert.ok(finished.nodes.every((n:any)=>n.status==="completed"));assert.equal((await mcall("get_video_workflow",{run_id:run.runId})).runId,run.runId);
  const after=await state();assert.equal(after.video,before.video+1);assert.equal(after.media,before.media);assert.equal(after.ledger.length,before.ledger.length+1);assert.equal((await read(planKey)).document.shots[2].adoptedArtworkId,plan.document.shots[2].adoptedArtworkId);assert.deepEqual((await api("GET",`/api/canvas/timeline-nodes/${cut.nodeId}`)).node.timeline,cut.node.timeline);pass("cli_generates_only_third_candidate_mcp_resumes_old_adoption_and_cut_unchanged");
  const remakeTask=finished.nodes.find((n:any)=>n.id===nodes[2]).taskId,task=(await api("GET",`/api/video/tasks/${remakeTask}`)).task,take=task.resultAssets.find((v:any)=>v.kind==="video"),adopted=structuredClone(plan.document);assert.ok(take);
  adopted.shots[2].takes.push({artworkId:take.artworkId,taskId:remakeTask,status:"approved",note:"用户授权代选：MCP采用03镜返工结果"});adopted.shots[2].adoptedArtworkId=take.artworkId;
  plan=(await mcall("save_video_storyboard",{project_key:project,plan_id:planKey,expected_revision:plan.revision,operation_id:randomUUID(),document:adopted})).plan;
  const updated=ok(await call("apply_video_storyboard_roughcut",{...cutArgs,revision:plan.revision,operation_id:randomUUID(),mode:"update",node_ids:[nodes[2]],timeline_id:cut.nodeId,timeline_revision:cut.node.revision})),expected=structuredClone(cut.node.timeline);expected.tracks[0].clips[2].artworkId=take.artworkId;assert.deepEqual(updated.node.timeline,expected);assert.deepEqual(await state(),after);assert.deepEqual(await read(planId),original);pass("mcp_adopts_cli_updates_exact_cut_web_and_other_plan_remain_consistent");
  await api("DELETE",`/api/account/agent-tokens?id=${readonly.token.id}`);const revoked=await cli(["call","get_video_storyboard","--args",JSON.stringify({project_key:project,plan_id:planKey})],readonly.secret);assert.equal(revoked.code,3);pass("revoked_cli_token_cannot_read_persistent_plan");
  return {checks,realCli:true,realMcp:true,realApp:true,realPostgres:true,newVideoTasks:1,newLedgerCharges:1};
 }finally{
  await mcp?.close().catch(()=>{});if(proxy)await new Promise<void>(resolve=>proxy!.close(()=>resolve()));
  for(const value of [write,readonly,budget])await fetch(origin+`/api/account/agent-tokens?id=${value.token.id}`,{method:"DELETE",headers}).catch(()=>{});
 }
}
