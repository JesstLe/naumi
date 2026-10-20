/** Synthetic local bytes, pure policies and bounded lease waits. No suppliers. */
import assert from "node:assert/strict";
import { randomBytes,createHash } from "node:crypto";
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import sharp from "sharp";
async function main(){
 const out=resolve(process.env.DELIVERY_TEST_OUT||"output/image-delivery-recovery-20261020");mkdirSync(out,{recursive:true});
 const bytes=await sharp(randomBytes(2304*2048*3),{raw:{width:2304,height:2048,channels:3}}).png({compressionLevel:0}).toBuffer();
 assert.ok(bytes.length>12*1024*1024&&bytes.length<64*1024*1024);
 const before=createHash("sha256").update(bytes).digest("hex"),url="data:image/png;base64,"+bytes.toString("base64");
 const pixels=await import(pathToFileURL(resolve("src/lib/imagegen/pixels.ts")).href),canvas=await import(pathToFileURL(resolve("src/lib/canvas-image-input.ts")).href);
 if(process.argv.includes("--baseline")){
  await assert.rejects(pixels.decodeImagegenPixels(bytes),/12MiB/);await assert.rejects(canvas.readCanvasImage(url,"http://fixture","fixture@example.test"));
  const dispatch=readFileSync("src/lib/imagegen/dispatch.ts","utf8");assert.ok(dispatch.includes('try{kept=await artifacts')&&dispatch.includes('charged=Number((await getPool()'));
  assert.ok(readFileSync("src/lib/model-config/reverse-hub-images.ts","utf8").includes('throw new ImageOperationPending(prepared.operationId, Error(`reverse-hub-${task.state}`))'));
  console.log("BASELINE=REPRODUCED VALID_OUTPUT_OVER_12MIB=REJECTED BILLING_QUERY=SKIPPED_WITH_ARTIFACT_FAILURE HUB_RECONCILING=PENDING SUPPLIER_CALLS=0");return;
 }
 const {inspectImagegenPixels,processImagegenPixels}=await import("../src/lib/imagegen/postprocess");
 const {plainGeneratedOutput}=await import("../src/lib/imagegen/receipt-policy");
 const {storedDeliveryCheckpoint}=await import("../src/lib/imagegen/delivery-checkpoint");
 const {imageRequestAdmission}=await import("../src/lib/imagegen/request-admission");
 const {waitForUnsubmittedChannel}=await import("../src/lib/model-config/channel-wait");
 const {ModelConfigError}=await import("../src/lib/model-config/types");
 let checks=0;const check=(x:unknown)=>{assert.ok(x);checks++;};
 await assert.rejects(pixels.decodeImagegenPixels(bytes),/12MiB/);checks++;
 await assert.rejects(canvas.readCanvasImage(url,"http://fixture","fixture@example.test"));checks++;
 const owned=await canvas.readCanvasOutput(url,"http://fixture","fixture@example.test");check(createHash("sha256").update(owned.buffer).digest("hex")===before);
 const actual=await inspectImagegenPixels(owned.buffer);check(actual.width===2304&&actual.height===2048&&actual.visiblePixels===2304*2048);
 await assert.rejects(pixels.decodeImagegenPixels(Buffer.alloc(64*1024*1024+1),"output"),/64MiB/);checks++;
 await assert.rejects(pixels.decodeImagegenPixels(Buffer.from("bad"),"output"));checks++;
 const jpeg=await processImagegenPixels(owned.buffer,{output:{format:"jpeg",flattenColor:"#ffffff"}});check(jpeg.width===2304&&jpeg.height===2048&&jpeg.mime==="image/jpeg");
 check(createHash("sha256").update(bytes).digest("hex")===before);
 const done={state:"done",result:[{url}]};
 check(storedDeliveryCheckpoint({paidOperations:{one:done}})?.allDone===true);
 check(storedDeliveryCheckpoint({paidOperations:{one:done,two:{state:"started"}}})?.allDone===false);
 check(storedDeliveryCheckpoint({paidOperations:{one:{state:"started",result:[{url}]}}})===null);
 check(storedDeliveryCheckpoint({paidOperations:{one:{state:"done",result:[{url:"https://untrusted.invalid/private"}]}}})===null);
 check(storedDeliveryCheckpoint({images:[{url}]})?.final===true);
 const plan:any={steps:[{operation:"generate"}],request:{inputs:[],output:{format:"png"}}};check(plainGeneratedOutput(plan));
 for(const request of [{...plan.request,output:{format:"webp"}},{...plan.request,chroma:{}},{...plan.request,inputs:[{role:"mask"}]}])check(!plainGeneratedOutput({...plan,request}));
 const source={model:"jimeng/jimeng-image-5.0-pro",parameterMap:{}};
 check(imageRequestAdmission("79:140","jimeng",false,source,"reverse-hub").includes("REVERSE_HUB_RATIO_UNSUPPORTED"));
 check(imageRequestAdmission("3:4","jimeng",false,source,"reverse-hub").length===0);
 check(imageRequestAdmission("79:140","unknown-model",false,{...source,model:"unknown"}).length===0);
 let attempts=0;const wait=await waitForUnsubmittedChannel(async()=>{if(++attempts<2)throw new ModelConfigError("PROVIDER_BUSY","local busy",429);return "lease";},new AbortController().signal,1200);check(wait==="lease"&&attempts===2);
 attempts=0;await assert.rejects(waitForUnsubmittedChannel(async()=>{attempts++;throw new ModelConfigError("CHANNEL_DISABLED","disabled",409);},new AbortController().signal,5000));check(attempts===1);
 attempts=0;await assert.rejects(waitForUnsubmittedChannel(async()=>{attempts++;throw new ModelConfigError("PROVIDER_BUSY","busy",429);},new AbortController().signal,0));check(attempts===1);
 attempts=0;await assert.rejects(waitForUnsubmittedChannel(async()=>{attempts++;throw new ModelConfigError("PROVIDER_BUSY","cooldown",503);},new AbortController().signal,5000));check(attempts===1);
 const abort=new AbortController();const running=waitForUnsubmittedChannel(async()=>{throw new ModelConfigError("PROVIDER_BUSY","busy",429);},abort.signal);setTimeout(()=>abort.abort(Error("cancelled")),10);await assert.rejects(running,/cancelled/);checks++;
 const dispatch=readFileSync("src/lib/imagegen/dispatch.ts","utf8");check(dispatch.indexOf('charged=await childCharges(owner,state.children,plan);chargeKnown=true')<dispatch.indexOf('for(const id of new Set(baseIds.length?baseIds:ids))'));check(dispatch.includes('billingStatus:chargeKnown?"confirmed":"unavailable"'));
 writeFileSync(out+"/PURE.json",JSON.stringify({checks,bytes:bytes.length,width:2304,height:2048,originalHash:before,realSupplierCalls:0},null,2));
 console.log(`MODIFIED=PASS CHECKS=${checks} LARGE_OUTPUT=DELIVERED INPUT12MIB=UNCHANGED OUTPUT64MIB=BOUNDED HASH=UNCHANGED BILLING_QUERY=INDEPENDENT STORED_RECOVERY=NO_SUPPLIER WAIT=LOCAL_ONLY HUB_RATIO=PREQUOTE PROVIDER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
