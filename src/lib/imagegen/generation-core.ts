import "server-only";
import {createHash} from "node:crypto";
import {signUserSession,USER_COOKIE} from "../native-auth";
import {signAcceptedModelContext} from "../model-config/accepted-context";
import {readImagegenInputs} from "./inputs";
import {compileImagegenPrompt} from "./prompt";
import {withImagegenStep} from "./context";
import type {ImagegenPlan,ImagegenRequest,Intent} from "./types";
export function imagegenStepId(operationId:string,key:string){const h=createHash("sha256").update(`${operationId}:${key}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
export async function imagegenInternalRequest(plan:ImagegenPlan,key:string,owner:string,body:FormData,path:string){
 const step=plan.steps.find(s=>s.key===key)!;
 const headers=new Headers({cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,origin:"http://internal","x-naumi-billing-operation-id":imagegenStepId(plan.request.operationId,key),"x-naumi-model-version":String(plan.modelVersion),"x-naumi-billing-version":String(plan.billingVersion),"x-naumi-billing-credits":String(step.credits),"x-naumi-feature-model":step.modelId||""});
 if(plan.modelVersion)headers.set("x-naumi-accepted-model-context",await signAcceptedModelContext(owner,{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion}));
 return new Request(`http://internal/api/${path}`,{method:"POST",headers,body});
}
export function imagegenStepIntent(plan:ImagegenPlan,key:string):Intent{
 const step=plan.steps.find(s=>s.key===key)!;
 return {...plan.intent,operation:step.operation,background:plan.steps.length>1&&key==="generate"?null:plan.intent.background,requirements:plan.steps.length>1&&key==="generate"?plan.intent.requirements.filter(r=>r.name!=="background"):plan.intent.requirements};
}
export async function submitGenerationCore(plan:ImagegenPlan,key:string,owner:string){
 const step=plan.steps.find(s=>s.key===key)!;
 const inputs=await readImagegenInputs(plan.request,owner),intent=imagegenStepIntent(plan,key);
 const request:ImagegenRequest={...plan.request,output:{...plan.request.output,background:intent.background||undefined}};
 const form=new FormData();
 for(const [k,v] of Object.entries({prompt:compileImagegenPrompt(request,intent,plan.skillInstructions),userPrompt:request.prompt,model:step.modelId,origin:request.entry==="canvas"?"canvas":"",entry:"imagegen",quality:request.parameters.quality||"medium",resolution:request.parameters.resolution||"1K",ratio:request.parameters.ratio||"1:1",count:String(request.variants),transparent:intent.background==="transparent"?"1":"0",parentId:inputs.find(i=>i.role==="edit-target")?.artworkId||"",targetWidth:request.parameters.width?String(request.parameters.width):undefined,targetHeight:request.parameters.height?String(request.parameters.height):undefined}))if(v!==undefined)form.set(k,v);
 for(const i of inputs)form.append(i.role==="mask"?"mask":"image",new File([new Uint8Array(i.buffer)],`${i.artworkId}.png`,{type:i.mimeType}));
 const internal=await imagegenInternalRequest(plan,key,owner,form,"generate-image");
 const {POST}=await import("../../app/api/generate-image/route");
 return withImagegenStep(request,intent,()=>POST(internal));
}
