import {parseVideoExecutionDraft,validateVideoStructure} from './input-resolver';
import {createHash} from 'node:crypto';
import {
  videoModelBindingSchema,videoExecutionPolicySchema,resolvedVideoDraftSchema,videoProfileOutputSchema,compiledVideoPlanSchema,videoDiagnostic,videoDraftPreparationSchema,
  type VideoModelProfile,type CompiledVideoPlan,type VideoResult,type VideoExecutionPolicy,type VideoExecutionDraft,type VideoExecutionIntent,type VideoDraftPreparation,
} from './execution-contract';

// Leaf value operation; no model-config/server import or db/billing cycle.
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
function mappedAssets(value:unknown,known:Set<string>,seen:Set<string>):boolean {
  if(Array.isArray(value))return value.every(item=>mappedAssets(item,known,seen));
  if(!value||typeof value!=='object')return true;
  const object=value as Record<string,unknown>;
  if(Object.hasOwn(object,'$videoAsset')){
    if(Object.keys(object).length!==1||typeof object.$videoAsset!=='string'||!known.has(object.$videoAsset))return false;
    seen.add(object.$videoAsset);return true;
  }
  return Object.values(object).every(item=>mappedAssets(item,known,seen));
}

/** Integrity reader for a plan obtained from the trusted task store. A digest
 * is not an authorization token; HTTP callers must never submit their own
 * "compiled" plan. Old task shapes continue through their legacy reader. */
export function readCompiledVideoPlan(raw:unknown):VideoResult<CompiledVideoPlan> {
  const parsed=compiledVideoPlanSchema.safeParse(raw);
  if(!parsed.success)return {ok:false,diagnostics:[videoDiagnostic('internal','INVALID_COMPILED_PLAN','plan','冻结视频计划结构或版本无效','使用对应版本的任务读取器')]};
  const {digest,...payload}=parsed.data;
  const structure=validateVideoStructure({structure:payload.structure,inputs:payload.inputManifest.map(input=>({id:input.id,nodeId:input.nodeId,kind:input.kind,role:input.role}))});
  if(!structure.ok)return structure;
  if(createHash('sha256').update(canonical(payload)).digest('hex')!==digest)
    return {ok:false,diagnostics:[videoDiagnostic('internal','COMPILED_PLAN_DIGEST_MISMATCH','plan','冻结视频计划摘要不一致','核对任务存储，不会重新解释或重发')]};
  return {ok:true,value:freeze({...payload,digest})};
}
function freeze<T>(value:T):T {
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;
}

/** Explicit policy checks shared by pending Workflow preparation and final
 * compilation. Legacy capabilities never enter this function. */
export function checkVideoExecutionPolicy(policy:VideoExecutionPolicy,inputs:VideoExecutionDraft['inputs'],intent?:VideoExecutionIntent):VideoResult<true>{
  if(policy.restrictions.disabled)return {ok:false,diagnostics:[videoDiagnostic('policy','EXECUTION_POLICY_DISABLED','policy','管理员已明确关闭此执行','联系管理员检查执行政策')]};
  for(const kind of ['image','video','audio'] as const){
    const maximum=policy.restrictions.mediaMaximum?.[kind];
    if(maximum!==undefined&&inputs.filter(input=>input.kind===kind).length>maximum)
      return {ok:false,diagnostics:[videoDiagnostic('policy','POLICY_MEDIA_LIMIT','inputs','素材数量超过管理员明确设置的限制','调整素材数量或联系管理员')]};
  }
  if(intent&&policy.restrictions.deniedIntents?.includes(intent))return {ok:false,diagnostics:[videoDiagnostic('policy','EXECUTION_POLICY_DISABLED','intentPreference','管理员已明确关闭此操作','选择其他操作或联系管理员')]};
  return {ok:true,value:true};
}

/** Pending-stage preparation: same Profile and explicit policy, no media facts
 * invented and no final CompiledVideoPlan. Execution later compiles exactly
 * once from real resolved assets and the original requested parameters. */
export function prepareVideoDraftConstraints(args:{profile:VideoModelProfile;binding:unknown;policy:unknown;draft:unknown}):VideoResult<VideoDraftPreparation>{
  const binding=videoModelBindingSchema.safeParse(args.binding),policy=videoExecutionPolicySchema.safeParse(args.policy),draft=parseVideoExecutionDraft(args.draft);
  if(!binding.success||!policy.success)return {ok:false,diagnostics:[videoDiagnostic('mapping','INVALID_VIDEO_BINDING','binding','制作链绑定或政策无效','读取冻结执行配置')]};
  if(!draft.ok)return draft;
  const b=freeze(binding.data),p=freeze(policy.data),d=freeze(draft.value),profile=args.profile;
  if(profile.profileId!==b.profileId||profile.version!==b.profileVersion)return {ok:false,diagnostics:[videoDiagnostic('mapping','PROFILE_VERSION_MISMATCH','binding','制作链协议版本不一致','读取绑定指定版本')]};
  const permitted=checkVideoExecutionPolicy(p,d.inputs);if(!permitted.ok)return permitted;
  if(!profile.prepareDraft)return {ok:false,diagnostics:[videoDiagnostic('mapping','PROFILE_PREPARATION_NOT_CONFIGURED','profile','此协议尚未实现依赖槽与报价准备','完成对应Profile的工作流映射')]};
  try{
    const described=profile.describe(b);if(!described.ok)return described;
    if(described.value.profileId!==b.profileId||described.value.profileVersion!==b.profileVersion||described.value.bindingRevision!==b.revision)return {ok:false,diagnostics:[videoDiagnostic('internal','PROFILE_CONTRACT_MISMATCH','binding','协议描述与执行绑定不一致','检查协议实现')]};
    const result=profile.prepareDraft(d,freeze(described.value),b);if(!result.ok)return result;
    const value=videoDraftPreparationSchema.safeParse(result.value);if(!value.success)return {ok:false,diagnostics:[videoDiagnostic('internal','INVALID_PROFILE_OUTPUT','profile','协议参数准备结果无效','检查协议实现')]};
    const allowed=checkVideoExecutionPolicy(p,d.inputs,value.data.intent);return allowed.ok?{ok:true,value:freeze(value.data)}:allowed;
  }catch{return {ok:false,diagnostics:[videoDiagnostic('internal','PROFILE_PREPARATION_FAILED','profile','制作链参数准备未完成','核对协议映射')]};}
}

/** Pure compile facade. Both preview and submit use this function. No latest
 * capability resolution, task writes, billing or provider I/O is reachable. */
export function compileVideoRequest(args:{profile:VideoModelProfile;binding:unknown;policy:unknown;draft:unknown}):VideoResult<CompiledVideoPlan> {
  const binding=videoModelBindingSchema.safeParse(args.binding),policy=videoExecutionPolicySchema.safeParse(args.policy),draft=resolvedVideoDraftSchema.safeParse(args.draft);
  if(!binding.success||!policy.success||!draft.success)return {ok:false,diagnostics:[videoDiagnostic('input','INVALID_COMPILE_INPUT',!binding.success?'binding':!policy.success?'policy':'draft','视频编译输入结构无效','重新读取有效的执行绑定、政策和素材')]};
  const b=freeze(binding.data),p=freeze(policy.data),d=freeze(draft.data),profile=args.profile;
  if(profile.profileId!==b.profileId||profile.version!==b.profileVersion)
    return {ok:false,diagnostics:[videoDiagnostic('mapping','PROFILE_VERSION_MISMATCH','binding','执行绑定与编译器版本不一致','读取绑定指定的协议版本')]};
  const permitted=checkVideoExecutionPolicy(p,d.inputs);if(!permitted.ok)return permitted;
  // Resolver is an application trust boundary. Reject malformed reconstructed
  // manifests too; never accept an HTTP "already compiled/resolved" claim.
  if(new Set(d.inputs.map(input=>input.id)).size!==d.inputs.length)
    return {ok:false,diagnostics:[videoDiagnostic('input','DUPLICATE_INPUT','inputs','引用身份重复','重新读取素材引用')]};
  try{
    const described=profile.describe(b);if(!described.ok)return described;
    const contract=freeze(described.value);
    if(contract.profileId!==b.profileId||contract.profileVersion!==b.profileVersion||contract.bindingRevision!==b.revision)
      return {ok:false,diagnostics:[videoDiagnostic('internal','PROFILE_CONTRACT_MISMATCH','binding','协议描述与执行绑定不一致','检查协议实现')]};
    const structural=validateVideoStructure(d);if(!structural.ok)return structural;
    const compiled=profile.compile(d,contract,b);if(!compiled.ok)return compiled;
    const output=videoProfileOutputSchema.safeParse(compiled.value);
    if(!output.success)return {ok:false,diagnostics:[videoDiagnostic('internal','INVALID_PROFILE_OUTPUT','profile','协议编译结果结构无效','检查协议实现')]};
    const value=output.data;
    for(const key of ['shots','elements'] as const){
      const expected=d.structure?.[key]?.map(item=>item.id)??[],actual=value.consumedStructure?.[key]??[];
      if(expected.length!==actual.length||expected.some((id,index)=>id!==actual[index]))return {ok:false,diagnostics:[videoDiagnostic('mapping','STRUCTURE_NOT_CONSUMED',key,'协议未完整映射结构化输入及其顺序','配置镜头或元素映射，不会自动丢弃结构')]};
    }
    const intentAllowed=checkVideoExecutionPolicy(p,d.inputs,value.intent);if(!intentAllowed.ok)return intentAllowed;
    const consumed=new Set(value.consumedInputIds),provided=new Set(d.inputs.map(input=>input.id));
    if(consumed.size!==value.consumedInputIds.length||consumed.size!==provided.size||[...consumed].some(id=>!provided.has(id)))
      return {ok:false,diagnostics:[videoDiagnostic('mapping','INPUT_NOT_CONSUMED','inputs','协议没有完整映射当前素材','检查协议输入映射，不会自动丢弃素材')]};
    const media=new Set(d.inputs.filter(input=>input.kind!=='text').map(input=>input.id)),mapped=new Set<string>();
    if(!mappedAssets(value.wireTemplate.body,media,mapped)||mapped.size!==media.size)
      return {ok:false,diagnostics:[videoDiagnostic('mapping','INVALID_MEDIA_SLOT','inputs','请求模板未正确绑定全部媒体身份','修正协议模板中的素材槽')]};
    const payload:Omit<CompiledVideoPlan,'digest'>={schemaVersion:b.profileId==='native-video'?(d.structure?5:4):value.intent==='workflow'?3:d.structure?2:1,
      identity:{publicModelId:b.publicModelId,wireModel:b.wireModel,connectionId:b.connectionId,profileId:b.profileId,profileVersion:b.profileVersion,bindingRevision:b.revision,policyRevision:p.revision},
      binding:b,policy:p,
      scope:d.scope,intent:value.intent,originalPrompt:d.prompt,...(d.structure?{structure:d.structure}:{}),requestedParameters:d.parameters,
      effectiveParameters:value.effectiveParameters,inputManifest:d.inputs,wireTemplate:value.wireTemplate,billingFacts:value.billingFacts};
    const digest=createHash('sha256').update(canonical(payload)).digest('hex');
    return {ok:true,value:freeze({...payload,digest})};
  }catch{
    return {ok:false,diagnostics:[videoDiagnostic('internal','PROFILE_COMPILE_FAILED','profile','视频协议编译失败','检查协议实现与执行绑定')]};
  }
}
