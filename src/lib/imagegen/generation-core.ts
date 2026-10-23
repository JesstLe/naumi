import "server-only";
import {createHash} from "node:crypto";
import {signUserSession,USER_COOKIE} from "../native-auth";
import {signAcceptedModelContext} from "../model-config/accepted-context";
import {readImagegenInputs} from "./inputs";
import {compileImagegenPrompt} from "./prompt";
import {withImagegenStep} from "./context";
import {listArtworksByIds,getPool,dbEnabled} from "../db";
import {currentCreationContext,assertCreationProjectInput} from "../saas/creation-context";
import type {ImagegenPlan,ImagegenRequest,Intent} from "./types";
export function imagegenStepId(operationId:string,key:string){const h=createHash("sha256").update(`${operationId}:${key}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
export async function imagegenInternalRequest(plan:ImagegenPlan,key:string,owner:string,body:FormData,path:string){
 const step=plan.steps.find(s=>s.key===key)!;
 const headers=new Headers({cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`,origin:"http://internal","x-naumi-billing-operation-id":imagegenStepId(plan.request.operationId,key),"x-naumi-model-version":String(plan.modelVersion),"x-naumi-billing-version":String(plan.billingVersion),"x-naumi-billing-credits":String(step.credits),"x-naumi-feature-model":step.modelId||""});
 if(plan.modelVersion)headers.set("x-naumi-accepted-model-context",await signAcceptedModelContext(owner,{modelVersion:plan.modelVersion,billingVersion:plan.billingVersion}));
 return new Request(`http://internal/api/${path}`,{method:"POST",headers,body});
}
export function imagegenStepIntent(plan:ImagegenPlan,key:string):Intent{
 const step=plan.steps.find(s=>s.key===key)!;
 return {...plan.intent,operation:step.operation,background:plan.steps.length>1&&key==="generate"?null:plan.intent.background,requirements:(plan.steps.length>1&&key==="generate"?plan.intent.requirements.filter(r=>r.name!=="background"):plan.intent.requirements).map(r=>r.name==="resolution"&&step.parameters.resolution?{...r,value:String(step.parameters.resolution)}:r)};
}
/** Resolve only an owned text anchor; project placement is metadata, not a new execution plan. */
export async function canvasTextImageProjectPlacement(owner:string,sourceNodeId?:string):Promise<{groupId?:string;parentId?:string}|undefined>{
 if(!dbEnabled||!sourceNodeId?.startsWith("text-"))return undefined;
 const scope=currentCreationContext();
 if(scope&&scope.actorEmail!==owner.toLowerCase())throw new Error("画布项目账号不一致");
 const row=(await getPool().query("SELECT project_key FROM app_canvas_text_nodes WHERE email=$1 AND id=$2",[owner.toLowerCase(),sourceNodeId])).rows[0];
 if(!row)throw new Error("原文字节点不存在或无权访问");
 const project=String(row.project_key);
 if(scope?.parentContext&&scope.parentContext!==project)throw new Error("原文字节点不在当前画布项目");
 await assertCreationProjectInput(owner,project);
 const match=/^(tree|batch):([A-Za-z0-9][A-Za-z0-9._:-]{0,159})$/.exec(project);
 if(!match)throw new Error("原文字画布项目格式无效");
 if(match[1]==="tree")return {groupId:match[2]};
 // A suite keeps its existing root ancestry without sending that image as a reference.
 const root=(await getPool().query("SELECT id FROM app_artworks WHERE email=$1 AND batch_id=$2 AND deleted_at IS NULL ORDER BY created_at,id LIMIT 1",[owner.toLowerCase(),match[2]])).rows[0];
 if(!root)throw new Error("原套图画布不存在或无权访问");
 return {parentId:String(root.id)};
}
export async function submitGenerationCore(plan:ImagegenPlan,key:string,owner:string){
 const step=plan.steps.find(s=>s.key===key)!;
 const inputs=await readImagegenInputs(plan.request,owner),intent=imagegenStepIntent(plan,key);
 const artworkIds=inputs.filter(i=>i.role!=="mask"&&!i.artworkId.startsWith("asset-")).map(i=>i.artworkId);
 const referenceSourceIds=inputs.flatMap(i=>i.reference?.sourceNodeId?[i.reference.sourceNodeId]:[]);
 const lineage=await listArtworksByIds(owner,Array.from(new Set([...artworkIds,...referenceSourceIds,...(plan.request.sourceNodeId?[plan.request.sourceNodeId]:[])])));
 const target=inputs.find(i=>i.role==="edit-target"&&!i.artworkId.startsWith("asset-"));
 const namedTarget=inputs.find(i=>i.role==="edit-target")?.reference?.sourceNodeId;
 const source=lineage.find(w=>w.id===(target?.artworkId||namedTarget||plan.request.sourceNodeId));
 const request:ImagegenRequest={...plan.request,parameters:{...plan.request.parameters,...(step.parameters.resolution?{resolution:step.parameters.resolution as "1K"|"2K"|"4K"}:{})},output:{...plan.request.output,background:intent.background||undefined}};
 const form=new FormData();
 for(const [k,v] of Object.entries({prompt:compileImagegenPrompt(request,intent,plan.skillInstructions),userPrompt:request.prompt,model:step.modelId,origin:request.entry==="canvas"?"canvas":"",entry:"imagegen",quality:request.parameters.quality||"medium",resolution:request.parameters.resolution||"1K",ratio:request.parameters.ratio||"1:1",count:String(request.variants),transparent:intent.background==="transparent"?"1":"0",parentId:inputs.find(i=>i.role==="edit-target")?.artworkId||"",targetWidth:request.parameters.width?String(request.parameters.width):undefined,targetHeight:request.parameters.height?String(request.parameters.height):undefined}))if(v!==undefined)form.set(k,v);
 for(const i of inputs)form.append(i.role==="mask"?"mask":"image",new File([new Uint8Array(i.buffer)],`${i.artworkId}.png`,{type:i.mimeType}));
 const parentId=target?.artworkId||(plan.request.mode==="edit"?source?.id:undefined)||"";
 form.set("parentId",parentId);form.set("parentIds",JSON.stringify([...new Set([...artworkIds,...referenceSourceIds.filter(id=>lineage.some(work=>work.id===id))])].filter(id=>id!==parentId)));const textPlacement=plan.request.entry==="canvas"?await canvasTextImageProjectPlacement(owner,plan.request.sourceNodeId):undefined;const projectGroupId=source?.groupId||textPlacement?.groupId;if(projectGroupId)form.set("projectGroupId",projectGroupId);if(textPlacement?.parentId&&!parentId)form.set("parentId",textPlacement.parentId);
 const internal=await imagegenInternalRequest(plan,key,owner,form,"generate-image");
 const {POST}=await import("../../app/api/generate-image/route");
 return withImagegenStep(request,intent,()=>POST(internal),plan.ratioContractVersion,plan.requestedParameters,plan.channelContractVersion===1?step.eligibleUpstreamIds:undefined,step.billingQuote?{owner:owner.toLowerCase(),operationId:imagegenStepId(plan.request.operationId,key),quote:step.billingQuote}:undefined);
}
