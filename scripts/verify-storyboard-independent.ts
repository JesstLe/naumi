import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createCanvasVideoTools} from "../src/lib/agent/canvas-video-tools";
import {validateToolArguments} from "../src/lib/agent/harness";
import {assertInternalAgentPath} from "../src/lib/agent/harness-network";
import {CREATIVE_AGENT_TOOLS} from "../src/lib/agent/creative-tool-catalog";
import {CANVAS_VIDEO_WRITE_TOOLS} from "../src/lib/agent/canvas-context";
import {TOOL_ACCESS} from "../src/lib/feature-access/catalog";

async function main(){
 let body:any,calls=0;const project="tree:fork-fixture",planId=randomUUID(),operationId=randomUUID();
 const tools=createCanvasVideoTools({actor:"fork@example.test",canvas:{anchorId:"",imageUrls:[],ratio:"auto",resolution:"1K",quality:"medium",video:{projectKey:project}},internal:async(p,_s,init)=>{calls++;assertInternalAgentPath(p,init?.method||"GET");body=JSON.parse(String(init?.body));return {plan:{id:operationId,revision:1},nodes:[{id:"fork-a",config:{workflowManifest:{template:{internal:"not-public"},kind:"comfyui"}}}],idMap:{a:"fork-a"}};}});
 const tool=tools.find(t=>t.name==="fork_video_storyboard");if(!tool){console.log("STORYBOARD_INDEPENDENT=FAIL TOOL_MISSING=fork_video_storyboard");process.exitCode=1;return;}
 const {storyboardForkSchema,independentStoryboardDocument}=await import("../src/lib/storyboard/fork");let checks=0;const pass=()=>checks++;
 assert.equal(TOOL_ACCESS[tool.name],"video");assert.ok(CREATIVE_AGENT_TOOLS.video.includes(tool.name));assert.ok(CANVAS_VIDEO_WRITE_TOOLS.has(tool.name));pass();
 const args={plan_id:planId,revision:3,operation_id:operationId,title:"独立版",nodes:[{id:"a",revision:4}]};validateToolArguments(tool.parameters,args);
 const result=await tool.execute("fork-test",args);assert.deepEqual(body,{projectKey:project,planId,revision:3,operationId,title:"独立版",nodes:[{id:"a",revision:4}]});assert.ok(!JSON.stringify(result).includes('"template"'));pass();
 await assert.rejects(()=>tool.execute("fork-other",{...args,project_key:"tree:other"}));assert.equal(calls,1);pass();
 const input={projectKey:project,planId,revision:3,operationId,title:"独立版",nodes:[{id:"a",revision:4}]};assert.deepEqual(storyboardForkSchema.parse(input),input);pass();
 for(const bad of [{...input,nodes:[]},{...input,nodes:[...input.nodes,...input.nodes]},{...input,revision:0},{...input,title:" "},{...input,sourceNodeId:"injected"}]){assert.throws(()=>storyboardForkSchema.parse(bad));pass();}
 const doc={title:"原版",assemble:true,shots:[{nodeId:"a",number:"03",scene:"车站",purpose:"停顿",takes:[{artworkId:"old",taskId:"old-task",status:"approved" as const,note:"采用旧版"}],adoptedArtworkId:"old"}],audio:[{id:"music",artworkId:"music",position:0,inPoint:0,duration:4,gain:.5}]};
 const copy=independentStoryboardDocument(doc,{a:"fork-a"},"独立版");assert.equal(copy.shots[0].nodeId,"fork-a");assert.equal(copy.shots[0].adoptedArtworkId,"old");assert.deepEqual(copy.audio,doc.audio);copy.shots[0].takes[0].note="新版意见";assert.equal(doc.shots[0].takes[0].note,"采用旧版");pass();
 assert.throws(()=>independentStoryboardDocument(doc,{},"缺映射"));pass();
 assert.doesNotThrow(()=>assertInternalAgentPath("/api/canvas/storyboards/fork","POST"));for(const method of ["GET","PATCH","DELETE"])assert.throws(()=>assertInternalAgentPath("/api/canvas/storyboards/fork",method));pass();
 console.log(`STORYBOARD_INDEPENDENT=PASS CHECKS=${checks} EXPLICIT_FORK=1 SNAPSHOT=DEEP_COPY INHERITED_TAKES=UNCHANGED NETWORK=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
