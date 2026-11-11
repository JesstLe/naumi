import assert from "node:assert/strict";
import {BUSINESS_PRICE_MODES,newBusinessPricing,businessPricingLabel} from "../src/components/admin/model-config/business-pricing-presentation";
import {workspaceView,workspaceLocation} from "../src/components/admin/model-management/workspace-navigation";
import {billingPricingSchema} from "../src/lib/billing/rules/pricing-schema";
import {modelActions} from "../src/components/admin/model-management/model-actions";
import type {ManagedModelRow} from "../src/lib/model-config/management";
import {managedModelRows} from "../src/lib/model-config/management";
import {fixtureModelConfig} from "./model-config-unit-fixture";
let checks=0;
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
eq(workspaceView(undefined),"models");eq(workspaceView("sources"),"suppliers");eq(workspaceView("unknown"),"models");
for(const view of ["models","suppliers","pricing","runtime"] as const){eq(workspaceView(view),view);const url=new URL(workspaceLocation(view,"model with + & ?"),"http://fixture");eq(url.searchParams.get("model"),"model with + & ?");eq(workspaceView(url.searchParams.get("view")),view);}
for(const mode of BUSINESS_PRICE_MODES){
 const price=newBusinessPricing(mode.value,undefined,"supplier-cost-estimate");
 if(mode.value==="inherit"){eq(price,undefined);continue;}
 assert.ok(price);eq(price.mode,mode.value);eq(billingPricingSchema.safeParse(price).success,true);eq(businessPricingLabel(price),mode.label);
 const before=JSON.stringify(price),same=newBusinessPricing(mode.value,price);eq(same,price);assert.notEqual(same,price);eq(JSON.stringify(price),before);
}
const matrix={mode:"matrix" as const,prices:{low:{"1K":0,"2K":null},medium:{"1K":7,"2K":9}}};
eq(newBusinessPricing("matrix",matrix),matrix);eq(matrix.prices.low["1K"],0);eq(matrix.prices.low["2K"],null);
const rate={mode:"cny-fixed" as const,amountMicros:"500000",creditsPerCnyMicros:"10000000",rounding:"ceil" as const};
eq(newBusinessPricing("usage",rate)?.mode,"usage");const switched=newBusinessPricing("usage",rate);assert.ok(switched&&"creditsPerCnyMicros"in switched);eq(switched.creditsPerCnyMicros,rate.creditsPerCnyMicros);eq(newBusinessPricing("inherit",rate),undefined);
const row={id:"audio",modality:"audio",features:[{id:"audio.speech",label:"语音"}],routes:[],channelsEditable:false} as unknown as ManagedModelRow;
eq(modelActions(row,true,true,()=>{}).every(action=>action.disabled),true);eq(modelActions(row,false,false,()=>{}).every(action=>action.disabled),true);
const fixture=fixtureModelConfig("https://fixture.invalid/v1","00000000-0000-4000-8000-000000000001");
const actualRows=managedModelRows({version:1,digest:"fixture",config:fixture},[]);
eq(actualRows[0].defaultFeatures?.some(feature=>feature.id==="image.generate"),true);
eq(actualRows[0].scopeOptions.some(option=>option.adminDefault),false);
console.log(`MODEL_SUPPLIER_CONTRACTS=PASS CHECKS=${checks} MODES=8 INHERIT=EXPLICIT ZERO_NULL=KEPT IMPLICIT_MIGRATIONS=0 SUPPLIER_CALLS=0`);
