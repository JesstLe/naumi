import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {randomUUID,createHash} from "node:crypto";
async function main(){
 if(!existsSync("src/lib/audio/dialogue-adoption.ts")||!existsSync("src/lib/audio/operation-service.ts")){console.log("AUDIO_OPERATIONS=FAIL PERSISTENT_AUDIO_MISSING");process.exitCode=1;return;}
 const {applyDialogueAudioResult,audioAdoptionSchema}=await import("../src/lib/audio/dialogue-adoption"),{audioReceiptSchema,speechOperationSchema,transcriptionOperationSchema}=await import("../src/lib/audio/operation-schema"),{newTimelineProject}=await import("../src/lib/timeline/project"),{newTimelineDialogue}=await import("../src/lib/timeline/dialogue");
 const {createCanvasVideoTools}=await import("../src/lib/agent/canvas-video-tools"),{assertInternalAgentPath}=await import("../src/lib/agent/harness-network"),{validateToolArguments}=await import("../src/lib/agent/harness");
 let checks=0;const pass=()=>checks++;
 const project=newTimelineProject();project.tracks[0].clips=[{id:"v",artworkId:"video",position:0,inPoint:0,duration:4,gain:1,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0}];project.dialogue={...newTimelineDialogue(),lines:[{id:"a",speaker:"女孩",text:"爸爸，我到了。",subtitleText:"旧字幕",position:0.5,duration:1,subtitleEnabled:true,timing:"confirmed"},{id:"b",speaker:"父亲",text:"I am here.",subtitleText:"I am here.",position:3,duration:1,subtitleEnabled:true,timing:"draft"}]};
 const line=structuredClone(project.dialogue.lines[0]),target={projectKey:"tree:rain",timelineId:"timeline",revision:1,lineId:"a",textSha256:createHash("sha256").update(line.text).digest("hex")},operationId=randomUUID();
 const receipt=audioReceiptSchema.parse({version:1,operationId,target,modelId:"audio-public",modelVersion:3,billingVersion:2,createdAt:"2026-11-10T00:00:00.000Z",kind:"speech",artworkId:"voice",key:"audio-results/voice.wav",sha256:"a".repeat(64),mimeType:"audio/wav",durationSeconds:2,textSha256:target.textSha256,voice:"explicit-voice"});
 if(receipt.kind!=="speech")throw new Error("Expected speech fixture");
 const material={artworkId:"voice",kind:"audio" as const,hasAudio:true,durationSeconds:2},input=audioAdoptionSchema.parse({projectKey:target.projectKey,timelineId:target.timelineId,lineId:line.id,expectedRevision:2,operationId:randomUUID(),audioOperationId:operationId,timing:"fit-audio"});
 const fit=applyDialogueAudioResult(project,input,line,receipt,material);assert.deepEqual(fit.tracks[0],project.tracks[0]);assert.deepEqual(fit.dialogue!.lines[1],project.dialogue.lines[1]);assert.equal(fit.dialogue!.lines[0].text,line.text);assert.equal(fit.dialogue!.lines[0].subtitleText,"旧字幕");assert.equal(fit.dialogue!.lines[0].duration,2);assert.equal(fit.dialogue!.lines[0].timing,"draft");assert.equal(fit.tracks.flatMap(t=>t.clips).filter(c=>c.artworkId==="voice").length,1);pass();
 const keep=applyDialogueAudioResult(project,{...input,timing:"keep"},line,receipt,material);assert.equal(keep.dialogue!.lines[0].duration,1);assert.equal(keep.dialogue!.lines[0].timing,"confirmed");pass();
 const replacement=applyDialogueAudioResult(fit,input,line,receipt,material);assert.equal(replacement.tracks.flatMap(t=>t.clips).filter(c=>c.id==="dialogue-audio:a").length,1);pass();
 for(const patch of [{text:"新台词"},{speaker:"另一说话人"},{source:{nodeId:"new-original",sha256:"0".repeat(64),start:0,end:1,text:"新"}}]){const altered=structuredClone(project);Object.assign(altered.dialogue!.lines[0],patch);assert.throws(()=>applyDialogueAudioResult(altered,input,line,receipt,material));pass();}
 assert.throws(()=>applyDialogueAudioResult(project,input,line,{...receipt,target:{...target,lineId:"b"}},material));pass();
 assert.throws(()=>applyDialogueAudioResult(project,input,line,receipt,{...material,artworkId:"foreign"}));pass();
 assert.throws(()=>applyDialogueAudioResult(project,{...input,timing:"source-segment"},line,receipt,material));pass();
 const {artworkId:_a,mimeType:_m,durationSeconds:_d,textSha256:_t,voice:_v,...baseReceipt}=receipt;
 const asr=audioReceiptSchema.parse({...baseReceipt,kind:"transcribe",sourceArtworkId:"voice",sourceSha256:"a".repeat(64),timing:"supplier-timestamps"});
 const transcript={text:"识别候选，与原稿不同。",segments:[{start:0.2,end:1.4,text:"识别候选"}]};
 const subtitle=applyDialogueAudioResult(fit,{...input,timing:"keep"},line,asr,undefined,transcript);assert.equal(subtitle.dialogue!.lines[0].text,line.text);assert.equal(subtitle.dialogue!.lines[0].subtitleText,transcript.text);assert.deepEqual(subtitle.tracks,fit.tracks);assert.equal(subtitle.dialogue!.lines[0].duration,2);pass();
 const timed=applyDialogueAudioResult(fit,{...input,timing:"source-segment",segmentIndex:0},line,asr,undefined,transcript);assert.equal(timed.dialogue!.lines[0].position,0.7);assert.ok(Math.abs(timed.dialogue!.lines[0].duration-1.2)<1e-6);assert.equal(timed.dialogue!.lines[0].timing,"draft");assert.deepEqual(timed.tracks,fit.tracks);pass();
 for(const segments of [[{start:0,end:4,text:"超出声音"}],[{start:1,end:1,text:"空时间"}],[]]){assert.throws(()=>applyDialogueAudioResult(fit,{...input,timing:"source-segment",segmentIndex:0},line,asr,undefined,{text:"候选",segments}));pass();}
 assert.throws(()=>applyDialogueAudioResult(fit,{...input,timing:"keep"},line,asr,undefined,{text:"x".repeat(4001)}));pass();
 const request=speechOperationSchema.parse({operationId,target,modelId:"audio-public",voice:"explicit-voice",format:"wav"});assert.throws(()=>speechOperationSchema.parse({...request,voiceSample:"/media/clone.wav"}));pass();
 const transcription=transcriptionOperationSchema.parse({operationId:randomUUID(),target,modelId:"audio-public",artworkId:"voice",sourceSha256:"a".repeat(64),format:"verbose_json",timestamps:["segment"]});assert.throws(()=>transcriptionOperationSchema.parse({...transcription,url:"https://foreign.invalid/audio"}));pass();
 let calls=0;const tools=createCanvasVideoTools({actor:"actor@example.test",internal:async(path,_signal,init)=>{assertInternalAgentPath(path,init?.method||"GET");calls++;return init?.body?{audioReceipt:{operationId:JSON.parse(String(init.body)).operationId}}:{models:[]};}});
 for(const [name,args]of [["generate_dialogue_speech",{request}],["transcribe_dialogue_audio",{request:transcription}],["get_dialogue_audio_operation",{project_key:target.projectKey,operation_id:operationId}],["recover_dialogue_audio_operation",{project_key:target.projectKey,operation_id:operationId}],["adopt_dialogue_audio_operation",{request:input}],["list_dialogue_audio_models",{}]] as const){const tool=tools.find(t=>t.name===name)!;assert.ok(tool);validateToolArguments(tool.parameters,args);await tool.execute("call",args);pass();}
 assert.equal(calls,6);assert.throws(()=>assertInternalAgentPath("/api/canvas/audio-operations/secret","POST"));pass();
 console.log(`AUDIO_OPERATIONS=PASS CHECKS=${checks} ORIGINAL_SCRIPT=RETAINED OTHER_CLIPS=UNCHANGED NETWORK=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
