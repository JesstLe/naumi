import {frameRatio} from "../imagegen/frame-ratio";
import type {Artwork} from "../mock-data";
import {readBrowserImage} from "../browser-image-cache";
import {routeImageModel} from "../image-model-routing";
import {ImagegenHttpError} from "../imagegen/http";
import {imageReferenceManifest,type CanvasImageReference} from "./image-references";
import {normalizeCanvasCount,normalizeCanvasRatio,normalizeCanvasResolution} from "./generation-parameters";
import type {CanvasPoint} from "./stable-placement";
import type {CanvasImageTaskScope} from "./image-task-scope";

export type CanvasImageGenerationOptions={ratio?:string;style?:string;count?:number;resolution?:string;transparent?:boolean;ratiogen?:boolean;
  extra?:File[];baseFile?:File;refUrls?:string[];referenceInputs?:CanvasImageReference[];parentId?:string;parentIds?:string[];
  replaceNode?:boolean;operationKey?:string;taskLabel?:string;taskOffset?:number;userPrompt?:string;isCurrent?:()=>boolean};
export type CanvasImageModelOption={id:string;label:string;supportsEdit:boolean;generationParameters?:{ratios?:string[];resolutions?:string[];combinations?:string[]}};
type RequestBase={scope:CanvasImageTaskScope;operationKey:string;position:CanvasPoint;prompt:string;quality:string;model:string;referenceInputs?:CanvasImageReference[]};
export type CanvasImageTaskRequest=RequestBase&({
  kind:"derived";source:Artwork;options:CanvasImageGenerationOptions;models:CanvasImageModelOption[];
}|{
  kind:"blank";ratio:string;resolution:string;style:string;count:number;inputs:Artwork[];textParentId?:string;
});

export async function appendCanvasImageReferences(form:FormData,refs:CanvasImageReference[],current:()=>void=()=>{}){
  for(const ref of refs){
    current();
    if(ref.file)form.append("image",ref.file);
    else{const blob=await readBrowserImage(ref.url);current();form.append("image",new File([blob],`ref-${ref.number}.png`,{type:blob.type||"image/png"}));}
  }
  form.set("canvasReferences",JSON.stringify(imageReferenceManifest(refs)));
}

/** Browser input preparation only. Both node kinds use the same field writer;
 * references remain ordered, lineage stays separate, no quotation/execution here. */
export async function prepareCanvasImageTask(input:CanvasImageTaskRequest){
  const {scope}=input;scope.assertCurrent();const form=new FormData();
  const derived=input.kind==="derived",options=derived?input.options:undefined;
  const chosenRatio=derived?options?.ratio||"auto":input.ratio;
  const ratio=normalizeCanvasRatio(derived&&options?.replaceNode&&chosenRatio==="auto"?(input.source.ratio&&input.source.ratio!=="auto"?input.source.ratio:frameRatio({width:input.source.width||0,height:input.source.height||0}))||"auto":chosenRatio);
  const resolution=normalizeCanvasResolution(derived?options?.resolution||input.source.resolution:input.resolution);
  form.set("prompt",input.prompt.trim());form.set("imagegenNodeId",input.operationKey);
  form.set("imagegenNodeX",String(input.position.x));form.set("imagegenNodeY",String(input.position.y));
  form.set("category",derived?input.source.category||"main":"main");
  form.set("ratio",ratio);form.set("resolution",resolution);form.set("quality",input.quality);
  form.set("style",derived?options?.style||"":input.style||"");
  form.set("count",String(normalizeCanvasCount(derived?options?.count:input.count)));
  if(input.model)form.set("model",derived?routeImageModel(input.model,ratio,input.models):input.model);
  form.set("email",scope.owner);form.set("origin","canvas");
  if(derived){
    if(options?.replaceNode){form.set("canvasTargetNode",input.source.id);form.set("canvasTargetImage",input.source.image);form.set("canvasTargetRevision",String(input.source.canvasImageRevision||0));if(scope.project.startsWith("tree:"))form.set("projectGroupId",scope.project.slice(5));}
    if(options?.userPrompt?.trim())form.set("userPrompt",options.userPrompt.trim());
    if(options?.transparent)form.set("transparent","1");if(options?.ratiogen)form.set("ratiogen","1");
    form.set("parentId",options?.parentId??input.source.id);form.set("parentIds",JSON.stringify(options?.parentIds??[]));
  }else{
    if(scope.project.startsWith("tree:"))form.set("projectGroupId",scope.project.slice(5));
    if(input.inputs.length){form.set("parentId",input.inputs[0].id);form.set("parentIds",JSON.stringify(input.inputs.slice(1).map(art=>art.id)));}
    else if(input.textParentId)form.set("parentId",input.textParentId);
  }
  if(input.referenceInputs)await appendCanvasImageReferences(form,input.referenceInputs,scope.assertCurrent);
  else if(derived){
    if(options?.baseFile)form.append("image",options.baseFile);
    else{
      const urls=(options?.refUrls||[]).filter(Boolean);
      for(const [index,url] of (urls.length?urls:options?.replaceNode?[]:[input.source.image]).entries()){
        scope.assertCurrent();const blob=await readBrowserImage(url);scope.assertCurrent();
        form.append("image",new File([blob],urls.length?`ref-${index}.png`:"base.png",{type:blob.type||"image/png"}));
      }
    }
    for(const file of options?.extra||[])form.append("image",file);
  }else for(const art of input.inputs){
    try{scope.assertCurrent();const blob=await readBrowserImage(art.image);scope.assertCurrent();form.append("image",new File([blob],"ref.png",{type:blob.type||"image/png"}));}
    catch(error){scope.assertCurrent();throw new ImagegenHttpError("参考图片加载失败，请重新选择或上传后再试",0,false);}
  }
  scope.assertCurrent();return form;
}
