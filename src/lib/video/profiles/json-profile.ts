import {videoParameterSchema,mapVideoParameters} from './parameters';
import {shotsMapping,elementsMapping,mapStructuredJson} from './structured-json';
import {z} from 'zod';
import {validateVideoStructure} from '../input-resolver';
import {deriveVideoIntent} from '../intent';
import {compileVideoPrompt} from '../prompt';
import {
  videoIntentSchema,videoInputRoleSchema,videoDiagnostic,
  type VideoModelProfile,type PublishedVideoModelBinding,type ResolvedVideoDraft,type ResolvedVideoInput,type VideoExecutionDraft,
  type VideoResult,type VideoProfileOutput,type VideoInputContract,
} from '../execution-contract';

const field=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/).refine(name=>!['__proto__','prototype','constructor'].includes(name));
const primitive=z.union([z.string(),z.number().finite(),z.boolean(),z.null()]);
const range=z.strictObject({min:z.number().int().nonnegative().default(0),max:z.number().int().nonnegative().optional(),
  maxBytes:z.number().int().positive().optional(),maxDurationSeconds:z.number().finite().positive().optional(),totalDurationSeconds:z.number().finite().positive().optional(),
}).refine(v=>v.max===undefined||v.max>=v.min);
const mediaMapping=z.strictObject({kind:z.enum(['image','video','audio']),roles:z.array(videoInputRoleSchema).optional(),
  wireField:field,shape:z.enum(['urls','roles','single']),roleMap:z.record(z.string(),z.string().min(1)).optional(),
  order:z.array(videoInputRoleSchema).optional(),
});
export const jsonVideoRecipeSchema=z.strictObject({
  createPath:z.string().regex(/^\/(?!\/)[^?#\s]*$/),modelField:field,promptField:field,bodyField:field.optional(),
  defaults:z.strictObject({ordinaryImage:z.enum(['single_image','reference']).optional(),sourceVideo:z.enum(['video_edit','reference']).optional()}).default({}),
  parameters:z.record(field,videoParameterSchema),
  operations:z.array(z.strictObject({intent:videoIntentSchema,requiresPrompt:z.boolean().optional(),
    maxPromptChars:z.number().int().positive().optional(),images:range.optional(),videos:range.optional(),audios:range.optional(),
    shots:shotsMapping.optional(),elements:elementsMapping.optional(),
    parameters:z.record(field,videoParameterSchema).optional(),media:z.array(mediaMapping).default([]),
    parameterCombinations:z.array(z.record(field,z.array(primitive).min(1))).min(1).optional(),
  })).min(1),
}).superRefine((recipe,ctx)=>{
  if(recipe.bodyField===recipe.modelField)ctx.addIssue({code:'custom',message:'请求包装字段与模型字段冲突'});
  if(new Set(recipe.operations.map(operation=>operation.intent)).size!==recipe.operations.length)ctx.addIssue({code:'custom',message:'协议操作重复'});
});
type Recipe=z.infer<typeof jsonVideoRecipeSchema>;
type Operation=Recipe['operations'][number];
type Json=z.infer<ReturnType<typeof z.json>>;
type MediaInput=Extract<ResolvedVideoInput,{asset:unknown}>;
const fail=(category:Parameters<typeof videoDiagnostic>[0],code:string,field:string,reason:string,actionable:string,inputId?:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic(category,code,field,reason,actionable,inputId)]});

/** Parameter-driven JSON protocol family. An unpublished/unknown model name
 * does not trigger a separate allowlist: the exact published binding supplies
 * the recipe. Other protocol families implement the same Profile interface. */
export function createJsonVideoProfile(profileId:string,version:number):VideoModelProfile {
  return {profileId,version,
    describe(binding:PublishedVideoModelBinding):VideoResult<VideoInputContract>{
      const recipe=jsonVideoRecipeSchema.safeParse(binding.recipe);
      if(!recipe.success)return fail('mapping','PROFILE_MAPPING_MISSING','binding.recipe','视频协议映射不完整或无效','配置该通道的请求字段与输入映射');
      return {ok:true,value:{profileId,profileVersion:version,bindingRevision:binding.revision,description:recipe.data}};
    },
    prepareDraft(draft,_contract,binding){return prepareJsonVideoDraft(draft,binding);},
    compile(draft,contract,binding){
      const recipe=contract.description as Recipe;
      const intent=deriveVideoIntent(draft,recipe.defaults);if(!intent.ok)return intent;
      const operation=recipe.operations.find(value=>value.intent===intent.value);
      if(!operation)return fail('mapping','INPUT_INTENT_NOT_MAPPABLE','intentPreference','此执行绑定没有该操作的请求映射','配置对应操作或选择其他执行绑定');
      return compileJson(draft,binding,recipe,operation);
    },
  };
}
function compileJson(draft:ResolvedVideoDraft,binding:PublishedVideoModelBinding,recipe:Recipe,operation:Operation):VideoResult<VideoProfileOutput> {
  for(const kind of ['image','video','audio'] as const){
    const items=draft.inputs.filter((input):input is MediaInput=>input.kind===kind),rule=operation[({image:'images',video:'videos',audio:'audios'} as const)[kind]];
    if(rule&&items.some(input=>rule.maxBytes!==undefined&&input.asset.bytes>rule.maxBytes||rule.maxDurationSeconds!==undefined&&(input.asset.durationSeconds??0)>rule.maxDurationSeconds))
      return fail('constraint','MEDIA_PROPERTIES_OUT_OF_RANGE','inputs','素材大小或时长超过协议限制','调整素材规格');
    if(rule?.totalDurationSeconds!==undefined&&items.reduce((sum,input)=>sum+(input.asset.durationSeconds??0),0)>rule.totalDurationSeconds)
      return fail('constraint','MEDIA_TOTAL_DURATION_OUT_OF_RANGE','inputs','参考素材总时长超过协议限制','缩短参考素材');
  }
  return mapJsonDraft({...draft,inputs:draft.inputs.map(input=>({id:input.id,nodeId:input.nodeId,kind:input.kind,role:input.role,value:input.kind==='text'?input.text:input.asset.storageKey}))},binding,recipe,operation);
}

/** Structural/parameter preparation is shared with final compilation, but has
 * no resolved media claims or CompiledVideoPlan. Workflow uses only its quote
 * facts until real dependencies exist; no fake MIME, bytes, hash or duration. */
function prepareJsonVideoDraft(draft:VideoExecutionDraft,binding:PublishedVideoModelBinding):VideoResult<Pick<VideoProfileOutput,'intent'|'effectiveParameters'|'billingFacts'>>{
  const parsed=jsonVideoRecipeSchema.safeParse(binding.recipe);if(!parsed.success)return fail('mapping','PROFILE_MAPPING_MISSING','binding.recipe','视频协议映射不完整或无效','配置协议映射');
  const recipe=parsed.data,intent=deriveVideoIntent(draft,recipe.defaults);if(!intent.ok)return intent;
  const operation=recipe.operations.find(value=>value.intent===intent.value);if(!operation)return fail('mapping','INPUT_INTENT_NOT_MAPPABLE','intentPreference','此执行绑定没有该操作的请求映射','配置对应操作');
  const result=mapJsonDraft(draft,binding,recipe,operation);if(!result.ok)return result;
  return {ok:true,value:{intent:result.value.intent,effectiveParameters:result.value.effectiveParameters,billingFacts:result.value.billingFacts}};
}
function mapJsonDraft(draft:VideoExecutionDraft,binding:PublishedVideoModelBinding,recipe:Recipe,operation:Operation):VideoResult<VideoProfileOutput> {
  const validated=validateVideoStructure(draft);if(!validated.ok)return validated;
  const structure=draft.structure,shotText=new Set(structure?.shots?.flatMap(shot=>shot.promptInputId?[shot.promptInputId]:[])??[]),elementIds=new Set(structure?.elements?.flatMap(element=>element.inputIds)??[]);
  const ordinaryInputs=draft.inputs.filter(input=>!shotText.has(input.id)&&!elementIds.has(input.id));
  const media=ordinaryInputs.filter(input=>input.kind!=='text');
  if(structure?.shots?.length&&!operation.shots)return fail('mapping','STRUCTURED_SHOTS_MAPPING_MISSING','shots','此操作缺少结构化分镜映射','配置镜头请求字段');
  if(structure?.elements?.length&&!operation.elements)return fail('mapping','STRUCTURED_ELEMENTS_MAPPING_MISSING','elements','此操作缺少元素分组映射','配置元素及其素材字段');
  const role=(input:VideoExecutionDraft['inputs'][number])=>operation.intent==='single_image'&&input.kind==='image'&&input.role==='reference'?'first_frame':input.role;
  if(operation.intent==='text'&&(media.length||elementIds.size))return fail('input','TEXT_INTENT_HAS_MEDIA','inputs','文生操作中存在媒体输入','选择与媒体用途一致的生成意图');
  if(operation.intent==='frames_required'&&(media.filter(input=>input.kind==='image'&&input.role==='first_frame').length!==1||media.filter(input=>input.kind==='image'&&input.role==='last_frame').length!==1))
    return fail('input','FRAME_INPUT_REQUIRED','inputs','首尾帧操作需要明确的一张首帧和一张尾帧','为两张图片明确指定首帧和尾帧');
  for(const kind of ['image','video','audio'] as const){
    const items=draft.inputs.filter(input=>input.kind===kind),rule=operation[({image:'images',video:'videos',audio:'audios'} as const)[kind]];
    if(media.some(input=>input.kind===kind)&&!operation.media.some(mapping=>mapping.kind===kind))return fail('mapping','INPUT_KIND_NOT_MAPPABLE','inputs','此操作没有该媒体类型的请求映射','配置媒体输入映射或选择其他操作',items[0].id);
    if(rule&&(items.length<rule.min||rule.max!==undefined&&items.length>rule.max))return fail('constraint','MEDIA_COUNT_OUT_OF_RANGE','inputs','媒体数量不符合此协议操作的约束','调整媒体数量');

  }
  let prompt:string;
  try{prompt=compileVideoPrompt(draft.prompt,ordinaryInputs.map(input=>({...input,value:input.kind==='text'?input.value??'':input.nodeId}))).prompt;}
  catch{return fail('input','PROMPT_REFERENCE_INVALID','prompt','提示词引用与当前素材不一致','重新插入引用或移除失效标记');}
  if(operation.requiresPrompt&&!prompt.trim())return fail('input','PROMPT_REQUIRED','prompt','此操作需要视频描述','填写视频描述');
  if(operation.maxPromptChars!==undefined&&prompt.length>operation.maxPromptChars)return fail('constraint','PROMPT_TOO_LONG','prompt','视频描述超过协议限制','缩短描述，不会自动截断');
  const body:Record<string,Json>={},effective:Record<string,Json>={};
  const put=(name:string,value:Json):boolean=>{if(Object.hasOwn(body,name))return false;body[name]=value;return true;};
  if(!put(recipe.modelField,binding.wireModel)||!put(recipe.promptField,prompt))return fail('mapping','WIRE_FIELD_COLLISION','binding.recipe','模型和提示词字段冲突','修正协议字段映射');
  const parameters={...recipe.parameters,...operation.parameters};
  const mapped=mapVideoParameters(draft.parameters,parameters);if(!mapped.ok)return mapped;
  Object.assign(effective,mapped.value.effective);
  for(const [name,value] of Object.entries(mapped.value.wire)){
    const rule=parameters[name];if(!rule.wireField)return fail('mapping','PARAMETER_MAPPING_MISSING',name,'参数缺少上游字段','配置字段映射');
    if(!put(rule.wireField,value))return fail('mapping','WIRE_FIELD_COLLISION',name,'多个参数映射到同一上游字段','修正协议字段映射');
  }
  const consumed=ordinaryInputs.filter(input=>input.kind==='text').map(input=>input.id);
  if(operation.parameterCombinations&&!operation.parameterCombinations.some(combination=>Object.entries(combination).every(([key,values])=>values.some(value=>value===effective[key]))))
    return fail('constraint','PARAMETER_COMBINATION_INVALID','parameters','时长、分辨率或其他参数不属于协议允许的组合','选择符合当前操作的参数组合');
  for(const mapping of operation.media){
    const inputs=media.filter(input=>input.kind===mapping.kind&&(!mapping.roles||mapping.roles.includes(role(input))));
    if(!inputs.length)continue;
    if(inputs.some(input=>consumed.includes(input.id)))return fail('mapping','DUPLICATE_MEDIA_MAPPING','inputs','同一素材被多个映射重复消费','修正素材用途映射');
    if(mapping.shape==='single'&&inputs.length!==1)return fail('constraint','SINGLE_MEDIA_REQUIRED','inputs','此协议字段只接受一个素材','调整素材数量');
    if(mapping.shape==='roles'&&mapping.roleMap&&inputs.some(input=>!Object.hasOwn(mapping.roleMap!,role(input))))
      return fail('mapping','INPUT_ROLE_NOT_MAPPABLE','inputs','素材用途缺少上游角色映射','补齐角色映射，不会猜测上游字段');
    if(operation.intent==='frames_required'&&mapping.shape==='urls'&&inputs.length>1&&!mapping.order)
      return fail('mapping','FRAME_ORDER_MAPPING_MISSING','inputs','首尾帧数组未声明上游角色顺序','配置首帧和尾帧的数组顺序');
    if(mapping.order){
      if(inputs.some(input=>!mapping.order!.includes(role(input))))return fail('mapping','INPUT_ROLE_NOT_MAPPABLE','inputs','素材用途没有声明数组位置','补齐角色顺序映射');
      inputs.sort((a,b)=>mapping.order!.indexOf(role(a))-mapping.order!.indexOf(role(b)));
    }
    const slots=inputs.map(input=>({$videoAsset:input.id}));
    const value=mapping.shape==='single'?slots[0]:mapping.shape==='urls'?slots:inputs.map((input,index)=>({url:slots[index],role:mapping.roleMap?.[role(input)]??role(input)}));
    if(!put(mapping.wireField,value))return fail('mapping','WIRE_FIELD_COLLISION','inputs','素材字段与其他请求字段冲突','修正协议字段映射');
    consumed.push(...inputs.map(input=>input.id));
  }
  if(media.some(input=>!consumed.includes(input.id)))return fail('mapping','INPUT_ROLE_NOT_MAPPABLE','inputs','此素材用途没有对应的协议字段','配置该用途或调整素材角色');
  const structured=mapStructuredJson({draft,operation,effective,ordinaryInputs,consumed,put});if(!structured.ok)return structured;
  const consumedStructure=structured.value;
  const duration=effective.durationSeconds,resolution=effective.resolution,aspectRatio=effective.aspectRatio;
  if(typeof duration!=='number'||!(duration===-1||duration>0)||typeof resolution!=='string'||!resolution.trim()||aspectRatio!==undefined&&typeof aspectRatio!=='string')
    return fail('mapping','BILLING_FACTS_MISSING','parameters','协议未生成完整计费事实','配置有效时长、分辨率与画幅参数');
  return {ok:true,value:{intent:operation.intent,effectiveParameters:effective,consumedInputIds:consumed,...(structure?{consumedStructure}:{}),
    wireTemplate:{method:'POST',path:recipe.createPath,encoding:'json',body:recipe.bodyField?{[recipe.modelField]:body[recipe.modelField],[recipe.bodyField]:Object.fromEntries(Object.entries(body).filter(([key])=>key!==recipe.modelField))}:body},
    billingFacts:{durationSeconds:duration,resolution,...(typeof aspectRatio==='string'?{aspectRatio}:{})}}};
}
