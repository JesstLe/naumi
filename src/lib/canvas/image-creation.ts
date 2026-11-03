import {canvasGenerationDestination} from "./generation-fanout";
import type {Artwork} from "../mock-data";
import type {CanvasTextNode} from "./text-document-model";
import {inheritableImagePrompt,type CanvasImageReference} from "./image-references";
import type {CanvasImageGenerationOptions} from "./image-task-request";
import type {CanvasGeneratedImage} from "./image-task-controller";

export const CANVAS_IMAGE_REFERENCE_LIMIT=16;
export type CanvasImageCreationMode="standard"|"triptych"|"split"|"detail";
export type CanvasImageCreationParameters={ratio:string;style:string;count:number;resolution:string};
export type CanvasImageCreationInput={
  source:Artwork;prompt:string;mode:CanvasImageCreationMode;parameters:CanvasImageCreationParameters;
  references:Artwork[];files:File[];referenceInputs:CanvasImageReference[];referenceError?:string|null;
  operationKey?:string;onSubmitted?:()=>void;
};
export type CanvasImageCreationServices={
  isCurrent:()=>boolean;
  generate:(source:Artwork,prompt:string,options:CanvasImageGenerationOptions)=>Promise<CanvasGeneratedImage[]>;
  rename:(id:string,title:string)=>Promise<unknown>;
  detail:(input:{source:Artwork;references:Artwork[];prompt:string;files:File[];referenceInputs:CanvasImageReference[]})=>Promise<unknown>;
};

const FAITHFUL_REGEN_PROMPT="在保持主体、背景、配色、材质、光影与构图不变的前提下,仅提升清晰度与画质,输出一张干净的高质量版本;不要替换背景、不要改变背景颜色或整体色调。";
const VIEW_CONSISTENCY_RULES="必须严格保持同一件产品：外形比例、结构、包装文字、Logo、颜色、材质、零件数量和所有识别性细节一致。使用统一白色影棚背景、相同镜头高度、焦距、光线、阴影强度与产品尺度，不得重新设计产品。";
function viewPrompt(role:"正面"|"侧面"|"背面",feedback:string,anchor=false){
  return `${VIEW_CONSISTENCY_RULES} 输出产品${role}标准视图，产品完整露出并居中，画面只出现一个产品。${anchor?"第一张参考图是主体原图，第二张参考图是已经确认的正面锚点；以正面锚点锁定产品身份和视觉规格。":"以参考主体图为唯一产品依据。"}${feedback?` 用户补充要求：${feedback}`:""}`;
}

/** The browser application owns creative intent and stage order, not HTTP,
 * billing, polling, scene state, or result attachment. Its four ports reuse the
 * existing task/detail/history owners. Every stage belongs to the first view. */
export async function executeCanvasImageCreation(input:CanvasImageCreationInput,services:CanvasImageCreationServices):Promise<string|undefined>{
  if(!services.isCurrent())return;
  if(input.referenceError)return input.referenceError;
  const {source,parameters,referenceInputs}=input,feedback=input.prompt.trim();
  if(input.references.length+input.files.length>CANVAS_IMAGE_REFERENCE_LIMIT)return `一次最多使用 ${CANVAS_IMAGE_REFERENCE_LIMIT} 张图片，请移除多余引用`;
  if(input.mode==="detail"){
    await services.detail({source,references:input.references.length?input.references:[source],prompt:feedback,files:input.files,referenceInputs});
    return;
  }
  if(input.mode==="triptych"){
    const images=await services.generate(source,`${VIEW_CONSISTENCY_RULES} 在同一张横向画布中制作正面、侧面、背面三个等宽分区，按从左到右顺序排列并完整露出；三个分区中的产品必须是同一件产品，背景与尺度统一。${feedback?` 用户补充要求：${feedback}`:""}`,{
      ratio:"16:9",style:parameters.style,count:1,resolution:parameters.resolution,parentId:source.id,refUrls:[source.image],referenceInputs,
      taskLabel:"三视图合成中…",userPrompt:feedback||"生成正侧背三视图",isCurrent:services.isCurrent,
    });
    if(images[0]&&services.isCurrent())await services.rename(images[0].id,"正侧背三视图");
    return;
  }
  if(input.mode==="split"){
    if(!referenceInputs.length)return "请先选择一张编辑目标，再生成三视图";
    if(referenceInputs.length>=CANVAS_IMAGE_REFERENCE_LIMIT)return "分图需要为生成的正面锚点预留一张参考图位置";
    await splitViews(input,services);return;
  }
  const uploadAsBase=!input.references.length&&input.files.length>0;
  const destination=canvasGenerationDestination(parameters.count);
  await services.generate(source,feedback||canvasInheritedImagePrompt(source.prompt),{
    operationKey:input.operationKey,onSubmitted:input.onSubmitted,
    ...parameters,...destination,parentId:source.id,parentIds:input.references.filter(ref=>ref.id!==source.id).map(ref=>ref.id),
    baseFile:uploadAsBase?input.files[0]:undefined,extra:uploadAsBase?input.files.slice(1):input.files,
    refUrls:uploadAsBase?[]:input.references.map(ref=>ref.image),userPrompt:feedback||canvasInheritedImagePrompt(source.prompt),referenceInputs,isCurrent:services.isCurrent,
  });
}

async function splitViews(input:CanvasImageCreationInput,services:CanvasImageCreationServices){
  const {source,parameters,referenceInputs}=input,feedback=input.prompt.trim(),viewSet=`views:${source.id}:${Date.now()}`;
  const front=await services.generate(source,viewPrompt("正面",feedback),{
    ratio:parameters.ratio,style:parameters.style,count:1,resolution:parameters.resolution,parentId:source.id,refUrls:[source.image],
    operationKey:`${viewSet}:front`,referenceInputs,taskLabel:"生成正面锚点…",userPrompt:feedback?`正面视图：${feedback}`:"生成正面视图",taskOffset:0,isCurrent:services.isCurrent,
  });
  const anchor=front[0];if(!anchor||!services.isCurrent())return;
  await services.rename(anchor.id,"正面视图");
  if(!services.isCurrent())return;
  const shared=[source.image,anchor.url];
  const anchoredReferences=[...referenceInputs,{key:`node:${anchor.id}`,sourceNodeId:anchor.id,title:"正面锚点",url:anchor.url,number:Math.max(0,...referenceInputs.map(ref=>ref.number))+1,role:"reference" as const}];
  const [side,back]=await Promise.all((["侧面","背面"] as const).map((role,index)=>{
    if(!services.isCurrent())return Promise.resolve([] as CanvasGeneratedImage[]);
    return services.generate(source,viewPrompt(role,feedback,true).replace("第二张参考图","最后一张参考图"),{
      ratio:parameters.ratio,style:parameters.style,count:1,resolution:parameters.resolution,parentId:source.id,parentIds:[anchor.id],refUrls:shared,
      operationKey:`${viewSet}:${index?"back":"side"}`,referenceInputs:anchoredReferences,taskLabel:`生成${role}视图…`,userPrompt:feedback?`${role}视图：${feedback}`:`生成${role}视图`,taskOffset:index+1,isCurrent:services.isCurrent,
    });
  }));
  if(side[0]&&services.isCurrent())await services.rename(side[0].id,"侧面视图");
  if(back[0]&&services.isCurrent())await services.rename(back[0].id,"背面视图");
}

export async function generateCanvasAssistantImage(source:Artwork|undefined|null,prompt:string,services:CanvasImageCreationServices){
  const text=prompt.trim();if(!source||!text||!services.isCurrent())return;
  await services.generate(source,text,{count:1,parentId:source.id,refUrls:[source.image],taskLabel:"助手生成中…",userPrompt:"画布助手生成",isCurrent:services.isCurrent});
}

export function canvasBlankImagePrompt(prompt:string,textNodes:CanvasTextNode[],images:Artwork[]){
  return prompt.trim()||textNodes.map(node=>node.content.trim()||node.prompt.trim()).filter(Boolean).join("\n\n")||canvasInheritedImagePrompt(images[0]?.prompt);
}

export function canvasInheritedImagePrompt(prompt?:string){return inheritableImagePrompt(prompt)||FAITHFUL_REGEN_PROMPT;}
