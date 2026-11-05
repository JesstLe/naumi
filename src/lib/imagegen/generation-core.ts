import "server-only";
import {submitGenerationOperation} from "./generation-operation";
import {multipartFieldText} from "../billing/submission-identity";
import type {GenParams} from "./generation-types";
import {readImagegenInputs} from "./inputs";
import {compileImagegenPrompt} from "./prompt";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {getPool, dbEnabled} from "@/platform/db/pool";
import {currentCreationContext} from "@/lib/saas/creation-scope";
import {assertCreationProjectInput} from "@/lib/saas/creation-access";
import type {ImagegenPlan,ImagegenRequest} from "./types";
export {imagegenStepId} from "./operation-id";
import {imagegenStepIntent} from "./step-intent";
export {imagegenStepIntent} from "./step-intent";
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
 const frameInstructions=plan.frameChoice?.method==='provider-auto'?`画幅跟随${plan.frameChoice.source==='reference'?'所选参考图':'用户选择'}的 ${plan.frameChoice.target}，完整保留主体，不裁切或拉伸。`:undefined;
 const prompt=[compileImagegenPrompt(request,intent,plan.skillInstructions),frameInstructions].filter(Boolean).join("\n\n");
 const fields:Record<string,string>={prompt,userPrompt:request.prompt,model:step.modelId||"",origin:request.entry==="canvas"?"canvas":"",entry:"imagegen",quality:request.parameters.quality||"medium",resolution:request.parameters.resolution||"1K",ratio:request.parameters.ratio||"1:1",count:String(request.variants),transparent:intent.background==="transparent"?"1":"0",parentId:inputs.find(i=>i.role==="edit-target")?.artworkId||""};
 if(step.modelId===undefined)delete fields.model;
 if(request.parameters.width)fields.targetWidth=String(request.parameters.width);
 if(request.parameters.height)fields.targetHeight=String(request.parameters.height);
 const parentId=target?.artworkId||(plan.request.mode==="edit"?source?.id:undefined)||"";
 fields.parentId=parentId;fields.parentIds=JSON.stringify([...new Set([...artworkIds,...referenceSourceIds.filter(id=>lineage.some(work=>work.id===id))])].filter(id=>id!==parentId));
 const textPlacement=plan.request.entry==="canvas"?await canvasTextImageProjectPlacement(owner,plan.request.sourceNodeId):undefined;
 const projectGroupId=source?.groupId||textPlacement?.groupId;if(projectGroupId)fields.projectGroupId=projectGroupId;
 if(textPlacement?.parentId&&!parentId)fields.parentId=textPlacement.parentId;
 for(const key of Object.keys(fields))fields[key]=multipartFieldText(fields[key]);
 const files=inputs.map(i=>({field:i.role==="mask"?"mask" as const:"image" as const,name:`${i.artworkId}.png`,mimeType:i.mimeType,buffer:i.buffer}));
 const parameters:GenParams={prompt:fields.prompt.trim(),userPrompt:fields.userPrompt.trim(),category:"main",style:"",email:owner,
  ratio:fields.ratio,resolution:fields.resolution,quality:fields.quality,count:request.variants,transparent:fields.transparent==="1",ratiogen:false,
  images:inputs.filter(i=>i.role!=="mask").map(i=>({buf:i.buffer,type:i.mimeType})),
  ...(inputs.find(i=>i.role==="mask")?{mask:{buf:inputs.find(i=>i.role==="mask")!.buffer,type:inputs.find(i=>i.role==="mask")!.mimeType}}:{}),
  parentId:fields.parentId,parentIds:JSON.parse(fields.parentIds),templateId:"",templateImage:"",templatePrompt:"",origin:fields.origin,entry:fields.entry,
  projectGroupId:fields.projectGroupId||"",model:fields.model||"",targetWidth:request.parameters.width||0,targetHeight:request.parameters.height||0};
 return submitGenerationOperation({plan,key,owner,request,intent,parameters,fields,files});
}
