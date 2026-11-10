import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createCanvasVideoTools} from "../src/lib/agent/canvas-video-tools";
import {createNaumiTools,describeNaumiTools} from "../src/lib/agent/naumi-tools";
import {internalCookie,gatewayToolViews} from "../src/lib/agent-gateway/tool-session";
import {agentBillingPrecheck,type AgentBillingSession} from "../src/lib/billing/agent";
import {getPool,closeDatabasePools} from "../src/platform/db/pool";
import {assertInternalAgentPath} from "../src/lib/agent/harness-network";
import {validateToolArguments} from "../src/lib/agent/harness";

async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/naumi_video_fixture_/);assert.match(url.searchParams.get("options")||"",/video_run_[a-f0-9]+/);
 const actor=process.env.VIDEO_FIXTURE_ACTION_ACTOR!,project=process.env.VIDEO_FIXTURE_ACTION_PROJECT!,planId=process.env.VIDEO_FIXTURE_ACTION_PLAN!,origin=process.env.INTERNAL_APP_ORIGIN!,cookie=internalCookie(actor);
 const checks:string[]=[],pass=(name:string)=>checks.push(name);let lost=false,failAuth=false,prepared:AgentBillingSession["preparedVideoWorkflow"];
 const internal=async(path:string,signal?:AbortSignal,init:RequestInit={})=>{
  assertInternalAgentPath(path,init.method||"GET");if(failAuth){failAuth=false;throw Object.assign(new Error("expired fixture session"),{status:401});}
  const response=await fetch(origin+path,{...init,signal,headers:{...Object.fromEntries(new Headers(init.headers)),cookie}}),body=await response.json();
  if(!response.ok)throw Object.assign(new Error(JSON.stringify(body)),{status:response.status});
  if(lost&&init.method==="POST"){lost=false;throw Object.assign(new Error("committed response lost"),{status:503});}return body;
 };
 const tools=createCanvasVideoTools({actor,internal,preparedWorkflow:()=>prepared});
 const invoke=async(name:string,args:Record<string,unknown>)=>{const tool=tools.find(tool=>tool.name===name)!;assert.ok(tool,name);validateToolArguments(tool.parameters,args);return (await tool.execute(randomUUID(),args)).details as any;};
 const get=async(id:string)=>(await invoke("get_video_storyboard",{project_key:project,plan_id:id})).plan;
 const state=async()=>({video:Number((await getPool().query("SELECT count(*) AS n FROM app_video_tasks WHERE email=$1",[actor])).rows[0].n),media:Number((await getPool().query("SELECT count(*) AS n FROM app_video_media_jobs WHERE email=$1",[actor])).rows[0].n),ledger:(await getPool().query("SELECT * FROM app_ledger WHERE email=$1 ORDER BY id",[actor])).rows});
 try{
  const before=await state(),original=await get(planId),id=randomUUID();
  const create={project_key:project,plan_id:id,expected_revision:0,operation_id:randomUUID(),document:{...structuredClone(original.document),title:"Agent方案B"}};
  const oldTake=create.document.shots[0].takes[0];create.document.shots[0]={...create.document.shots[0],adoptedArtworkId:oldTake.artworkId};
  let plan=(await invoke("save_video_storyboard",create)).plan;assert.equal((await get(id)).id,id);assert.ok((await invoke("list_video_storyboards",{project_key:project})).plans.some((p:any)=>p.id===id));assert.deepEqual(await get(planId),original);pass("headless_creates_and_reads_explicit_shared_node_plan_without_touching_original");
  const toolsView=describeNaumiTools(createNaumiTools(new Request(origin),actor,()=>({cookie,authorization:""}))),gateway=gatewayToolViews(tools);
  for(const name of ["get_video_storyboard","save_video_storyboard","inspect_video_storyboard","apply_video_storyboard_roughcut"]){assert.ok(toolsView.some(t=>t.name===name));assert.ok(gateway.some(t=>t.name===name));}pass("in_app_and_headless_registry_same_business_contract");
  const nodeIds=plan.document.shots.map((s:any)=>s.nodeId),inspectArgs={project_key:project,plan_id:id,revision:plan.revision,nodes:nodeIds.map((id:string,i:number)=>({id,reuseCompleted:i!==2}))};
  const inspect=await invoke("inspect_video_storyboard",inspectArgs);assert.equal(inspect.quote.newShots,1);assert.equal(inspect.quote.reusedShots,2);assert.equal(typeof inspect.quote.generationCredits,"number");assert.deepEqual(await state(),before);pass("real_preflight_prices_and_review_plan_no_tasks_no_charge");
  const write={...create,expected_revision:plan.revision,operation_id:randomUUID(),document:{...plan.document,title:"Agent方案B · 已审片"}};lost=true;await assert.rejects(()=>invoke("save_video_storyboard",write),new RegExp(write.operation_id));
  const receipt=(await invoke("get_video_storyboard_operation",{project_key:project,operation_id:write.operation_id})).plan;plan=(await invoke("save_video_storyboard",write)).plan;assert.deepEqual(plan,receipt);assert.equal(plan.revision,2);pass("real_save_lost_response_receipt_and_exact_replay");
  await assert.rejects(()=>invoke("save_video_storyboard",{...write,operation_id:randomUUID()}));await assert.rejects(()=>invoke("save_video_storyboard",{...write,document:{...write.document,title:"collision"}}));pass("real_stale_revision_and_changed_operation_conflict");
  const cutArgs={project_key:project,plan_id:id,revision:plan.revision,operation_id:randomUUID(),mode:"create",node_ids:nodeIds};lost=true;await assert.rejects(()=>invoke("apply_video_storyboard_roughcut",cutArgs),new RegExp(cutArgs.operation_id));const cut=await invoke("apply_video_storyboard_roughcut",cutArgs);assert.equal(cut.node.timeline.tracks[0].clips[0].artworkId,plan.document.shots[0].adoptedArtworkId);assert.equal((await invoke("apply_video_storyboard_roughcut",cutArgs)).node.revision,cut.node.revision);pass("real_roughcut_committed_unknown_recovers_same_timeline");
  const update={...cutArgs,operation_id:randomUUID(),mode:"update",node_ids:[nodeIds[2]],timeline_id:cut.nodeId,timeline_revision:cut.node.revision};failAuth=true;await assert.rejects(()=>invoke("apply_video_storyboard_roughcut",update),new RegExp(update.operation_id));const unchanged=await invoke("apply_video_storyboard_roughcut",update);assert.equal(unchanged.node.revision,cut.node.revision);assert.deepEqual(unchanged.node.timeline,cut.node.timeline);pass("real_auth_recovery_noop_preserves_manual_audio_and_revision");
  const creds={cookie,authorization:""},billing:AgentBillingSession={email:actor,id:randomUUID(),cred:creds};
  const nodes=await Promise.all(nodeIds.map(async(id:string)=>(await internal(`/api/canvas/video-nodes/${id}`)).node));
  const runArgs={operation_id:randomUUID(),project_key:project,storyboard:{id,revision:plan.revision},nodes:nodes.map((n:any)=>({id:n.id,revision:n.revision,reuseCompleted:true}))};
  assert.notEqual(plan.document.shots[0].adoptedArtworkId,nodes[0].lastResultId);
  const precheck=await agentBillingPrecheck(billing,"run_video_workflow",runArgs,randomUUID());assert.equal(precheck,undefined);prepared=billing.preparedVideoWorkflow;assert.ok(prepared);assert.deepEqual(prepared.intent.storyboard,runArgs.storyboard);assert.deepEqual(prepared.plan.nodes.map(n=>n.existingArtworkId),plan.document.shots.map((s:any)=>s.adoptedArtworkId));assert.equal(billing.preparedBudgetCredits,0);pass("actual_billing_freezes_explicit_adopted_versions_not_latest_results");
  const run=await invoke("run_video_workflow",runArgs);assert.equal(run.runId,runArgs.operation_id);const runState=(await invoke("get_video_workflow",{run_id:run.runId}));assert.ok(runState.nodes.every((n:any)=>n.status==="completed"));assert.deepEqual(await state(),before);pass("actual_execution_accepts_same_billing_intent_reuses_without_generation");
  await invoke("run_video_workflow",runArgs);await assert.rejects(()=>invoke("run_video_workflow",{...runArgs,storyboard:{id:planId,revision:original.revision}}));pass("workflow_original_operation_replay_and_different_plan_collision");
  const staleArgs={...runArgs,operation_id:randomUUID(),storyboard:{id,revision:1}};const denied=await agentBillingPrecheck(billing,"run_video_workflow",staleArgs,randomUUID());assert.equal(denied?.block,true);pass("billing_stale_storyboard_rejected_before_generation");
  const {withFrozenCreation}=await import("../src/lib/saas/creation-scope");const {getStoryboardOperation}=await import("../src/lib/storyboard/service");
  await withFrozenCreation({actorEmail:actor,scopeKind:"tenant",tenantId:randomUUID(),workspaceExplicit:true},async()=>{await assert.rejects(()=>getStoryboardOperation(actor,project,write.operation_id));});
  const foreign=await fetch(origin+`/api/canvas/storyboards?projectKey=${encodeURIComponent(project)}&operationId=${write.operation_id}`,{headers:{cookie:internalCookie(process.env.VIDEO_FIXTURE_ACTION_OTHER!)}});assert.ok([403,404].includes(foreign.status),`foreign receipt HTTP=${foreign.status}`);pass("receipt_cross_actor_and_workspace_rejected");
  assert.deepEqual(await state(),before);assert.deepEqual(await get(planId),original);
  const remake={...runArgs,operation_id:randomUUID(),nodes:runArgs.nodes.map((node:any,index:number)=>({...node,reuseCompleted:index!==2}))};
  assert.equal(await agentBillingPrecheck(billing,"run_video_workflow",remake,randomUUID()),undefined);prepared=billing.preparedVideoWorkflow;assert.ok(prepared);assert.ok(billing.preparedBudgetCredits!>0);assert.equal(prepared.plan.nodes.filter(n=>!n.existingArtworkId).length,1);
  const made=await invoke("run_video_workflow",remake);let finished:any;const deadline=Date.now()+120000;
  while(Date.now()<deadline){await fetch(origin+"/api/video/worker/tick",{method:"POST",headers:{"x-video-worker-secret":process.env.VIDEO_WORKER_SECRET!}});finished=await invoke("get_video_workflow",{run_id:made.runId});if(finished.nodes.every((n:any)=>n.status==="completed"))break;assert.ok(!finished.nodes.some((n:any)=>["failed","needs_attention","blocked"].includes(n.status)),JSON.stringify(finished));await new Promise(resolve=>setTimeout(resolve,300));}
  assert.ok(finished.nodes.every((n:any)=>n.status==="completed"));const after=await state();assert.equal(after.video,before.video+1);assert.equal(after.media,before.media);assert.deepEqual((await get(id)).document,plan.document);pass("only_third_shot_generates_candidate_old_adoption_and_roughcut_unchanged");
  const taskId=finished.nodes.find((node:any)=>node.id===nodeIds[2]).taskId,task=(await internal(`/api/video/tasks/${taskId}`)).task,take=task.resultAssets.find((asset:any)=>asset.kind==="video");assert.ok(take);
  const reviewed=structuredClone(plan.document);reviewed.shots[2].takes.push({artworkId:take.artworkId,taskId,status:"approved",note:"用户已授权代选：采用03镜候选，其他保持"});reviewed.shots[2].adoptedArtworkId=take.artworkId;
  plan=(await invoke("save_video_storyboard",{...write,expected_revision:plan.revision,operation_id:randomUUID(),document:reviewed})).plan;
  const changed=await invoke("apply_video_storyboard_roughcut",{...update,operation_id:randomUUID(),revision:plan.revision});const expected=structuredClone(cut.node.timeline);expected.tracks[0].clips[2].artworkId=take.artworkId;assert.deepEqual(changed.node.timeline,expected);assert.deepEqual(changed.changes.map((c:any)=>c.nodeId),[nodeIds[2]]);assert.deepEqual(await state(),after);assert.deepEqual(await get(planId),original);pass("explicitly_adopt_new_third_take_update_exact_cut_preserve_other_shots_and_audio");
  assert.equal((await getPool().query("SELECT count(*)::int AS n FROM app_ledger WHERE email=$1 AND id=$2",[actor,`led-video-${taskId}`])).rows[0].n,1);pass("one_new_generation_one_ledger_charge");
  console.log(JSON.stringify({checks,realApp:true,realPostgres:true,actualBillingPrecheck:true,actualToolExecution:true,generatedTasks:1,mediaJobs:0}));
 }finally{await closeDatabasePools();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
