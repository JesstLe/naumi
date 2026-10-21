import assert from "node:assert/strict";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {readFile} from "node:fs/promises";

async function main(){
 const baseline=process.argv.includes("--baseline"),root=resolve(process.env.AGENT_GATE_ROOT||".");
 const {AgentHarness,HARNESS_LIMITS}=await import(pathToFileURL(resolve(root,"src/lib/agent/harness.ts")).href);
 const schema={type:"object",properties:{prompt:{type:"string"}},required:["prompt"]};
 const phrases=["去掉其中的杂质，使画面干净通透，分子少一点","在产品的底部和周围加入牛奶的元素"];
 let checks=0,executions=0;
 const toolNames=["generate_image","retouch_product","recolor_product","generate_video","plan_video_script","run_comfy_workflow","new_registered_tool"];
 const h=new AgentHarness("fixture@example.test","cv-no-keyword");
 h.configure(toolNames.map(name=>({name,write:true,parameters:schema})));
 for(const phrase of phrases){
  h.begin(phrase,()=>{});
  try{if(baseline){assert.throws(()=>h.check("generate_image",{prompt:phrase}),(e:any)=>e.code==="INTENT_REQUIRED");checks++;}
  else {h.check("generate_image",{prompt:phrase});h.permit("generate_image",{prompt:phrase},"call");await h.execute("generate_image",{prompt:phrase},"call",undefined,async()=>++executions);checks++;}}
  finally{h.finish();}
 }
 if(baseline){console.log("BASELINE=REPRODUCED PHRASES=2 INTENT_REQUIRED=2 TOOL_EXECUTIONS=0 SUPPLIER_CALLS=0");return;}
 for(const phrase of [...phrases,"更通透一点","少一点","加点奶花","去掉右下角那团","this needs less clutter","只分析这张图，不生成","如何调整画面","确认执行"]){
  h.begin(phrase,()=>{});
  try{for(const tool of toolNames){assert(h.check(tool,{prompt:"model-selected arguments"}));checks++;}}
  finally{h.finish();}
 }
 h.begin("去掉其中的杂质",()=>{});
 try{
  assert.throws(()=>h.check("unregistered_tool",{}),(e:any)=>e.code==="TOOL_DENIED");checks++;
  for(const args of [{prompt:1},{prompt:"x",email:"foreign@fixture.test"},{prompt:"x",confirm:true},{},JSON.parse('{"prompt":"x","__proto__":{"x":1}}')]){
   assert.throws(()=>h.check("generate_image",args),(e:any)=>e.code==="ARGUMENT_INVALID");checks++;
  }
  await assert.rejects(()=>h.execute("generate_image",{prompt:"x"},"no-permit",undefined,async()=>++executions),(e:any)=>e.code==="TOOL_DENIED");checks++;
  h.permit("generate_image",{prompt:"x"},"once");
  await assert.rejects(()=>h.execute("generate_image",{prompt:"changed"},"once",undefined,async()=>++executions),(e:any)=>e.code==="TOOL_DENIED");checks++;
  await h.execute("generate_image",{prompt:"x"},"once",undefined,async()=>++executions);
  await assert.rejects(()=>h.execute("generate_image",{prompt:"x"},"once",undefined,async()=>++executions),(e:any)=>e.code==="REPLAY_BLOCKED");checks++;
  for(let i=1;i<HARNESS_LIMITS.writeCalls;i++){const args={prompt:"distinct"+i};h.permit("generate_image",args,"write"+i);await h.execute("generate_image",args,"write"+i,undefined,async()=>++executions);}
  assert.throws(()=>h.check("generate_image",{prompt:"too many"}),(e:any)=>e.code==="BUDGET_EXCEEDED");checks++;
 }finally{h.finish();}
 assert.throws(()=>h.check("generate_image",{prompt:"inactive"}),(e:any)=>e.code==="RUN_INACTIVE");checks++;
 const source=await readFile(resolve(root,"src/lib/agent/harness.ts"),"utf8");
 for(const old of ["creativeIntent","requestedWriteCapabilities","writeCapabilities","consentTargets",'throw new HarnessError("INTENT_REQUIRED"']){assert(!source.includes(old),old);checks++;}
 console.log(`MODIFIED=PASS CHECKS=${checks} ORIGINAL_PHRASES=2 REGISTERED_TOOLS=7 KEYWORD_GATE=DELETED SCHEMA=PASS PERMITS=PASS REPLAY=PASS BUDGET=PASS INACTIVE=PASS SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
