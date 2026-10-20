import assert from "node:assert/strict";
import OpenAI from "openai";
import {withImageOperation,withImageIndex,ImageOperationPending,ImageOperationReview} from "../src/lib/image-gateway";
import {DurableImageJobs} from "../src/lib/durable-image-jobs";

async function main(){
 assert.equal(Boolean(process.env.DATABASE_URL),false,"Use the DB-free local fixture only");
 let cases=0;
 for(const reviewCode of ["reconciling","waiting_login","waiting_client"] as const){
  const id=`review-${reviewCode}`,review=new ImageOperationReview(`${id}:image:0`,reviewCode);
  let attempts=0;
  const sdk=new OpenAI({apiKey:"fixture",baseURL:"http://fixture.invalid/v1",maxRetries:0,fetch:async()=>{attempts++;throw review;}});
  let caught:unknown;
  try{await withImageOperation("jimeng-image-5.0-pro",{id,durable:true},()=>withImageIndex("jimeng-image-5.0-pro",0,()=>sdk.images.generate({model:"fixture",prompt:"fixture"})));}catch(e){caught=e;}
  assert.equal(caught,review,`SDK-wrapped ${reviewCode} must retain the exact local review instance`);
  assert.equal(attempts,1,"No SDK retry or supplier failover");
  const jobs=new DurableImageJobs<any>("generate");
  await jobs.create(id,"fixture@example.test",{status:"pending",paidOperations:{[id]:{state:"started",replayable:true}}},{},6,false);
  await jobs.handlePending(id,caught as ImageOperationPending);
  const saved=await jobs.get(id);
  assert.equal(saved.status,"needs_attention");assert.equal(saved.reviewCode,reviewCode);
  assert.equal(saved.paidOperations[id].state,"started","Keep paid acceptance evidence");
  assert.equal(saved.customerBilling,undefined,"No fabricated refund/settlement");cases++;
 }
 const pending=new ImageOperationPending("ordinary:image:0",Error("lost-response"));
 await assert.rejects(withImageOperation("fixture",{id:"ordinary",durable:true},async()=>{throw new OpenAI.APIConnectionError({cause:pending});}),e=>e===pending);cases++;
 const plain=Object.assign(Error("ordinary"),{name:"ImageOperationReview",reviewCode:"reconciling"});
 await assert.rejects(withImageOperation("fixture",{id:"plain",durable:true},async()=>{throw plain;}),e=>e instanceof ImageOperationPending&&!(e instanceof ImageOperationReview));cases++;
 const foreign=new ImageOperationReview("another-job","reconciling");
 await assert.rejects(withImageOperation("fixture",{id:"own",durable:true},async()=>{throw new OpenAI.APIConnectionError({cause:foreign});}),e=>e instanceof ImageOperationPending&&!(e instanceof ImageOperationReview));cases++;
 const cycle:any=Error("cycle");cycle.cause=cycle;
 await assert.rejects(withImageOperation("fixture",{id:"cycle",durable:true},async()=>{throw cycle;}),ImageOperationPending);cases++;
 const busy=Object.assign(Error("busy"),{status:429});
 await assert.rejects(withImageOperation("fixture",{id:"busy",durable:true},async()=>{throw busy;}),e=>e===busy);cases++;
 console.log(`REVIEW_PROPAGATION=PASS CASES=${cases} SDK_RETRIES=0 EXTERNAL_CALLS=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
