import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createBillingFixture} from "./billing-fixture";
async function main(){
 const f=await createBillingFixture();
 try{
 const email=await f.user(100),{fixtureConfig,facts}=await import("./billing-unit-fixture"),{quote}=await import("../src/lib/billing/quote"),repo=await import("../src/lib/image-job-repository"),{auditSettledImage}=await import("../src/lib/image-quality-request");
 const config=fixtureConfig();config.costs["*:*:medium:1K"]={currency:"CNY",amountMicros:"1250000",unit:"image",source:"manual-estimate"};
 const q=quote({version:17,config},facts()),id=`audit-${randomUUID()}`;
 await repo.createImageJob(id,email,"generate",{status:"pending"},{},q.requestedCredits,true,q);
 await repo.settleImageJob(id,{state:"succeeded",items:[{id:"image",state:"succeeded",executedQuality:"medium"}]},"fixture",null);
 await auditSettledImage(email,999,{requested:"medium",executed:"medium",fallbackReason:null},id,"image");
 const row=(await f.pool.query("SELECT * FROM app_image_cost_audit WHERE job_id=$1",[id])).rows[0];
 assert.equal(Number(row.billed_credits),6,"Audit reads committed charge rather than caller amount");
 assert.equal(Number(row.billing_config_version),17);assert.equal(row.cost_currency,"CNY");assert.equal(String(row.cost_amount_micros),"1250000");assert.equal(row.cost_actual,false);assert.equal(row.cost_credits,null);assert.equal(row.margin_credits,null);
 const changed=structuredClone(config);changed.costs["*:*:medium:1K"].amountMicros="9000000";assert.equal(quote({version:18,config:changed},facts()).requestedCredits,6);
 await auditSettledImage(email,0,{requested:"medium",executed:"medium",fallbackReason:null},id,"image");assert.equal(String((await f.pool.query("SELECT cost_amount_micros FROM app_image_cost_audit WHERE job_id=$1",[id])).rows[0].cost_amount_micros),"1250000");
 const {frozenCostAudit}=await import("../src/lib/billing/audit");
 const owned=frozenCostAudit(q,{id:"self",quality:"medium",platformFunded:false},0);assert.equal(owned.costCurrency,null);
 assert.equal(frozenCostAudit(q,{id:"fallback",quality:"medium",platformFunded:true},0).costAmountMicros,"1250000");
 const unknown=structuredClone(q);unknown.costRates={};assert.equal(frozenCostAudit(unknown,{id:"unknown",quality:"medium"},6).costCurrency,null);
 changed.features["image.generate"].pricing={mode:"cost-plus",costKey:"*:*:medium:1K",creditsPerCnyMicros:"2000000",factorBps:15000,rounding:"ceil",minimum:0,maximum:100};assert.equal(quote({version:18,config:changed},facts()).requestedCredits,27);
 console.log("PASS audits freeze cost version and currency, use committed charges and preserve unknown/BYOK estimates");
 }finally{await f.pool.query("DELETE FROM app_image_cost_audit WHERE email LIKE 'billing-%@example.test'");await f.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
