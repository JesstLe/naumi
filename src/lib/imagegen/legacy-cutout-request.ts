import "server-only";
import {signUserSession,USER_COOKIE} from "../native-auth";
import {signAcceptedModelContext} from "../model-config/accepted-context";
import {imagegenStepId} from "./operation-id";
import type {ImagegenPlan} from "./types";
/** Cutout remains a separately scheduled compatibility slice. */
export async function imagegenInternalRequest(plan:ImagegenPlan,key:string,owner:string,body:FormData,path:string){
 const step=plan.steps.find(s=>s.key===key)!;
 const headers=new Headers({cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,origin:"http://internal","x-naumi-billing-operation-id":imagegenStepId(plan.request.operationId,key),"x-naumi-model-version":String(plan.modelVersion),"x-naumi-billing-version":String(plan.billingVersion),"x-naumi-billing-credits":String(step.credits),"x-naumi-feature-model":step.modelId||""});
 if(plan.modelVersion)headers.set("x-naumi-accepted-model-context",await signAcceptedModelContext(owner,{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion}));
 return new Request(`http://internal/api/${path}`,{method:"POST",headers,body});
}
