import assert from "node:assert/strict";
import {existsSync} from "node:fs";
async function main(){
 if(!existsSync("src/lib/storyboard/costs.ts")){console.log("STORYBOARD_COSTS=FAIL COST_PROJECTION_MISSING");process.exitCode=1;return;}
 const {summarizeCosts,storyboardCostImpact,storyboardCostRequestSchema}=await import("../src/lib/storyboard/costs");
 const {videoWorkflowPlanSchema}=await import("../src/lib/video/workflow-schema");
 const {createCanvasVideoTools}=await import("../src/lib/agent/canvas-video-tools");
 const {describeNaumiTools}=await import("../src/lib/agent/naumi-tools");
 const {assertInternalAgentPath}=await import("../src/lib/agent/harness-network");
 let n=0;const pass=()=>n++;
 const bill={id:"a",state:"settled",reservedCredits:0,chargedCredits:6,debitedCredits:9,refundedCredits:3,releasedCredits:1,quotedCredits:10,authorizedCredits:10,upperBound:false,billingVersion:1,ledgerId:"led-a",consistent:true,basis:"operation" as const};
 const item={id:"a",kind:"video" as const,status:"completed",attribution:"plan" as const,nodeIds:["A"],runIds:[],timelineIds:[],billing:bill,externalCostUnknown:false,remake:false};
 assert.equal(summarizeCosts([item,item]).chargedCredits,6);assert.equal(summarizeCosts([item,item]).taskCount,1);pass();
 assert.equal(summarizeCosts([item]).refundedCredits,3);assert.equal(summarizeCosts([item]).pendingCount,0);pass();
 const held={...item,status:"processing",billing:{...bill,state:"reserved",chargedCredits:null,reservedCredits:10,debitedCredits:0,refundedCredits:0}};
 assert.equal(summarizeCosts([held]).chargedCredits,0);assert.equal(summarizeCosts([held]).reservedCredits,10);assert.equal(summarizeCosts([held]).pendingCount,1);assert.equal(summarizeCosts([held]).unknownCount,0);pass();
 assert.equal(summarizeCosts([{...held,billing:{...held.billing,state:"hold"}}]).unknownCount,1);pass();
 assert.equal(summarizeCosts([{...item,billing:{...bill,consistent:false,chargedCredits:null}}]).unknownCount,1);pass();
 assert.equal(summarizeCosts([{...item,billing:{...bill,state:null,consistent:false,chargedCredits:null,basis:"missing"}}]).pendingCount,0);pass();
 assert.equal(summarizeCosts([{...item,externalCostUnknown:true}]).externalUnknownCount,1);pass();
 assert.equal(summarizeCosts([{...item,status:"failed",billing:{...bill,state:"released",chargedCredits:0,debitedCredits:0,refundedCredits:0}}]).failedTaskCount,1);pass();
 const shot=(id:string)=>({nodeId:id,number:id,scene:"",purpose:"",takes:[],adoptedArtworkId:null});
 const doc={title:"cost test",assemble:true,shots:[shot("B"),shot("C"),shot("A")]};
 const nodes=[{id:"A",contentDigest:"a",dependencies:[]},{id:"B",contentDigest:"b",dependencies:["A"]},{id:"C",contentDigest:"c",dependencies:[]}];
 let impact=storyboardCostImpact(doc,[{id:"A",reuseCompleted:false},{id:"B",reuseCompleted:true}],nodes);
 assert.equal(impact.shots.find(s=>s.nodeId==="B")!.generationAffected,true);assert.equal(impact.shots.find(s=>s.nodeId==="B")!.execution,"reuse");assert.equal(impact.shots.find(s=>s.nodeId==="C")!.generationAffected,false);assert.deepEqual(doc.shots.map(s=>s.nodeId),["B","C","A"]);pass();
 impact=storyboardCostImpact(doc,[],nodes,{digests:{A:"old",B:"b",C:"c"},document:doc});assert.equal(impact.shots.find(s=>s.nodeId==="B")!.reasons.includes("depends-on-changed"),true);pass();
 impact=storyboardCostImpact({...doc,shots:[...doc.shots].reverse()},[],nodes,{document:doc});assert.equal(impact.structureChanged,true);assert.ok(impact.shots.every(s=>!s.generationAffected));pass();
 const adopted=structuredClone(doc) as any;adopted.shots.find((s:any)=>s.nodeId==="A").adoptedArtworkId="new-take";
 impact=storyboardCostImpact(adopted,[],nodes,{document:doc});assert.ok(impact.shots.find(s=>s.nodeId==="B")!.generationAffected);assert.ok(impact.shots.find(s=>s.nodeId==="A")!.editorialAffected);pass();
 const cut=structuredClone(doc) as any;cut.shots[0].cut={duration:2,inPoint:0};impact=storyboardCostImpact(cut,[],nodes,{document:doc});assert.ok(impact.shots[0].editorialAffected);assert.ok(!impact.shots.some(s=>s.generationAffected));pass();
 assert.equal(storyboardCostRequestSchema.safeParse({}).success,false);pass();
 const tool=createCanvasVideoTools({actor:"test@example.test",internal:async()=>({})}).find(t=>t.name==="inspect_video_storyboard_costs")!;assert.ok(tool);assert.equal(describeNaumiTools([tool])[0].write,false);pass();
 assert.doesNotThrow(()=>assertInternalAgentPath("/api/canvas/storyboards/costs","POST"));assert.throws(()=>assertInternalAgentPath("/api/canvas/storyboards/costs/settle","POST"));pass();
 assert.ok(videoWorkflowPlanSchema.shape.storyboard);pass();
 console.log(`STORYBOARD_COSTS=PASS checks=${n}`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
