import {VideoContractError} from './contract';
import {parseVideoExecutionDraft} from './input-resolver';
import {type VideoExecutionDraft} from './execution-contract';
import type {CreateVideoInput} from './submission-types';
import type {VideoReference} from './types';

/** Compatibility is an ingress translation, not another capability decision.
 * All values remain user-facing; Profile performs semantic/wire mapping once. */
export function videoSubmissionDraftValue(input:CreateVideoInput,keyFromUrl:(url:string)=>string|null=relativeMediaKey):VideoExecutionDraft {
  if(input.shots?.length||input.elements?.length||input.workflowManifest||input.workflowTaskId)
    throw new VideoContractError('STRUCTURED_INPUT_MAPPING_REQUIRED','此结构化输入需要对应的分镜、元素或工作流Profile映射',['inputs']);
  const references=[...(input.references||[])];
  if(input.artworkId)references.unshift({id:input.artworkId,artworkId:input.artworkId,kind:'image',role:'first_frame'});
  else if(input.imageUrl)references.unshift({id:'legacy-first-frame',kind:'image',role:'first_frame',url:input.imageUrl});
  const refById=new Map(references.map(ref=>[ref.id,ref]));
  if(refById.size!==references.length)throw new VideoContractError('DUPLICATE_INPUT','引用身份重复',['references']);
  const media=(ref:VideoReference)=>{
    const key=ref.storageKey||(ref.url?keyFromUrl(ref.url):null);
    if(!ref.artworkId&&!key)throw new VideoContractError('VIDEO_INPUT_UNAVAILABLE','请先将引用媒体上传到受控媒体库',['references']);
    // With an artwork ID, the resolver re-reads that identity. Client URL or
    // metadata cannot replace or authorize a different asset.
    return {id:ref.id,nodeId:ref.artworkId||`upload:${ref.id}`,kind:ref.kind,role:ref.role,
      ...(!ref.artworkId?{storageKey:key!}:{})};
  };
  const used=new Set<string>();
  const inputs=input.orderedInputs?input.orderedInputs.map(item=>{
    if(item.kind==='text')return {...item};
    const ref=refById.get(item.id);
    if(!ref)return {...item}; // Native node identity is resolved by the owner.
    if(ref.kind!==item.kind||ref.role!==item.role)throw new VideoContractError('INPUT_IDENTITY_MISMATCH','输入顺序与媒体类型或角色不一致',['inputs']);
    used.add(ref.id);return media(ref);
  }):references.map(ref=>{used.add(ref.id);return media(ref);});
  if(references.some(ref=>!used.has(ref.id)))throw new VideoContractError('UNCONSUMED_INPUT','引用媒体未包含在完整输入序列中',['inputs']);
  const parameters={...input.parameters};
  const assign=(name:string,value:unknown)=>{
    if(value===undefined)return;
    if(Object.hasOwn(parameters,name)&&JSON.stringify(parameters[name])!==JSON.stringify(value))throw new VideoContractError('PARAMETER_CONFLICT','同一参数存在冲突值',[name]);
    parameters[name]=value as VideoExecutionDraft['parameters'][string];
  };
  assign('durationSeconds',input.durationSeconds??(input.seconds?.trim()?Number(input.seconds):undefined));
  assign('resolution',input.resolution??(input.size?.trim()?input.size:undefined));
  for(const name of ['negativePrompt','aspectRatio','width','height','generateAudio','watermark'] as const)assign(name,input[name]);
  if(input.providerOptions&&Object.keys(input.providerOptions).length)assign('providerOptions',input.providerOptions);
  if(input.camera&&Object.values(input.camera).some(Boolean))assign('camera',input.camera);
  const parsed=parseVideoExecutionDraft({prompt:input.prompt,parameters,inputs,...(input.intentPreference?{intentPreference:input.intentPreference}:{}),...(input.mode?{legacyMode:input.mode}:{})});
  if(!parsed.ok)throw new VideoContractError(parsed.diagnostics[0].code,parsed.diagnostics[0].reason,['inputs']);
  return parsed.value;
}

function relativeMediaKey(value:string):string|null {
 if(!value.startsWith("/media/")||value.startsWith("//"))return null;
 try{const key=decodeURIComponent(value.split("?",1)[0].slice(7));return key&&!key.startsWith("/")&&!key.includes("..")&&!/[\\\0]/.test(key)?key:null;}catch{return null;}
}
