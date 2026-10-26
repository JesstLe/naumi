import {videoWorkflowManifestSchema,type VideoWorkflowManifest} from "../../workflow-schema";
import {unsupportedWire} from "../wire-helpers";
import type {VideoWireContext} from "../wire-contracts";
import type {VideoReference} from "../../types";

export function compileWorkflowInputs(context:VideoWireContext):{manifest:VideoWorkflowManifest;body:Record<string,unknown>}{
  const parsed=videoWorkflowManifestSchema.safeParse(context.request.workflowManifest);
  if(!parsed.success)unsupportedWire(context,"工作流输入映射无效或尚未配置");
  const manifest=parsed.data;
  if(manifest.kind!==context.profile)unsupportedWire(context,"工作流manifest与冻结协议不一致");
  const input=context.request,body:Record<string,unknown>=structuredClone(manifest.template||{}),used=new Set<string>(),paths=new Set<string>(),names=new Set<string>(),options=new Set<string>();
  const reference=(refs:VideoReference[],index=0)=>{const ref=refs[index];if(!ref)return undefined;used.add(ref.id);return ref.submissionName||ref.url;};
  for(const item of manifest.inputs){
    const path=item.path.join("\0");if(paths.has(path)||names.has(item.name))unsupportedWire(context,"工作流参数路径或名称重复");paths.add(path);names.add(item.name);
    let value:unknown;
    switch(item.type){
      case "prompt":value=input.prompt;break;case "negativePrompt":value=input.negativePrompt;break;
      case "duration":value=input.durationSeconds;break;case "resolution":value=input.resolution;break;case "aspectRatio":value=input.aspectRatio;break;
      case "generateAudio":value=input.generateAudio;break;case "watermark":value=input.watermark;break;
      case "firstFrame":value=reference(input.references.filter(ref=>ref.role==="first_frame"),item.index);break;
      case "lastFrame":value=reference(input.references.filter(ref=>ref.role==="last_frame"),item.index);break;
      case "image":value=reference(input.references.filter(ref=>ref.kind==="image"&&!["first_frame","last_frame"].includes(ref.role)),item.index);break;
      case "video":value=reference(input.references.filter(ref=>ref.kind==="video"),item.index);break;
      case "audioReference":value=reference(input.references.filter(ref=>ref.kind==="audio"),item.index);break;
      case "custom":value=input.providerOptions?.[item.name];options.add(item.name);break;
    }
    if(value===undefined)value=item.defaultValue;
    if(value===undefined||value===null||value===""){
      if(item.required)unsupportedWire(context,`缺少工作流变量${item.name}`);
      if(value===undefined)continue;
    }
    let target=body;
    for(const key of item.path.slice(0,-1)){
      const existing=target[key];if(existing===undefined)target[key]={};
      else if(!existing||typeof existing!=="object"||Array.isArray(existing))unsupportedWire(context,"工作流变量路径不是对象");
      target=target[key] as Record<string,unknown>;
    }
    target[item.path[item.path.length-1]]=value;
  }
  if(input.references.some(ref=>!used.has(ref.id)))unsupportedWire(context,"工作流存在没有映射的参考素材");
  if(Object.keys(input.providerOptions||{}).some(name=>!options.has(name)))unsupportedWire(context,"工作流存在没有映射的扩展参数");
  return {manifest,body};
}
