import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {randomUUID} from "node:crypto";
async function main(){
 if(!existsSync("src/lib/storyboard/assisted-review.ts")){console.log("STORYBOARD_ASSISTED=FAIL ASSISTED_REVIEW_MISSING");process.exitCode=1;return;}
 const {reviewFramesSchema,reviewFrameRecipe,assistedModelResultSchema,parseAssistedResult,assistedFindingRange,reviewSource}=await import("../src/lib/storyboard/assisted-review");
 const {storyboardTakeSchema,reviewStoryboardTake}=await import("../src/lib/storyboard/plan");let checks=0;const pass=()=>checks++;
 const source={projectKey:"tree:review",planId:randomUUID(),revision:2,nodeId:"node",taskId:"task",artworkId:"art"},request={...source,operationId:randomUUID(),samples:[0,1.2,3.8]};
 assert.deepEqual(reviewSource(request),source);assert.deepEqual(reviewFramesSchema.parse(request),request);pass();
 for(const samples of [[],[-1],[NaN],[1,1],[2,1],[0,1,2,3,4,5]]){assert.throws(()=>reviewFramesSchema.parse({...request,samples}));pass();}
 const recipe=reviewFrameRecipe(request);assert.equal(recipe.action,"ffmpeg");assert.deepEqual(recipe.outputs,["review-0.png","review-1.png","review-2.png"]);assert.deepEqual(recipe.inputs,["art"]);assert.equal(recipe.args?.filter(value=>value==="-ss").length,3);pass();
 const result={summary:"抽样观察",findings:[{frameIndexes:[1],issue:"visual",observation:"手中物体呈红色",uncertainty:"没有角色参考图，身份未核实",suggestion:"人工核对手机颜色"}],limitations:["仅3张静帧；声音、完整动作未检查"]};
 assert.deepEqual(parseAssistedResult('```json\n'+JSON.stringify(result)+'\n```',request.samples),result);pass();
 for(const invalid of [{...result,passed:true},{...result,score:100},{...result,limitations:[]},{...result,findings:[{...result.findings[0],uncertainty:""}]},{...result,findings:[{...result.findings[0],issue:"dialogue"}]},{...result,findings:[{...result.findings[0],frameIndexes:[3]}]},{...result,findings:[{...result.findings[0],frameIndexes:[1,1]}]}]){assert.throws(()=>parseAssistedResult(JSON.stringify(invalid),request.samples));pass();}
 assert.ok(assistedModelResultSchema.safeParse({...result,findings:[]}).success);pass();
 const report:any={frames:request.samples.map((timestamp,index)=>({timestamp,index})),result};assert.deepEqual(assistedFindingRange(report,0),{start:1.2});report.result=structuredClone(result);report.result.findings[0].frameIndexes=[0,2];assert.deepEqual(assistedFindingRange(report,0),{start:0,end:3.8});pass();
 const take={artworkId:"art",taskId:"task",status:"approved" as const,note:"人工采用",assistedReviews:[{operationId:request.operationId,source}]},shot={nodeId:"node",number:"01",scene:"",purpose:"",adoptedArtworkId:"art",takes:[take]};assert.deepEqual(storyboardTakeSchema.parse(take),take);assert.throws(()=>storyboardTakeSchema.parse({...take,assistedReviews:[take.assistedReviews[0],take.assistedReviews[0]]}));assert.deepEqual(reviewStoryboardTake(shot,{artworkId:"art",taskId:"task",status:"pending",note:""}).takes[0].assistedReviews,take.assistedReviews);assert.equal(reviewStoryboardTake(shot,take).adoptedArtworkId,"art");pass();
 const {createCanvasVideoTools}=await import("../src/lib/agent/canvas-video-tools"),{validateToolArguments}=await import("../src/lib/agent/harness"),{assertInternalAgentPath}=await import("../src/lib/agent/harness-network");let saved:any;
 const tools=createCanvasVideoTools({actor:"fixture@example.test",internal:async(path,_signal,init)=>{assertInternalAgentPath(path,init?.method||"GET");saved=init?.body?JSON.parse(String(init.body)):path;return {job:{id:randomUUID()}};}});
 const args={project_key:source.projectKey,plan_id:source.planId,revision:2,node_id:"node",task_id:"task",artwork_id:"art",operation_id:request.operationId,samples:request.samples};
 for(const name of ["prepare_video_review_frames","review_video_storyboard_take","get_video_review_receipt"]){const tool=tools.find(tool=>tool.name===name)!;assert.ok(tool);const input=name==="review_video_storyboard_take"?{...args,frame_job_id:randomUUID()}:name==="get_video_review_receipt"?Object.fromEntries(Object.entries(args).filter(([k])=>k!=="samples")):args;validateToolArguments(tool.parameters,input);await tool.execute("fixture",input);assert.ok(saved);pass();}
 console.log(`STORYBOARD_ASSISTED=PASS CHECKS=${checks} EXACT_FRAMES=1 UNCERTAINTY=1 QUALITY_PASS_FIELD=0 AUDIO_CHECKED=0 AUTO_MUTATION=0 NETWORK=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
