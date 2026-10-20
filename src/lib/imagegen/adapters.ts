import "server-only";
import {readImagegenInputs} from "./inputs";
import {imagegenInternalRequest,imagegenStepIntent,submitGenerationCore} from "./generation-core";
import {compileImagegenPrompt} from "./prompt";
import {withImagegenStep} from "./context";
import type {ImagegenPlan} from "./types";
/** Reuses existing domain endpoints and their frozen configuration/ledger. */
export async function executeImagegenStep(plan:ImagegenPlan,key:string,owner:string){
 const step=plan.steps.find(s=>s.key===key);if(!step)throw new Error("执行步骤不存在");
 if(step.operation!=="cutout")return submitGenerationCore(plan,key,owner);
 const inputs=await readImagegenInputs(plan.request,owner),target=inputs.find(i=>i.role==="edit-target");if(!target)throw new Error("请选择抠图目标");
 const effectiveRequest={...plan.request,parameters:{...plan.request.parameters,resolution:(step.parameters.resolution||plan.request.parameters.resolution||"1K") as "1K"|"2K"|"4K"}};
 const form=new FormData();form.set("image",new File([new Uint8Array(target.buffer)],"target.png",{type:target.mimeType}));
 for(const [k,v] of Object.entries({prompt:compileImagegenPrompt(effectiveRequest,imagegenStepIntent(plan,key),plan.skillInstructions),parentId:target.artworkId,quality:plan.request.parameters.quality||"medium",resolution:String(step.parameters.resolution||plan.request.parameters.resolution||"1K"),ratio:plan.request.parameters.ratio||"1:1"}))form.set(k,v);
 if(target.artworkId.startsWith("asset-"))form.delete("parentId");
 const request=await imagegenInternalRequest(plan,key,owner,form,"cutout"),{POST}=await import("../../app/api/cutout/route");
 return withImagegenStep(effectiveRequest,imagegenStepIntent(plan,key),()=>POST(request),plan.ratioContractVersion,plan.requestedParameters,plan.channelContractVersion===1?step.eligibleUpstreamIds:undefined);
}
