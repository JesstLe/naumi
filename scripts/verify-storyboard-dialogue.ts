import assert from "node:assert/strict";
import {existsSync,mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {randomUUID,createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import path from "node:path";

async function main(){
 if(!existsSync("src/lib/timeline/dialogue.ts")){console.log("STORYBOARD_DIALOGUE=FAIL DIALOGUE_SUBTITLES_MISSING");process.exitCode=1;return;}
 const {newTimelineDialogue,withDialogueAudio,updateDialogueLine,dialogueSrt,dialogueAss,subtitleLayout,subtitlePlacements,removeDialogueLine}=await import("../src/lib/timeline/dialogue");
 const {newTimelineProject,planTimeline,timelineProjectSchema,sampleTimeline}=await import("../src/lib/timeline/project");
 const {appendStoryboardDialogue}=await import("../src/lib/storyboard/dialogue");const {timelineMediaRequest}=await import("../src/lib/timeline/render");
 let checks=0;const pass=()=>checks++;
 const project=newTimelineProject();project.width=640;project.height=360;project.tracks[0].clips=[0,1].map(i=>({id:`v${i}`,artworkId:`video${i}`,canvasSourceId:`node${i}`,position:i*2,inPoint:0,duration:2,gain:1,fadeIn:0,fadeOut:0,audioEnabled:false,transitionIn:0}));
 project.tracks[1].clips=[{id:"music",artworkId:"music",position:0,inPoint:0,duration:4,gain:.1,fadeIn:.2,fadeOut:.2,audioEnabled:true,transitionIn:0}];
 const text="爸爸，我到了。\nI am here.",digest=createHash("sha256").update(text).digest("hex"),source={nodeId:"script",sha256:digest,mapping:{ranges:[{start:0,end:text.length}],dialogue:[{start:0,end:7,speaker:"女孩"}]}};
 const doc={title:"声音字幕",assemble:true,shots:[0,1].map(i=>({nodeId:`node${i}`,number:String(i+1),scene:"",purpose:"",takes:[],adoptedArtworkId:null,...(i===0?{source}:{})}))};
 const loaded=appendStoryboardDialogue(project,doc,new Map([["script",text]]),()=>"line0");assert.equal(loaded.dialogue!.lines.length,1);assert.equal(loaded.dialogue!.lines[0].source!.text,text.slice(0,7));assert.equal(loaded.dialogue!.lines[0].timing,"draft");assert.deepEqual(loaded.tracks,project.tracks);pass();
 const again=appendStoryboardDialogue(loaded,doc,new Map([["script",text]]),()=>"duplicate");assert.deepEqual(again,loaded);pass();
 loaded.dialogue!.lines[0]={...loaded.dialogue!.lines[0],position:.5,duration:3,timing:"confirmed"};const sources=[{artworkId:"video0",kind:"video" as const,durationSeconds:2,hasAudio:false},{artworkId:"video1",kind:"video" as const,durationSeconds:2,hasAudio:false},{artworkId:"music",kind:"audio" as const,durationSeconds:4,hasAudio:true},{artworkId:"voice",kind:"audio" as const,durationSeconds:4,hasAudio:true}];
 const bound=withDialogueAudio(loaded,"line0",sources[3],"dialogue-audio:line0");assert.equal(bound.tracks.flatMap(track=>track.clips).filter(clip=>clip.artworkId==="voice").length,1);assert.deepEqual(bound.tracks.slice(0,2),project.tracks);const plan=planTimeline(bound,sources);assert.equal(sampleTimeline(plan,2.2).audio.filter(clip=>clip.id==="dialogue-audio:line0").length,1);pass();
 const edited=updateDialogueLine(bound,"line0",{text:"爸爸，我已经到了。",subtitleText:"我到了"});assert.equal(edited.dialogue!.lines[0].source!.text,text.slice(0,7));assert.notEqual(edited.dialogue!.lines[0].audioText,edited.dialogue!.lines[0].text);assert.deepEqual(edited.tracks,bound.tracks);pass();
 for(const bad of [{...sources[3],hasAudio:false},{...sources[3],durationSeconds:1}]){assert.throws(()=>withDialogueAudio(loaded,"line0",bad,"new"));pass();}
 const copy=structuredClone(bound);copy.dialogue!.lines.push({...copy.dialogue!.lines[0],id:"duplicate",audioClipId:undefined});assert.throws(()=>planTimeline(copy,sources));pass();
 const missing=structuredClone(bound);missing.dialogue!.lines[0].audioClipId="missing";assert.throws(()=>planTimeline(missing,sources));pass();
 const srt=dialogueSrt(bound.dialogue);assert.ok(srt.includes("00:00:00,500 --> 00:00:03,500"));assert.ok(srt.includes(text.slice(0,7)));pass();
 assert.ok(dialogueAss(bound).includes("Dialogue: 0,0:00:00.50,0:00:03.50"));const layout=subtitleLayout("中文 subtitle",640,360,bound.dialogue!.style);assert.ok(layout.y>=layout.marginY&&layout.y+layout.lines.length*layout.lineHeight<=360-layout.marginY+.01);pass();
 const removed=removeDialogueLine(bound,"line0");assert.deepEqual(removed.tracks.slice(0,2),bound.tracks.slice(0,2));assert.equal(removed.tracks.flatMap(track=>track.clips).some(clip=>clip.id==="dialogue-audio:line0"),false);pass();
 const overlap=structuredClone(bound);overlap.dialogue!.lines.push({...overlap.dialogue!.lines[0],id:"speaker2",text:"I am here.",subtitleText:"I am here.",position:1,source:undefined,audioClipId:undefined,audioText:undefined});const placements=subtitlePlacements(overlap);assert.notEqual(placements.get("line0")!.y,placements.get("speaker2")!.y);pass();
 assert.throws(()=>subtitleLayout("很长的字幕".repeat(1000),640,360,bound.dialogue!.style));pass();
 const literal=structuredClone(bound);literal.dialogue!.lines[0].subtitleText="{\\pos(0,0)} https://example.test asset:0";assert.ok(dialogueSrt(literal.dialogue).includes("{\\pos(0,0)} https://example.test asset:0"));assert.ok(dialogueAss(literal).includes("｛＼pos(0,0)｝"));pass();
 const parsed=timelineProjectSchema.parse(bound);assert.deepEqual(parsed,bound);const request=timelineMediaRequest(bound,sources,randomUUID(),"tree:dialogue").request;assert.equal(request.auxiliaryOutputs[0].name,"timeline.srt");assert.equal(Buffer.from(request.auxiliaryFiles[0].content,"base64").toString("utf8"),srt);assert.ok(request.args!.join(" ").includes("ass=filename='aux:1'"));pass();
 const soft=structuredClone(bound);soft.dialogue!.burnIn=false;const softRequest=timelineMediaRequest(soft,sources,randomUUID(),"tree:dialogue").request;assert.equal(softRequest.auxiliaryFiles.length,1);assert.equal(softRequest.auxiliaryOutputs.length,1);assert.ok(!softRequest.args!.join(" ").includes("ass=filename"));pass();
 const {createCanvasVideoTools}=await import("../src/lib/agent/canvas-video-tools");const {validateToolArguments}=await import("../src/lib/agent/harness");const tools=createCanvasVideoTools({actor:"dialogue@example.test",internal:async()=>({})});for(const name of ["get_video_timeline","save_video_timeline","render_video_timeline","adopt_video_timeline","apply_video_storyboard_dialogue"]){assert.ok(tools.some(tool=>tool.name===name));pass();}
 validateToolArguments(tools.find(tool=>tool.name==="save_video_timeline")!.parameters,{project_key:"tree:dialogue",timeline_id:"cut",expected_revision:0,operation_id:randomUUID(),timeline:bound});pass();
 const {assertInternalAgentPath}=await import("../src/lib/agent/harness-network");for(const [url,method]of [["/api/canvas/timeline-nodes/cut","GET"],["/api/canvas/timeline-nodes","POST"],["/api/canvas/timeline-nodes/cut/render","POST"],["/api/canvas/storyboards/dialogue","POST"]]){assert.doesNotThrow(()=>assertInternalAgentPath(url,method));pass();}
 assert.throws(()=>assertInternalAgentPath("/api/canvas/timeline-nodes/cut/render","GET"));pass();
 if(process.argv[2]){
  const out=path.resolve(process.argv[2]);mkdirSync(out,{recursive:true});const run=(args:string[])=>{const r=spawnSync("ffmpeg",["-nostdin","-y","-v","error",...args],{encoding:"utf8",windowsHide:true});assert.equal(r.status,0,r.stderr);};
  for(let i=0;i<2;i++)run(["-f","lavfi","-i",`color=c=${i?"blue":"red"}:s=640x360:d=2`,"-c:v","libx264","-pix_fmt","yuv420p",path.join(out,`video${i}.mp4`)]);
  run(["-f","lavfi","-i","sine=frequency=440:duration=4","-c:a","pcm_s16le",path.join(out,"music.wav")]);run(["-f","lavfi","-i","sine=frequency=880:duration=4","-c:a","pcm_s16le",path.join(out,"voice.wav")]);
  const aux=request.auxiliaryFiles.map((file,i)=>{const p=path.join(out,`aux${i}-${file.name}`);writeFileSync(p,Buffer.from(file.content,"base64"));return p;});const inputs=plan.sources.map(source=>path.join(out,source.artworkId+(source.kind==="video"?".mp4":".wav"))),outputs=[path.join(out,"burned.mp4")];
  const {nativeMediaArgs}=await import("../src/modules/media/contract.mjs");const args=nativeMediaArgs(request.args!,inputs,outputs,"ffmpeg",aux);const r=spawnSync("ffmpeg",args,{encoding:"utf8",windowsHide:true});writeFileSync(path.join(out,"ffmpeg.txt"),r.stderr||"");assert.equal(r.status,0,r.stderr);assert.ok(readFileSync(outputs[0]).length>0);pass();
 }
 console.log(`STORYBOARD_DIALOGUE=PASS CHECKS=${checks} ORIGINAL=RETAINED VOICE=CROSS_CUT_ONCE SUBTITLES=SRT_AND_ASS NETWORK=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
