import {z} from 'zod';
import {videoWorkflowManifestSchema} from '../workflow-schema';
import {videoParameterSchema,mapVideoParameters} from './parameters';
import {compileVideoPrompt} from '../prompt';
import {videoDiagnostic,type VideoExecutionDraft,type VideoModelProfile,type VideoResult,type VideoProfileOutput,type ResolvedVideoDraft} from '../execution-contract';

type Json=z.infer<ReturnType<typeof z.json>>;
const path=z.string().regex(/^\/(?!\/)[^?#\s]*$/).max(1000),key=z.string().min(1).max(160).refine(v=>!['__proto__','prototype','constructor'].includes(v));
export const workflowMediaDeliverySchema=z.discriminatedUnion('delivery',[
 z.strictObject({delivery:z.literal('url')}),
 z.strictObject({delivery:z.literal('upload'),path,fileField:key,namePath:z.array(key).min(1).max(8),subfolderPath:z.array(key).min(1).max(8).optional(),form:z.record(key,z.string()).default({})}),
]);
export const workflowVideoRecipeSchema=z.strictObject({
 manifest:videoWorkflowManifestSchema,
 parameters:z.record(key,videoParameterSchema),
 media:z.partialRecord(z.enum(['image','video','audio']),workflowMediaDeliverySchema),
});
export type WorkflowVideoRecipe=z.infer<typeof workflowVideoRecipeSchema>;
const failure=(category:Parameters<typeof videoDiagnostic>[0],code:string,field:string,reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic(category,code,field,reason,'核对工作流模板和输入槽映射')]});
const object=(v:unknown):v is Record<string,Json>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function reserved(v:Json):boolean{return Array.isArray(v)?v.some(reserved):object(v)?Object.entries(v).some(([k,v])=>['__proto__','prototype','constructor'].includes(k)||k.startsWith('$video')||reserved(v)):false;}
function graphValid(body:Record<string,Json>):boolean{
 const visiting=new Set<string>(),done=new Set<string>();
 const visit=(id:string):boolean=>{
  if(done.has(id))return true;if(visiting.has(id))return false;visiting.add(id);
  const node=body[id];if(!object(node)||typeof node.class_type!=='string'||!object(node.inputs))return false;
  for(const value of Object.values(node.inputs))if(Array.isArray(value)&&value.length===2&&(typeof value[0]==='string'||typeof value[0]==='number')&&typeof value[1]==='number'){
   if(!Number.isSafeInteger(value[1])||value[1]<0||!Object.hasOwn(body,String(value[0]))||!visit(String(value[0])))return false;
  }
  visiting.delete(id);done.add(id);return true;
 };
 return Object.keys(body).length>0&&Object.keys(body).every(visit);
}
const aliases:Record<string,string>={negativePrompt:'negativePrompt',duration:'durationSeconds',resolution:'resolution',aspectRatio:'aspectRatio',generateAudio:'generateAudio',watermark:'watermark'};
const kinds:Record<string,'image'|'video'|'audio'>={image:'image',firstFrame:'image',lastFrame:'image',video:'video',audioReference:'audio'};
/** Workflow contract describes DAG slots, never ordinary model modes. Pure
 * compile performs no endpoint probing, upload, credential or task operation. */
export function createWorkflowVideoProfile():VideoModelProfile{
 return {profileId:'workflow-video',version:1,
  describe(binding){const recipe=workflowVideoRecipeSchema.safeParse(binding.recipe);return recipe.success?{ok:true,value:{profileId:'workflow-video',profileVersion:1,bindingRevision:binding.revision,description:recipe.data}}:failure('mapping','WORKFLOW_PROFILE_MAPPING_MISSING','recipe','工作流Profile映射不完整');},
  prepareDraft(draft,contract){const mapped=mapWorkflow(draft,contract.description as WorkflowVideoRecipe);if(!mapped.ok)return mapped;const {intent,effectiveParameters,billingFacts}=mapped.value;return {ok:true,value:{intent,effectiveParameters,billingFacts}};},
  compile(draft,contract){return mapWorkflow({...draft,inputs:draft.inputs.map(input=>({id:input.id,nodeId:input.nodeId,kind:input.kind,role:input.role,value:input.kind==='text'?input.text:input.asset.storageKey}))},contract.description as WorkflowVideoRecipe,draft);},
 };
}
function mapWorkflow(draft:VideoExecutionDraft,recipe:WorkflowVideoRecipe,resolved?:ResolvedVideoDraft):VideoResult<VideoProfileOutput>{
 if(draft.structure)return failure('mapping','WORKFLOW_STRUCTURE_NOT_MAPPED','structure','镜头或元素需要明确的工作流槽位映射');
 if(draft.intentPreference||draft.legacyMode&&draft.legacyMode!=='text')return failure('input','WORKFLOW_MODE_CONFLICT','intentPreference','工作流按已配置输入槽执行，不接受普通视频模式');
 const manifest=recipe.manifest,body=structuredClone(manifest.template??{}) as Record<string,Json>;
 if(reserved(body))return failure('mapping','WORKFLOW_RESERVED_FIELD','template','模板包含保留字段或不合法的键');
 if(manifest.kind==='comfyui'&&!graphValid(body))return failure('input','WORKFLOW_GRAPH_INVALID','template','工作流节点、连线或循环结构无效');
 const mapped=mapVideoParameters(draft.parameters,recipe.parameters);if(!mapped.ok)return mapped;
 const {effective,wire}=mapped.value,used=new Set<string>(),paths:string[][]=[],names=new Set<string>(),consumedParameters=new Set(['durationSeconds','resolution','aspectRatio']);
 let prompt:string;try{prompt=compileVideoPrompt(draft.prompt,draft.inputs.map(input=>({...input,value:input.kind==='text'?input.value??'':input.nodeId}))).prompt;}catch{return failure('input','PROMPT_REFERENCE_INVALID','prompt','工作流描述引用无效');}
 const media=draft.inputs.filter(input=>input.kind!=='text');let promptMapped=false;
 for(const input of media)if(!recipe.media[input.kind as 'image'|'video'|'audio'])return failure('mapping','WORKFLOW_MEDIA_DELIVERY_MISSING','inputs','此媒体类型缺少地址或上传协议映射');
 for(const slot of manifest.inputs){
  if(names.has(slot.name)||paths.some(p=>p.every((v,i)=>v===slot.path[i])||slot.path.every((v,i)=>v===p[i])))return failure('mapping','WORKFLOW_SLOT_COLLISION','inputs','输入槽名称或路径重复、交叠');
  if(manifest.kind==='comfyui'&&(slot.path.length!==3||slot.path[1]!=='inputs'))return failure('mapping','WORKFLOW_SLOT_PATH_INVALID',slot.name,'ComfyUI输入槽必须指向节点inputs字段');
  names.add(slot.name);paths.push(slot.path);
  let value:Json|undefined;
  if(slot.type==='prompt'){value=prompt;promptMapped=true;}
  else if(kinds[slot.type]){
   const candidates=media.filter(input=>input.kind===kinds[slot.type]&&(slot.type==='firstFrame'?input.role==='first_frame':slot.type==='lastFrame'?input.role==='last_frame':slot.type==='image'?!['first_frame','last_frame'].includes(input.role):true));
   const input=candidates[slot.index??0];if(input){used.add(input.id);value={$videoAsset:input.id};}
  }else{
   const name=slot.type==='custom'?slot.name:aliases[slot.type];consumedParameters.add(name);
   const options=object(wire.providerOptions)?wire.providerOptions:undefined;
   if(slot.type==='custom'&&options&&Object.hasOwn(options,slot.name)){
    if(effective[name]!==undefined&&JSON.stringify(effective[name])!==JSON.stringify(options[slot.name]))return failure('input','PARAMETER_CONFLICT',name,'工作流参数存在冲突来源');
    value=options[slot.name];consumedParameters.add('providerOptions');
   }else value=wire[name];
  }
  if(value===undefined)value=slot.defaultValue;
  if(value===undefined||value===null||value===''){if(slot.required)return failure('input','WORKFLOW_SLOT_REQUIRED',slot.name,'缺少必填工作流变量');if(value===undefined)continue;}
  let target=body;
  for(const key of slot.path.slice(0,-1)){
   if(!Object.hasOwn(target,key)){if(manifest.kind==='comfyui')return failure('mapping','WORKFLOW_SLOT_PATH_INVALID',slot.name,'输入槽指向不存在的工作流字段');Object.defineProperty(target,key,{value:{},enumerable:true,writable:true,configurable:true});}
   if(!object(target[key]))return failure('mapping','WORKFLOW_SLOT_PATH_INVALID',slot.name,'输入槽路径不是对象');target=target[key] as Record<string,Json>;
  }
  const key=slot.path.at(-1)!;
  if(manifest.kind==='comfyui'&&!Object.hasOwn(target,key))return failure('mapping','WORKFLOW_SLOT_PATH_INVALID',slot.name,'输入槽字段不存在');
  if(manifest.kind==='comfyui'&&Array.isArray(target[key]))return failure('mapping','WORKFLOW_SLOT_PATH_INVALID',slot.name,'输入槽不能覆盖工作流连线');
  Object.defineProperty(target,key,{value,enumerable:true,writable:true,configurable:true});
 }
 if(prompt.trim()&&!promptMapped)return failure('mapping','WORKFLOW_PROMPT_NOT_MAPPED','prompt','描述没有对应的工作流文本槽');
 if(media.some(input=>!used.has(input.id)))return failure('mapping','INPUT_NOT_CONSUMED','inputs','工作流没有完整映射素材');
 for(const name of Object.keys(effective))if(!consumedParameters.has(name))return failure('mapping','WORKFLOW_PARAMETER_NOT_CONSUMED',name,'工作流没有映射此参数');
 if(object(effective.providerOptions)&&Object.keys(effective.providerOptions).some(name=>!manifest.inputs.some(slot=>slot.type==='custom'&&slot.name===name)))return failure('mapping','WORKFLOW_PARAMETER_NOT_CONSUMED','providerOptions','扩展参数没有对应输入槽');
 // Byte/type/duration facts enter only final compilation, not pending preparation.
 if(resolved&&resolved.inputs.some(input=>input.kind!=='text'&&input.asset.bytes>250*1024*1024))return failure('constraint','WORKFLOW_MEDIA_TOO_LARGE','inputs','上传素材超过协议字节上限');
 const duration=effective.durationSeconds,resolution=effective.resolution,ratio=effective.aspectRatio;
 if(typeof duration!=='number'||!(duration===-1||duration>0)||typeof resolution!=='string'||!resolution)return failure('mapping','BILLING_FACTS_MISSING','parameters','工作流缺少计费事实或显式未知时长');
 let path:string,request:Json;
 if(manifest.kind==='comfyui'){path='/prompt';request={prompt:body,client_id:{$videoContext:'operationId'}};}
 else if(manifest.kind==='runninghub'){
  if(!manifest.workflowId)return failure('mapping','WORKFLOW_ID_REQUIRED','workflowId','缺少远程工作流身份');
  const nodeInfoList:Json[]=[];for(const [nodeId,node] of Object.entries(body)){
   if(!object(node))return failure('mapping','WORKFLOW_GRAPH_INVALID','template','节点输入映射不是对象');const inputs=object(node.inputs)?node.inputs:node;
   for(const [fieldName,fieldValue] of Object.entries(inputs))nodeInfoList.push({nodeId,fieldName,fieldValue});
  }
  path='/task/openapi/create';request={apiKey:{$videoContext:'credential'},workflowId:manifest.workflowId,nodeInfoList};
 }else{if(!manifest.workflowId)return failure('mapping','WORKFLOW_ID_REQUIRED','workflowId','缺少远程工作流身份');path='/api/v1/comfyui/comfyui_workflow/'+encodeURIComponent(manifest.workflowId);request=body;}
 return {ok:true,value:{intent:'workflow',effectiveParameters:effective,consumedInputIds:draft.inputs.map(i=>i.id),wireTemplate:{method:'POST',path,encoding:'workflow',body:request},billingFacts:{durationSeconds:duration,resolution,...(typeof ratio==='string'?{aspectRatio:ratio}:{})}}};
}
