import {createHash} from 'node:crypto';
import declared from './video-execution-presets.json';
import {publishedVideoExecutionSchema,type PublishedVideoExecution} from '../video/published-execution';
import {videoWireProfileSchema,type VideoWireProfile,videoProfileProtocol} from '../video/capability-schema';
import {ModelConfigError,type ModelConfig,type UpstreamModel,type ModelProvider} from './types';
import {canonicalConfig} from './snapshot-value';
import {mapVideoParameters} from '../video/profiles/parameters';

type Identity={upstreamId:string;providerId:string;model:string};
export type VideoExecutionPatch=Identity&({field:'parameterMap.videoExecution';before?:PublishedVideoExecution;after:PublishedVideoExecution}|{field:'parameterMap.videoProfile';before?:VideoWireProfile;after:VideoWireProfile});
export type VideoExecutionReviewRow={publicId:string;label:string;status:'ready'|'current'|'mapping_required';beforeProfiles:string[];afterProfiles:string[];intents:string[];fields:string[];reason?:string};
export type VideoExecutionReview={version:number;rows:VideoExecutionReviewRow[];publicIds:string[];reviewDigest:string};
const same=(a:unknown,b:unknown)=>canonicalConfig(a)===canonicalConfig(b);
const fail=(field:string,message:string):never=>{throw new ModelConfigError('VIDEO_EXECUTION_MAPPING_REQUIRED',message,422,[field]);};

/** A proposal for an explicitly identified protocol/model, never a runtime
 * model-name gate. Unknown channels remain editable via the execution editor. */
export function proposedVideoExecution(upstream:UpstreamModel,provider:ModelProvider):{profile:VideoWireProfile;execution:PublishedVideoExecution}{
 const profile=upstream.parameterMap.videoProfile??provider.options?.videoProfile;
 const candidates=declared.items.filter(item=>item.model===upstream.model&&profile&&item.previousProfiles.includes(profile as never)&&videoProfileProtocol(videoWireProfileSchema.parse(item.profile))===provider.protocol);
 const entry=candidates.find(item=>item.providerId===provider.id)??(candidates.length===1?candidates[0]:undefined);
 if(!entry)return fail('videoExecution','请为此通道显式配置执行字段映射');
 const execution=publishedVideoExecutionSchema.parse(structuredClone(entry.execution));
 if(execution.profileId!=='native-video')return fail('videoExecution','执行配方类型无效');
 const map=upstream.parameterMap,recipe=execution.recipe,manual=upstream.capabilities.video;
 if(provider.options?.createPath)recipe.createPath=provider.options.createPath;
 if(map.qualityPolicy||map.resolutionPolicy||map.videoWorkflow||map.quality&&Object.keys(map.quality).length)return fail('parameterMap','已有独立参数契约，请在执行编辑器中核对后迁移');
 if(map.resolution&&Object.keys(map.resolution).length){
  // Requested presentation values remain requested values. Do not rewrite
  // the legacy field or translate them a second time on the wire boundary.
  const values=structuredClone(map.resolution),preferred=manual?.defaultResolution??recipe.parameters.resolution.default;
  const aliases=Object.keys(values).filter(k=>values[k as keyof typeof values]===preferred);
  // An explicit display choice wins. A native default may be translated back
  // only when there is one unambiguous display choice. Never silently replace
  // an administrator default with the first mapping entry.
  if(!Object.hasOwn(values,String(preferred))&&manual?.defaultResolution!=null&&aliases.length!==1)
   return fail('defaultResolution','已有默认分辨率与参数映射不一致或对应多个显示选项，请明确默认选项后迁移');
  const fallback=Object.hasOwn(values,String(preferred))?String(preferred):aliases.length===1?aliases[0]:Object.keys(values)[0];
  recipe.parameters.resolution={...recipe.parameters.resolution,mapping:values,default:fallback};
  for(const operation of recipe.operations)if(operation.parameters?.resolution)operation.parameters.resolution={...operation.parameters.resolution,mapping:values,default:fallback};
 }
 for(const [old,name] of [['defaultDurationSeconds','durationSeconds'],['defaultResolution','resolution'],['defaultAspectRatio','aspectRatio']] as const){
  const value=manual?.[old];if(value===undefined||value===null||name==='resolution'&&recipe.parameters.resolution.mapping)continue;
  if(recipe.parameters[name])recipe.parameters[name]={...recipe.parameters[name],default:value};
  for(const operation of recipe.operations)if(operation.parameters?.[name])operation.parameters[name]={...operation.parameters[name],default:value};
 }
 for(const [name,option]of Object.entries(manual?.providerOptions??{})){
  const prior=recipe.parameters[name]??recipe.operations.find(op=>op.parameters?.[name])?.parameters?.[name];
  if(option.send!=='omit'&&!prior)return fail('providerOptions.'+name,'已有人工参数缺少真实字段映射，请核对后迁移');
  // Operation-specific rules take precedence at compile time. Apply explicit
  // administrator choices there too; otherwise an override could resurrect an
  // omitted field or replace its published default on just one input mode.
  for(const rules of [recipe.parameters,...recipe.operations.filter(op=>op.parameters?.[name]).map(op=>op.parameters!)]){
   if(option.send==='omit'){rules[name]={type:option.type==='enum'?'string':option.type,send:'omit'};continue;}
   rules[name]={...(rules[name]??prior!),...(option.defaultValue!==undefined?{default:option.defaultValue}:{}),...(option.minimum!==undefined?{minimum:option.minimum}:{}),...(option.maximum!==undefined?{maximum:option.maximum}:{}),...(option.values?{values:option.values}:{})};
  }
 }

 // Use the same value mapper as the compiler, not another capability matrix.
 // Reject only a proposed default that the resulting executable field rules
 // themselves cannot map; no input/model support is inferred here.
 for(const rules of [recipe.parameters,...recipe.operations.map(op=>({...recipe.parameters,...op.parameters}))])
  for(const [name,rule] of Object.entries(rules))if(rule.default!==undefined){
   const mapped=mapVideoParameters({[name]:rule.default},{[name]:rule});
   if(!mapped.ok)return fail('parameters.'+name,'已有默认参数与执行字段映射不一致，请核对默认值后迁移');
  }

 return {profile:videoWireProfileSchema.parse(entry.profile),execution:publishedVideoExecutionSchema.parse(execution)};
}

function routeIds(config:ModelConfig,publicId:string){
 const model=config.publicModels.find(m=>m.id===publicId);if(!model||model.modality!=='video'||model.target.type!=='upstream')return [];
 return [...new Set([model.target.id,...(model.supplierRouting?.channels.map(c=>c.upstreamId)??[])])];
}
export function planVideoExecutionMigration(source:ModelConfig,publicIds:string[]){
 const config=structuredClone(source),patches:VideoExecutionPatch[]=[],seen=new Set<string>();
 if(new Set(publicIds).size!==publicIds.length)throw new ModelConfigError('INVALID_CONFIG','执行迁移条目重复',400);
 for(const id of publicIds){
  const ids=routeIds(source,id);if(!ids.length)return fail('publicModels.'+id,'公开模型没有明确的视频执行通道');
  for(const upstreamId of ids){if(seen.has(upstreamId))continue;seen.add(upstreamId);
   const upstream=config.upstreamModels.find(u=>u.id===upstreamId),provider=config.providers.find(p=>p.id===upstream?.providerId);
   if(!upstream||!provider||upstream.modality!=='video')return fail('upstreamModels.'+upstreamId,'执行通道身份不存在');
   if(upstream.parameterMap.videoExecution)continue; // Explicit published configuration always wins.
   const proposed=proposedVideoExecution(upstream,provider),identity={upstreamId,providerId:provider.id,model:upstream.model};
   const before=upstream.parameterMap.videoProfile;
   if(before!==proposed.profile){patches.push({...identity,field:'parameterMap.videoProfile',...(before!==undefined?{before}:{}),after:proposed.profile});upstream.parameterMap.videoProfile=proposed.profile;}
   patches.push({...identity,field:'parameterMap.videoExecution',after:proposed.execution});upstream.parameterMap.videoExecution=proposed.execution;
  }
 }
 return {config,patches};
}
export function reviewVideoExecutionMigration(config:ModelConfig,version:number):VideoExecutionReview{
 const rows:VideoExecutionReviewRow[]=config.publicModels.filter(m=>m.modality==='video').map(model=>{
  const ids=routeIds(config,model.id),routes=ids.map(id=>config.upstreamModels.find(u=>u.id===id)).filter((u):u is UpstreamModel=>!!u);
  const beforeProfiles=routes.map(u=>u.parameterMap.videoExecution?.profileId??u.parameterMap.videoProfile??config.providers.find(p=>p.id===u.providerId)?.options?.videoProfile??'unmapped');
  try{const plan=planVideoExecutionMigration(config,[model.id]),next=ids.map(id=>plan.config.upstreamModels.find(u=>u.id===id)!),intents=[...new Set(next.flatMap(u=>{const e=u.parameterMap.videoExecution;return e&&e.profileId!=='workflow-video'?e.recipe.operations.map(op=>op.intent):[];}))];
   return {publicId:model.id,label:model.label,status:plan.patches.length?'ready':'current',beforeProfiles,afterProfiles:next.map(u=>u.parameterMap.videoExecution?.profileId??'unmapped'),intents,fields:[...new Set(plan.patches.map(p=>p.field))]};
  }catch(error){if(!(error instanceof ModelConfigError))throw error;return {publicId:model.id,label:model.label,status:'mapping_required',beforeProfiles,afterProfiles:[],intents:[],fields:[],reason:error.message};}
 });
 const publicIds=rows.filter(r=>r.status==='ready').map(r=>r.publicId),plan=planVideoExecutionMigration(config,publicIds);
 // Bind review to every existing field and disabled state, not only the patch.
 const reviewDigest=createHash('sha256').update(canonicalConfig({version,source:config,publicIds,patches:plan.patches})).digest('hex');
 return {version,rows,publicIds,reviewDigest};
}
export function applyReviewedVideoExecutionMigration(config:ModelConfig,version:number,digest:string,publicIds:string[]){
 const review=reviewVideoExecutionMigration(config,version);
 if(review.reviewDigest!==digest||!same(review.publicIds,publicIds))throw new ModelConfigError('CONFIG_CONFLICT','执行配置或迁移范围已变化，请重新预览',409);
 if(!publicIds.length)throw new ModelConfigError('VIDEO_EXECUTION_CURRENT','没有待迁移的执行绑定',409);
 return planVideoExecutionMigration(config,publicIds);
}
export function rollbackVideoExecutionMigration(current:ModelConfig,patches:VideoExecutionPatch[]):ModelConfig{
 const config=structuredClone(current);
 for(const patch of [...patches].reverse()){
  const row=config.upstreamModels.find(u=>u.id===patch.upstreamId),key=patch.field==='parameterMap.videoProfile'?'videoProfile':'videoExecution';
  if(!row||row.providerId!==patch.providerId||row.model!==patch.model||!same(row.parameterMap[key],patch.after))throw new ModelConfigError('CONFIG_CONFLICT','执行迁移字段已被修改，回退冲突',409);
  if(patch.before===undefined)delete row.parameterMap[key];else Object.assign(row.parameterMap,{[key]:structuredClone(patch.before)});
 }
 return config;
}
