/** Actual production fixture setup/inspection only. No scanner/job algorithm
 * replacement. Bundled once against each complete source-root for A/B. */
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {getPool} from "@/platform/db/pool";
import {initializeApplicationPersistence} from "@/lib/application/persistence";
import {getOrCreateUser,addCreditBatch,addArtworks} from "@/lib/db";
import {DurableImageJobs} from "@/lib/durable-image-jobs";
import {getBillingRuntime} from "@/lib/billing/runtime";
import {quote} from "@/lib/billing/quote";
import {uploadImage} from "@/lib/storage";
import type {BillingFacts} from "@/lib/billing/types";

export const pool=getPool;
export async function seed(){
 await initializeApplicationPersistence();const billing=await getBillingRuntime(),current=await billing.config.current(),config=structuredClone(current.config);config.switches.metering="on";
 for(const key of ["image.generate","image.suite","image.aplus"] as const){config.features[key].pricing={mode:"fixed",credits:6};config.features[key].rules=[];}
 const frozen=await billing.config.publish({id:randomUUID(),actor:"fixture",reason:"Direct Worker original price",expectedVersion:current.version,config});
 const owner="worker-owner@fixture.test";await getOrCreateUser(owner);
 await getPool().query("DELETE FROM app_ledger WHERE email=$1",[owner]);await getPool().query("DELETE FROM app_credit_batches WHERE email=$1",[owner]);await getPool().query("UPDATE app_users SET credits_total=0,credits_used=0 WHERE email=$1",[owner]);await addCreditBatch(owner,100,{source:"admin",reason:"Direct Worker fixture"});
 const pixels=await sharp({create:{width:32,height:32,channels:3,background:"#aaccee"}}).png().toBuffer(),url=await uploadImage(pixels,"image/png","fixture/result.png",undefined,owner);
 const ids={generate:"gen-"+randomUUID(),suite:"suite-"+randomUUID(),aplus:"aplus-"+randomUUID(),imagegen:"imagegen-"+randomUUID()};
 const quotes=Object.fromEntries(["generate","suite","aplus"].map(kind=>[kind,quote(frozen,{feature:"image."+kind,quantity:kind==="generate"?1:2,quality:"medium",resolution:"1K",modelId:"gpt-image-2",metered:true,byok:false,paidFen:0,userGroup:"user"} as BillingFacts)]));
 const p={prompt:"fixture",userPrompt:"fixture",category:"main",ratio:"1:1",resolution:"1K",style:"",quality:"medium",count:1,transparent:false,ratiogen:false,email:owner,images:[],parentId:"",parentIds:[],templateId:"",templateImage:"",templatePrompt:"",origin:"generate",projectGroupId:"",model:"gpt-image-2",targetWidth:0,targetHeight:0},createdAt=Date.now(),image={id:`art-${ids.generate}-0`,url,gradient:"",prompt:"fixture",ratio:"1:1",createdAt:new Date(createdAt).toISOString()},scope={actorEmail:owner,scopeKind:"personal",tenantId:null,parentContext:"tree:frozen-worker"};
 await new DurableImageJobs<any>("generate").create(ids.generate,owner,{status:"pending",images:[image],createdAt},{p,cost:6,byok:false,creationScope:scope},6,true,quotes.generate);
 const shots=(id:string)=>[{id:id+"-0",label:"Retained",role:"main",ratio:"1:1",prompt:"fixture",text:"",status:"done",url,gradient:""},{id:id+"-1",label:"Already failed",role:"sub",ratio:"1:1",prompt:"fixture",text:"",status:"error",gradient:""}];
 await new DurableImageJobs<any>("suite").create(ids.suite,owner,{status:"pending",shots:shots(ids.suite),done:2,total:2,createdAt,owner,renderingFinished:true},{images:[{buf:pixels,type:"image/png"}],extra:"",platform:"taobao",email:owner,model:"gpt-image-2",cost:12,requested:[],textModel:"fixture-no-call"},12,true,quotes.suite);
 await new DurableImageJobs<any>("aplus").create(ids.aplus,owner,{status:"pending",stage:"generating",sources:[{id:ids.aplus+"-source",label:"Retained",status:"approved",version:1,url}],sourceInputs:[{buf:pixels,type:"image/png"}],sourceBuffers:[pixels],sourceHistory:[[]],shots:shots(ids.aplus),done:2,total:2,extra:"",platform:"amazon",lang:"zh",format:"1:1",modules:["main","sub"],email:owner,model:"gpt-image-2",textModel:"fixture-no-call",useDb:true,cost:12,generationStarted:true,reserved:true,parentId:"",parentIds:[],origin:"generate",createdAt,renderingFinished:true},{},12,true,quotes.aplus);
 const child="child-"+randomUUID(),artifact="retained-art-"+randomUUID();await new DurableImageJobs<any>("generate").create(child,owner,{status:"done",images:[{...image,id:artifact}]},{p},0,false);await getPool().query("UPDATE app_image_jobs SET billing_settled=true WHERE id=$1",[child]);await addArtworks(owner,[{id:artifact,title:"Original",category:"main",prompt:"fixture",status:"completed",image:url,gradient:""}]);
 const operationId=ids.imagegen.slice(9),plan={request:{operationId,mode:"generate",entry:"generate",prompt:"fixture",inputs:[],variants:1,output:{format:"png"}},intent:{background:"opaque"},steps:[{key:"generate",operation:"generate",eligibleUpstreamIds:[],parameters:{},credits:0}],totalCredits:0};
 await new DurableImageJobs<any>("imagegen").create(ids.imagegen,owner,{status:"pending",result:{operationId,jobId:ids.imagegen,status:"pending",stage:"generating",artifacts:[],chargedCredits:0},fingerprint:"fixture",children:{generate:{state:"done",jobId:child,ids:[artifact]}}},{plan},0,false);
 const live="live-"+randomUUID(),token=randomUUID(),unknown="unknown-"+randomUUID();await new DurableImageJobs<any>("generate").create(live,owner,{status:"pending",images:[image],createdAt},{p,cost:6},6,true);await getPool().query("UPDATE app_image_jobs SET lease_token=$2,lease_until=now()+interval '5 minutes' WHERE id=$1",[live,token]);
 await new DurableImageJobs<any>("generate").create(unknown,owner,{status:"needs_attention",paidOperations:{[unknown]:{state:"started",model:"gpt-image-2",replayable:false}}},{},0,false);
 const changed=structuredClone(frozen.config);for(const key of ["image.generate","image.suite","image.aplus"] as const)changed.features[key].pricing={mode:"fixed",credits:17};await billing.config.publish({id:randomUUID(),actor:"fixture",reason:"New current price after original acceptance",expectedVersion:frozen.version,config:changed});
 return {ids,owner,quotes,scope,live,token,unknown,artifact};
}
