import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createCanvasVideoTools} from "../src/lib/agent/canvas-video-tools";
import {validateToolArguments} from "../src/lib/agent/harness";
import {assertInternalAgentPath} from "../src/lib/agent/harness-network";
import {CREATIVE_AGENT_TOOLS} from "../src/lib/agent/creative-tool-catalog";
import {CANVAS_VIDEO_WRITE_TOOLS} from "../src/lib/agent/canvas-context";
import {TOOL_ACCESS} from "../src/lib/feature-access/catalog";

async function main(){
 const project="tree:agent-storyboard",planId=randomUUID(),otherId=randomUUID(),operationId=randomUUID();
 const shot=(nodeId:string,number:string)=>({nodeId,number,scene:"车站",purpose:"等待",takes:[{artworkId:`old-${nodeId}`,taskId:`task-${nodeId}`,status:"approved",note:"保留表演"}],adoptedArtworkId:`old-${nodeId}`});
 let plan:any={id:planId,projectKey:project,revision:1,document:{title:"方案B",assemble:true,shots:[shot("a","01"),shot("b","02"),shot("c","03")]}};
 const other={...structuredClone(plan),id:otherId,document:{...plan.document,title:"另一方案"}};
 const receipts=new Map<string,{body:string;plan:any}>(),requests:Array<{path:string;body:any;method:string}>=[];
 let fail=0,committedThenLost=false;
 const internal=async(path:string,_signal?:AbortSignal,init:RequestInit={})=>{
  const method=init.method||"GET",body=init.body?JSON.parse(String(init.body)):null;assertInternalAgentPath(path,method);requests.push({path,body,method});
  if(fail){const status=fail;fail=0;throw Object.assign(new Error("fixture unavailable"),{status});}
  const url=new URL(path,"http://fixture.invalid");
  if(method==="GET"){
   if(url.searchParams.has("operationId")){const value=receipts.get(url.searchParams.get("operationId")!);if(!value)throw Object.assign(new Error("not found"),{status:404});return {plan:structuredClone(value.plan)};}
   return {plans:[structuredClone(other),structuredClone(plan)]};
  }
  if(path==="/api/canvas/storyboards"){
   const prior=receipts.get(body.operationId);if(prior){assert.equal(prior.body,JSON.stringify(body));return {plan:structuredClone(prior.plan)};}
   assert.equal(body.expectedRevision,plan.revision);plan={...plan,revision:plan.revision+1,document:body.document};receipts.set(body.operationId,{body:JSON.stringify(body),plan:structuredClone(plan)});
   if(committedThenLost){committedThenLost=false;throw Object.assign(new Error("response lost"),{status:503});}return {plan:structuredClone(plan)};
  }
  if(path.endsWith("/inspect"))return {roughcuts:[{timelineId:"cut-b",revision:4}],quote:{newShots:1,reusedShots:2,generationCredits:6},shots:[],warnings:[]};
  return {node:{id:body.timelineId||`roughcut-${body.operationId}`,projectKey:project,revision:5},changes:[{nodeId:"c"}]};
 };
 const canvas={anchorId:"",imageUrls:[],ratio:"auto",resolution:"1K",quality:"medium",video:{projectKey:project}};
 const tools=createCanvasVideoTools({actor:"fixture@example.test",canvas,internal});
 const names=["list_video_storyboards","get_video_storyboard","save_video_storyboard","get_video_storyboard_operation","inspect_video_storyboard","apply_video_storyboard_roughcut"];
 const missing=names.filter(name=>!tools.some(tool=>tool.name===name));
 const workflow=tools.find(tool=>tool.name==="run_video_workflow")!;
 if(missing.length||!(workflow.parameters as any).properties.storyboard){console.log(`STORYBOARD_AGENT=FAIL MISSING=${missing.join(",")} WORKFLOW_STORYBOARD=${!!(workflow.parameters as any).properties.storyboard}`);process.exitCode=1;return;}
 let checks=0;const pass=(name:string)=>{checks++;console.log("STORYBOARD_AGENT_CHECK=PASS "+name);};
 const invoke=async(name:string,args:Record<string,unknown>)=>{const tool=tools.find(tool=>tool.name===name)!;validateToolArguments(tool.parameters,args);return (await tool.execute(randomUUID(),args)).details as any;};
 for(const name of names){assert.ok(CREATIVE_AGENT_TOOLS.video.includes(name));assert.equal(TOOL_ACCESS[name],"video");assert.equal(CANVAS_VIDEO_WRITE_TOOLS.has(name),["save_video_storyboard","apply_video_storyboard_roughcut"].includes(name));}pass("catalog_access_write_classification");
 assert.equal((await invoke(names[0],{})).plans.length,2);pass("list_persistent_plans_in_project");
 assert.equal((await invoke(names[1],{plan_id:planId})).plan.id,planId);pass("explicit_identity_not_first_plan_or_shared_node");
 await assert.rejects(()=>invoke(names[1],{plan_id:randomUUID()}));pass("missing_explicit_plan_rejected");
 let before=requests.length;const validArgs=[{}, {plan_id:planId}, {plan_id:planId,operation_id:operationId,expected_revision:1,document:plan.document}, {operation_id:operationId}, {plan_id:planId,revision:1,nodes:[{id:"a",reuseCompleted:true}]}, {plan_id:planId,operation_id:operationId,revision:1,mode:"create",node_ids:["a"]}];
 for(const [index,name] of names.entries()){await assert.rejects(()=>invoke(name,{...validArgs[index],project_key:"tree:foreign"}));await assert.rejects(()=>invoke(name,{...validArgs[index],unrecognized:true}));}assert.equal(requests.length,before);pass("cross_project_and_unknown_fields_no_transport");
 const inspection=await invoke(names[4],{plan_id:planId,revision:1,nodes:[{id:"a",reuseCompleted:true},{id:"b",reuseCompleted:true},{id:"c",reuseCompleted:false}]});assert.equal(inspection.quote.newShots,1);assert.equal(requests.at(-1)!.body.planId,planId);assert.equal(requests.at(-1)!.body.revision,1);pass("inspection_explicit_plan_revision_and_remake_selection");
 const doc=structuredClone(plan.document);doc.shots[2].takes.push({artworkId:"candidate-c",taskId:"remake-c",status:"changes",note:"保留其他镜头，延长停顿"});
 const write={plan_id:planId,expected_revision:1,operation_id:operationId,document:doc};
 const saved=await invoke(names[2],write);assert.equal(saved.plan.document.shots[2].adoptedArtworkId,"old-c");assert.equal(saved.plan.document.shots[2].takes.length,2);pass("new_candidate_review_does_not_adopt");
 const adopted=structuredClone(saved.plan.document);adopted.shots[2].adoptedArtworkId="candidate-c";adopted.shots[2].takes[1]={...adopted.shots[2].takes[1],status:"approved",note:"用户授权：采用延长停顿版"};
 await invoke(names[2],{...write,expected_revision:2,operation_id:randomUUID(),document:adopted});assert.equal(plan.document.shots[2].adoptedArtworkId,"candidate-c");assert.deepEqual(plan.document.shots.slice(0,2),doc.shots.slice(0,2));pass("explicit_adoption_changes_only_requested_shot");
 const receipt=await invoke(names[3],{operation_id:operationId});assert.equal(receipt.plan.revision,2);assert.equal(receipt.plan.document.shots[2].adoptedArtworkId,"old-c");pass("original_receipt_not_current_plan");
 const replay=await invoke(names[2],write);assert.deepEqual(replay.plan,saved.plan);assert.equal(plan.revision,3);pass("save_original_payload_replay_after_newer_revision");
 before=requests.length;for(const bad of [{...doc,shots:[doc.shots[0],doc.shots[0]]},{...doc,shots:[{...doc.shots[0],adoptedArtworkId:"foreign"}]},{...doc,shots:[{...doc.shots[0],injected:"x"}]}])await assert.rejects(()=>invoke(names[2],{...write,document:bad}));assert.equal(requests.length,before);pass("nested_schema_duplicate_and_foreign_adoption_rejected");
 const lost={...write,expected_revision:3,operation_id:randomUUID(),document:{...adopted,title:"已提交但断网"}};committedThenLost=true;await assert.rejects(()=>invoke(names[2],lost),new RegExp(lost.operation_id));assert.equal((await invoke(names[3],{operation_id:lost.operation_id})).plan.revision,4);assert.equal((await invoke(names[2],lost)).plan.revision,4);pass("lost_save_response_read_receipt_and_same_operation_replay");
 const cut={plan_id:planId,revision:4,operation_id:randomUUID(),mode:"create",node_ids:["a","b","c"]};
 const created=await invoke(names[5],cut);assert.equal(created.nodeId,`roughcut-${cut.operation_id}`);assert.equal(requests.at(-1)!.body.projectKey,project);pass("create_roughcut_maps_stable_operation_and_adopted_plan");
 const update={...cut,operation_id:randomUUID(),mode:"update",node_ids:["c"],timeline_id:"cut-b",timeline_revision:4};await invoke(names[5],update);assert.deepEqual(requests.at(-1)!.body.nodeIds,["c"]);assert.equal(requests.at(-1)!.body.timelineRevision,4);pass("update_explicit_roughcut_and_selected_shot_only");
 before=requests.length;await assert.rejects(()=>invoke(names[5],{...update,timeline_revision:undefined}));await assert.rejects(()=>invoke(names[5],{...cut,timeline_id:"cut-b"}));assert.equal(requests.length,before);pass("ambiguous_roughcut_target_rejected_before_transport");
 for(const status of [401,403,503]){fail=status;await assert.rejects(()=>invoke(names[5],update),new RegExp(update.operation_id));const original=requests.at(-1)!.body;await invoke(names[5],update);assert.deepEqual(requests.at(-1)!.body,original);}pass("roughcut_auth_unknown_preserve_original_payload");
 validateToolArguments(workflow.parameters,{operation_id:randomUUID(),storyboard:{id:planId,revision:4},nodes:[{id:"c",revision:1}]});assert.throws(()=>validateToolArguments(workflow.parameters,{operation_id:randomUUID(),storyboard:{id:planId,revision:0},nodes:[{id:"c",revision:1}]}));pass("workflow_schema_exposes_explicit_storyboard_identity");
 for(const api of ["inspect","roughcut"])assert.doesNotThrow(()=>assertInternalAgentPath(`/api/canvas/storyboards/${api}`,"POST"));for(const [api,method] of [["inspect","GET"],["roughcut","PATCH"],["delete","POST"],["../admin","POST"]])assert.throws(()=>assertInternalAgentPath(`/api/canvas/storyboards/${api}`,method));pass("only_specific_business_paths_allowed");
 const {agentVideoWorkflowIntent}=await import("../src/lib/agent/video-workflow-intent");const args={operation_id:randomUUID(),storyboard:{id:planId,revision:4},nodes:[{id:"a",revision:2,reuseCompleted:true},{id:"c",revision:3,reuseCompleted:false}]};assert.deepEqual(agentVideoWorkflowIntent(args,canvas).storyboard,args.storyboard);assert.throws(()=>agentVideoWorkflowIntent({...args,project_key:"tree:foreign"},canvas));assert.equal(agentVideoWorkflowIntent({operation_id:randomUUID(),project_key:project,nodes:[{id:"a",revision:1}]}).storyboard,undefined);pass("shared_billing_execution_intent_and_legacy_compatibility");
 assert.ok(requests.every(row=>!/(generate|video-workflows|media-jobs)/.test(row.path)));pass("planning_review_inspection_roughcut_never_generate_or_render");
 console.log(`STORYBOARD_AGENT=PASS CHECKS=${checks} PLAN=EXPLICIT ADOPT=EXPLICIT RECOVERY=ORIGINAL_OPERATION SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
