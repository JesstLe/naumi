import assert from "node:assert/strict";
import {Type} from "typebox";
import {createModelFixture} from "./model-config-fixture";
import {randomUUID} from "node:crypto";

async function main(){
  let name="read_fixture",effects=0,modelCalls=0;
  const f=await createModelFixture(async(req,res)=>{
    if(!req.url?.endsWith("/chat/completions")){res.statusCode=404;res.end("{}");return;}
    const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const body=JSON.parse(Buffer.concat(chunks).toString());modelCalls++;
    const done=body.messages.some((m:any)=>m.role==="tool"),frame=(delta:any,finish_reason:any=null)=>"data: "+JSON.stringify({id:"bridge",object:"chat.completion.chunk",created:1,model:body.model,choices:[{index:0,delta,finish_reason}]})+"\n\n";
    res.setHeader("content-type","text/event-stream");res.write(frame({role:"assistant"}));
    if(done){res.write(frame({content:"完成"}));res.write(frame({},"stop"));}
    else{res.write(frame({tool_calls:[{index:0,id:"bridge-call",type:"function",function:{name,arguments:"{}"}}]}));res.write(frame({},"tool_calls"));}
    res.end("data: [DONE]\n\n");
  });
  Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,OPENAI_BASE_URL:f.origin+"/v1",OPENAI_API_KEY:"fixture-bridge-secret-123456789"});
  const db=await import("../src/lib/db");
  try{
    const {PiBridge}=await import("../src/lib/agent/bridges/pi-bridge");const bridge=new PiBridge();
    const session=await bridge.createSession({sessionId:"ag-"+randomUUID(),email:"bridge@example.test",history:[],systemPrompt:"fixture",getCred:()=>({cookie:"",authorization:""}),tools:[{name:"read_fixture",description:"read",write:false,parameters:Type.Object({}),execute:async()=>{effects++;return {text:"data",publicSummary:"已读取"};}},{name:"generate_image",description:"write",write:true,parameters:Type.Object({}),execute:async()=>{effects++;return {text:"written",publicSummary:"完成"};}}]});
    const events:any[]=[];assert.equal((await session.run("查看数据",event=>events.push(event))).reply,"完成");assert.equal(effects,1);assert.ok(events.some(e=>e.type==="tool_end"));
    name="generate_image";await session.run("生成图片",()=>{});assert.equal(effects,1);
    const denied=await bridge.createSession({sessionId:"ag-"+randomUUID(),email:"bridge@example.test",history:[],systemPrompt:"fixture",getCred:()=>({cookie:"",authorization:""}),beforeToolCall:async()=>"缺少授权",tools:[{name:"generate_image",description:"write",write:true,parameters:Type.Object({}),execute:async()=>{effects++;return {text:"written",publicSummary:"done"};}}]});await denied.run("生成图片",()=>{});assert.equal(effects,1);
    console.log(`AGENT_HARNESS_BRIDGE=PASS legitimate_read_effects=1 unauthorized_write_effects=0 missing_gate=BLOCKED explicit_denial=BLOCKED local_model_requests=${modelCalls} real_supplier_calls=0`);
  }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
