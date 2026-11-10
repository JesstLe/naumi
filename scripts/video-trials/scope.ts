import {z} from "zod";
import {normalizeVideoInput,resolveVideoCapability} from "../../src/lib/video/contract";
import {validateCinematicMappings} from "../../src/lib/storyboard/script-mapping";
import type {VideoModelDefinition} from "../../src/lib/video/capability-schema";

export function inspectTrialScope(scope:any,catalog:any,text:string){
 const b=scope.budget;
 for(const key of ["totalCeiling","maxVideoTasks","maxMediaJobs","perVideoCeiling","perMediaCeiling"])if(!Number.isSafeInteger(b?.[key])||b[key]<0)throw new Error("试片预算必须是非负整数");
 if(b.maxVideoTasks<1||b.perVideoCeiling<1)throw new Error("试片视频预算必须为正数");
 if(!Number.isSafeInteger(b?.totalCeiling)||b.totalCeiling<=0||b.autoTopUp!==false||b.automaticRetries!==0||b.unknownAcceptance!=="reconcile-original-only")throw new Error("试片预算或未知恢复边界缺失");
 if(b.maxVideoTasks*b.perVideoCeiling+b.maxMediaJobs*b.perMediaCeiling>b.totalCeiling)throw new Error("分项上限超过总预算");
 if(scope.shots.length+scope.additionalTrials.length>b.maxVideoTasks)throw new Error("试片任务数超过上限");
 if(new Set(Object.values(scope.clientOperationIds)).size!==Object.values(scope.clientOperationIds).length||Object.values(scope.clientOperationIds).some(id=>!z.uuid().safeParse(id).success))throw new Error("原操作身份无效或重复");
 const selected=catalog.models.find((m:any)=>m.modelId===scope.execution.modelId&&m.providerId===scope.execution.providerId);if(!selected)throw new Error("明确型号与通道不在实际目录中");
 const capability=resolveVideoCapability({manual:Object.fromEntries(Object.entries(selected.definition).filter(([key])=>key!=="sources")) as VideoModelDefinition});
 validateCinematicMappings(text,scope.shots,scope.source.range.start,scope.source.range.end);
 const inputs=scope.shots.map((shot:any)=>({caseId:shot.id,prompt:shot.prompt,mode:shot.mode,durationSeconds:scope.execution.durationSeconds,resolution:scope.execution.resolution,aspectRatio:scope.execution.aspectRatio,generateAudio:shot.generateAudio,references:shot.referenceFrom?[{id:"owned-frame-slot",kind:"image" as const,role:"reference" as const,artworkId:"OWNED_FRAME_ARTWORK_ID",url:"/media/OWNED_FRAME_KEY"}]:[]}));
 for(const input of inputs)normalizeVideoInput(input,capability);
 const native=catalog.models.filter((m:any)=>m.definition?.supportsMultiShot===true);if(scope.nativeMultiShot.state==="not-applicable"&&native.length)throw new Error("目录已有原生分镜能力，试片范围需刷新");
 const {caseId:_case,...image}=inputs[1];let blocked:string|null=null;try{normalizeVideoInput({...image,mode:"single_image"},capability);}catch(error){blocked=(error as {code?:string}).code||"unknown";}
 if(blocked!==scope.excludedPaths[0].code)throw new Error("已记录配置矛盾不再复现，请刷新范围");
 return {modelId:selected.modelId,providerId:selected.providerId,admittedShots:inputs.map((input:{caseId:string})=>input.caseId),videoTaskUpperBound:scope.shots.length+scope.additionalTrials.length,totalCreditCeiling:b.totalCeiling,nativeMultiShotModels:native.length,configurationConflict:blocked,realPaidCalls:0,referenceSlots:"not-real-materials",status:"PREPARED_NOT_EXECUTED"};
}
