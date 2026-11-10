import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {randomUUID} from "node:crypto";

async function main(){
 if(!existsSync("src/lib/storyboard/review.ts")){console.log("STORYBOARD_REVIEW=FAIL TIME_CODED_REVIEW_MISSING");process.exitCode=1;return;}
 const {reviewAnnotationSchema,reviewRemakeSchema,freezeReviewOrigin,assertReviewBounds,reviewRemakePrompt}=await import("../src/lib/storyboard/review");
 const {storyboardTakeSchema,reviewStoryboardTake,storyboardDocumentSchema}=await import("../src/lib/storyboard/plan");
 let checks=0;const pass=()=>checks++;
 const annotation={id:randomUUID(),start:1.2,end:1.8,issue:"continuity" as const,note:"视线方向错误"};assert.deepEqual(reviewAnnotationSchema.parse(annotation),annotation);pass();
 for(const invalid of [{...annotation,start:-1},{...annotation,start:NaN},{...annotation,end:1.2},{...annotation,end:Infinity},{...annotation,note:" "},{...annotation,issue:"ai_pass"},{...annotation,taskId:"injection"}]){assert.throws(()=>reviewAnnotationSchema.parse(invalid));pass();}
 assert.doesNotThrow(()=>reviewAnnotationSchema.parse({...annotation,end:undefined}));assert.doesNotThrow(()=>assertReviewBounds([annotation],2));pass();
 for(const duration of [null,0,1.7]){assert.throws(()=>assertReviewBounds([annotation],duration));pass();}assert.throws(()=>assertReviewBounds([{...annotation,start:2,end:undefined}],2));pass();
 const take={artworkId:"art",taskId:"task",status:"approved" as const,note:"保留",annotations:[annotation]};assert.throws(()=>storyboardTakeSchema.parse({...take,annotations:[annotation,annotation]}));pass();
 const shot={nodeId:"node",number:"02",scene:"",purpose:"",takes:[take],adoptedArtworkId:"art"};const changed=reviewStoryboardTake(shot,{artworkId:"art",taskId:"task",status:"changes",note:"待改"});assert.equal(changed.adoptedArtworkId,"art");assert.deepEqual(changed.takes[0].annotations,[annotation]);pass();
 const context={id:randomUUID(),revision:2,review:{nodeId:"node",taskId:"task",artworkId:"art",annotationIds:[annotation.id],instructions:"只调整1.2至1.8秒的视线，保留对白与节奏"}};
 const frozen=freezeReviewOrigin(context,[shot])!;assert.deepEqual(frozen.annotations,[annotation]);frozen.annotations[0].note="changed";assert.equal(annotation.note,"视线方向错误");pass();
 assert.ok(reviewRemakePrompt("原始描述",freezeReviewOrigin(context,[shot])!).includes("视线方向错误"));pass();
 for(const review of [{...context.review,taskId:"foreign"},{...context.review,artworkId:"foreign"},{...context.review,annotationIds:[randomUUID()]},{...context.review,nodeId:"foreign"}]){assert.throws(()=>freezeReviewOrigin({...context,review},[shot]));pass();}
 assert.throws(()=>reviewRemakeSchema.parse({...context.review,annotationIds:[annotation.id,annotation.id]}));pass();
 const {canvasWorkflowSchema}=await import("../src/lib/video/canvas-workflow");const {agentVideoWorkflowIntent}=await import("../src/lib/agent/video-workflow-intent");
 const intent={id:randomUUID(),projectKey:"tree:review",storyboard:context,nodes:[{id:"node",revision:2,reuseCompleted:false}]};assert.deepEqual(canvasWorkflowSchema.parse(intent),intent);assert.deepEqual(agentVideoWorkflowIntent({operation_id:intent.id,project_key:intent.projectKey,storyboard:context,nodes:intent.nodes}),intent);pass();
 assert.throws(()=>canvasWorkflowSchema.parse({...intent,reviewOrigin:frozen}));pass();
 const {createCanvasVideoTools}=await import("../src/lib/agent/canvas-video-tools");const {validateToolArguments}=await import("../src/lib/agent/harness");let saved:any;
 const tools=createCanvasVideoTools({actor:"review@example.test",internal:async(_path,_signal,init)=>{saved=JSON.parse(String(init?.body));return {plan:{id:context.id}};}}),save=tools.find(tool=>tool.name==="save_video_storyboard")!,run=tools.find(tool=>tool.name==="run_video_workflow")!;
 const args={plan_id:context.id,project_key:intent.projectKey,expected_revision:2,operation_id:randomUUID(),document:storyboardDocumentSchema.parse({title:"审片",assemble:false,shots:[shot]})};validateToolArguments(save.parameters,args);await save.execute("save-review",args);assert.deepEqual(saved.document.shots[0].takes[0].annotations,[annotation]);pass();
 validateToolArguments(run.parameters,{operation_id:intent.id,project_key:intent.projectKey,storyboard:context,nodes:intent.nodes});pass();
 console.log(`STORYBOARD_REVIEW=PASS CHECKS=${checks} EXACT_TAKE=PASS RANGE=PASS FROZEN_ORIGIN=PASS ADOPTION=UNCHANGED NETWORK=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
