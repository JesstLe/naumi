import assert from "node:assert/strict";
import {submitCanvasImagegen} from "../src/lib/imagegen/canvas-client";
import {saveCanvasReceipt,canvasReceipts,clearCanvasReceipt} from "../src/lib/imagegen/canvas-receipts";
class MemoryStorage implements Storage{values=new Map<string,string>();get length(){return this.values.size;}key(n:number){return [...this.values.keys()][n]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}clear(){this.values.clear();}}
async function main(){
 const storage=new MemoryStorage();Object.assign(globalThis,{sessionStorage:storage,window:{localStorage:new MemoryStorage(),confirm:()=>true}});
 const old=globalThis.fetch;let posts=0,plans=0;const messages:string[]=[];
 globalThis.fetch=async(input,init)=>{const path=String(input);const raw=JSON.parse(String(init?.body));if(path.endsWith("/plan")){plans++;return Response.json({request:raw,steps:[{operation:"edit"}],intent:{background:null},totalCredits:6,billingVersion:8,modelVersion:123,warnings:[],confirmationRequired:false});}posts++;return Response.json({id:raw.operationId});};
 try{
  const scope={owner:"fixture@example.test",project:"tree:fixture"};const id=crypto.randomUUID();
  const key=saveCanvasReceipt(storage,scope.owner,scope.project,{id,nodeId:"node",modelId:"jimeng-image-5.0-pro",x:10,y:20});
  const form=new FormData();form.set("imagegenNodeId","node");form.set("model","gpt-image-2");form.set("prompt","fixture");
  const response=await(await submitCanvasImagegen(form,"node",m=>messages.push(m),scope)).json();
  assert.equal(response.jobId,`imagegen-${id}`);assert.equal(posts,0);assert.equal(plans,0);
  assert.match(messages.pop()!,/本次未按新选择重新生成/,"Model change must not silently look like a new GPT request");
  assert.equal(canvasReceipts(storage,scope.owner,scope.project)[0].receipt.modelId,"jimeng-image-5.0-pro");
  form.set("model","jimeng-image-5.0-pro");await submitCanvasImagegen(form,"node",m=>messages.push(m),scope);assert.match(messages.pop()!,/没有再次生成/);
  storage.setItem(key,JSON.stringify({id,nodeId:"node",x:10,y:20}));form.set("model","gpt-image-2");await submitCanvasImagegen(form,"node",m=>messages.push(m),scope);assert.match(messages.pop()!,/原任务/,"Legacy receipts remain compatible");assert.equal(posts,0);
  await assert.rejects(submitCanvasImagegen(form,"node",undefined,{...scope,isCurrent:()=>false}));assert.equal(posts,0);
  clearCanvasReceipt(storage,key,id);await submitCanvasImagegen(form,"node",undefined,scope);
  assert.equal(posts,1);assert.equal(plans,1);const saved=canvasReceipts(storage,scope.owner,scope.project);assert.equal(saved[0].receipt.modelId,"gpt-image-2");
  assert.equal(canvasReceipts(storage,"different@example.test",scope.project).length,0);assert.equal(canvasReceipts(storage,scope.owner,"other").length,0);
  console.log("CANVAS_RECEIPT_RESUME=PASS CASES=7 RETAINED_ORIGINAL=1 RESUME_POSTS=0 NEW_POSTS=1 EXTERNAL_CALLS=0");
 }finally{globalThis.fetch=old;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
