import assert from "node:assert/strict";
import {submitCanvasImagegen} from "../src/lib/imagegen/canvas-client";
import {canvasReceipts,clearCanvasReceipt} from "../src/lib/imagegen/canvas-receipts";
import {startImagegen,ImagegenHttpError} from "../src/lib/imagegen/client";
import {imagegenRequestSchema} from "../src/lib/imagegen/schema";
class MemoryStorage implements Storage{private values=new Map<string,string>();get length(){return this.values.size;}key(n:number){return [...this.values.keys()][n]??null;}getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}clear(){this.values.clear();}}
async function main(){
 const storage=new MemoryStorage();Object.assign(globalThis,{sessionStorage:storage,window:{localStorage:new MemoryStorage(),confirm:()=>true}});
 let posts=0,previews=0,fail="unknown",id="";
 const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{const path=String(input);if(path==="/api/imagegen/plan"){previews++;const request=JSON.parse(String(init!.body));return Response.json({request:{...request,parameters:{...request.parameters,resolution:'2K'}},requestedParameters:{resolution:'4K'},intent:{background:null},steps:[{operation:"generate"}],totalCredits:6,billingVersion:1,modelVersion:1,warnings:[],confirmationRequired:false});}if(init?.method==="POST"){posts++;const submitted=JSON.parse(String(init.body));assert.equal(submitted.parameters.resolution,"4K","Keep raw selected tier for unchanged quote/fingerprint");id=submitted.operationId;if(fail==="unknown")throw new TypeError("response lost after acceptance");return Response.json({error:"claim failed",...(fail==="accepted"?{accepted:true}:fail==="rejected"?{accepted:false}:{})},{status:400});}if(fail==="accepted")return Response.json({operationId:id,jobId:`imagegen-${id}`,status:"queued",stage:"planning",artifacts:[],chargedCredits:0});return Response.json({error:"database unavailable"},{status:503});};
 try{const scope={owner:"owner@example.test",project:"tree:one"},form=new FormData();form.set("prompt","商品图");form.set("resolution","4K");form.set("imagegenNodeId","node:one");
  const first=await(await submitCanvasImagegen(form,"one",undefined,scope)).json();const saved=canvasReceipts(storage,scope.owner,scope.project);assert.equal(saved.length,1);assert.equal(first.jobId,`imagegen-${saved[0].receipt.id}`);
  const restored=await(await submitCanvasImagegen(form,"one",undefined,scope)).json();assert.equal(restored.jobId,first.jobId);assert.equal(posts,1,"Unknown POST is never repeated on retry/remount");assert.equal(previews,1);assert.equal(canvasReceipts(storage,"another@example.test",scope.project).length,0);assert.equal(canvasReceipts(storage,scope.owner,"tree:two").length,0);
  clearCanvasReceipt(storage,saved[0].key,"00000000-0000-4000-a000-000000000000");assert.equal(storage.length,1,"Stale completion cannot clear a newer receipt");
  fail="accepted";const request=imagegenRequestSchema.parse({version:1,operationId:crypto.randomUUID(),entry:"workbench",mode:"generate",prompt:"x",parameters:{resolution:"4K"}}),recovered=await startImagegen(request);assert.equal("jobId" in recovered?recovered.jobId:null,`imagegen-${request.operationId}`,"4xx with durable receipt recovers through read-only GET");
  fail="unproved";await assert.rejects(()=>startImagegen(request),(e:unknown)=>e instanceof ImagegenHttpError&&e.accepted===undefined,"Unproved 400 is retained for recovery");
  fail="rejected";await assert.rejects(()=>startImagegen(request),(e:unknown)=>e instanceof ImagegenHttpError&&e.accepted===false);
  console.log("PASS imagegen client recovery: save before POST, uncertain retry/remount reads original ID, account/project isolation, durable 4xx lookup and explicit rejection; external calls=0");
 }finally{globalThis.fetch=original;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
