import {NESTED_VIDEO_LAYOUTS,deriveNestedVideoIntent,compileNestedVideoLayout,isNestedVideoLayout,nestedVideoIntents,nestedVideoProtocol} from './nested-layouts';
import {z} from 'zod';
import {videoParameterSchema,mapVideoParameters} from './parameters';
import {compileReferenceVideoLayout,isReferenceVideoLayout} from './reference-layouts';
import {deriveVideoIntent} from '../intent';
import {compileVideoPrompt} from '../prompt';
import {videoDiagnostic,videoIntentSchema,type VideoModelProfile,type VideoExecutionDraft,type VideoProfileOutput,type VideoResult} from '../execution-contract';

const field=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const count=z.strictObject({min:z.number().int().nonnegative().default(0),max:z.number().int().nonnegative().optional(),maxBytes:z.number().int().positive().optional(),maxDurationSeconds:z.number().positive().optional(),totalDurationSeconds:z.number().positive().optional()}).refine(v=>v.max===undefined||v.max>=v.min);
/** Native families own nested layout/physical limits; bindings own published
 * semantic parameters and available operations. No model-name inference. */
export const nativeVideoRecipeSchema=z.strictObject({
 layout:z.enum(['openai-videos','openai-legacy','gemini','grok2api','cogvideox3','agnes','agnes-v25','ark','minimax','metaso',...NESTED_VIDEO_LAYOUTS]),
 queryTransport:z.literal('direct').optional(),
 frameSchedules:z.record(z.string().min(1),z.strictObject({frameRate:z.number().int().positive(),numFrames:z.number().int().min(9).max(441).refine(n=>(n-1)%8===0)})).optional(),
 createPath:z.string().regex(/^\/(?!\/)[^?#\s]*$/).optional(),
 // Exact published semantic resolution/ratio -> physical request size.
 sizes:z.record(z.string().min(1),z.record(z.string().min(1),z.tuple([z.number().int().positive(),z.number().int().positive()]))).optional(),
 defaults:z.strictObject({ordinaryImage:z.enum(['single_image','reference']).optional(),sourceVideo:z.enum(['video_edit','reference']).optional()}).default({}),
 parameters:z.record(field,videoParameterSchema),
 operations:z.array(z.strictObject({intent:videoIntentSchema,requiresPrompt:z.boolean().optional(),maxPromptChars:z.number().int().positive().optional(),images:count.optional(),videos:count.optional(),audios:count.optional(),parameters:z.record(field,videoParameterSchema).optional()})).min(1),
}).superRefine((v,ctx)=>{
 if(new Set(v.operations.map(o=>o.intent)).size!==v.operations.length)ctx.addIssue({code:'custom',message:'原生协议操作重复'});
 const core=['durationSeconds','resolution','aspectRatio','width','height'];
 for(const rules of [v.parameters,...v.operations.map(o=>o.parameters??{})])for(const [name,rule]of Object.entries(rules)){
  if(core.includes(name)&&rule.send!=='omit'&&(rule.send!=='semantic'||rule.wireField!==undefined||rule.wireMapping!==undefined))ctx.addIssue({code:'custom',message:'原生核心参数须使用semantic映射，wire字段归协议编译器'});
 }
 const intents=nestedVideoIntents(v.layout)??(['agnes-v25','ark','minimax','metaso'].includes(v.layout)?['text','single_image','frames_required','first_optional','last_optional','reference','video_edit','extend']:['gemini','cogvideox3','agnes','compshare-hailuo'].includes(v.layout)?['text','single_image','frames_required','reference']:['text','single_image','reference']);
 if(v.operations.some(o=>!intents.includes(o.intent)))ctx.addIssue({code:'custom',message:'操作缺少此原生协议的真实字段布局'});
 if(v.queryTransport==='direct'&&!['ark','minimax','gemini'].includes(v.layout))ctx.addIssue({code:'custom',message:'此原生布局没有对应的direct查询解码器'});
 if(v.createPath&&v.layout==='gemini'&&!v.createPath.includes('{model}'))ctx.addIssue({code:'custom',message:'Gemini自定义路径须声明模型位置'});
});
export type NativeVideoRecipe=z.infer<typeof nativeVideoRecipeSchema>;
/** Query/decoder selection is part of the same frozen transport contract. */
export function nativeVideoQueryMatches(layout:NativeVideoRecipe['layout'],profile:string|undefined,protocol:string,queryTransport?:'direct'):boolean{
 if(queryTransport==='direct')return !profile&&['ark','minimax','gemini'].includes(layout)&&protocol===layout;
 return layout==='openai-legacy'?!profile&&protocol==='openai-videos':profile===layout&&protocol===(nestedVideoProtocol(layout)??(['gemini','ark','minimax','metaso'].includes(layout)?layout:'openai-videos'));
}
const fail=(code:string,field:string,reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic('mapping',code,field,reason,'调整输入或修正已发布协议映射')]});
type Json=VideoProfileOutput['wireTemplate']['body'];

export function createNativeVideoProfile():VideoModelProfile {
 return {profileId:'native-video',version:1,
  describe(binding){const recipe=nativeVideoRecipeSchema.safeParse(binding.recipe);return recipe.success?{ok:true,value:{profileId:'native-video',profileVersion:1,bindingRevision:binding.revision,description:recipe.data}}:fail('NATIVE_PROFILE_MAPPING_MISSING','recipe','原生协议映射无效');},
  prepareDraft(draft,contract,binding){const result=mapDraft(draft,contract.description as NativeVideoRecipe,binding.wireModel);if(!result.ok)return result;const {intent,effectiveParameters,billingFacts}=result.value;return {ok:true,value:{intent,effectiveParameters,billingFacts}};},
  compile(draft,contract,binding){
   // Byte size is a real materialization limit, not legacy metadata permission.
   if(['openai-videos','openai-legacy','gemini','grok2api','cogvideox3','agnes','compshare-hailuo'].includes((contract.description as NativeVideoRecipe).layout)&&draft.inputs.some(i=>i.kind!=='text'&&i.asset.bytes>12*1024*1024))return fail('MEDIA_PROPERTIES_OUT_OF_RANGE','inputs','原生内联图片超过12MiB字节限制');
   const recipe=contract.description as NativeVideoRecipe;
   const intent=deriveNestedVideoIntent(draft,recipe.layout)??deriveVideoIntent(draft,recipe.defaults);if(!intent.ok)return intent;
   const operation=recipe.operations.find(o=>o.intent===intent.value);
   for(const kind of ['image','video','audio'] as const){
    const rule=operation?.[({image:'images',video:'videos',audio:'audios'} as const)[kind]],items=draft.inputs.filter(i=>i.kind===kind);
    if(rule&&(items.some(i=>i.kind!=='text'&&(rule.maxBytes!==undefined&&i.asset.bytes>rule.maxBytes||rule.maxDurationSeconds!==undefined&&(i.asset.durationSeconds??0)>rule.maxDurationSeconds))||rule.totalDurationSeconds!==undefined&&items.reduce((n,i)=>n+(i.kind==='text'?0:i.asset.durationSeconds??0),0)>rule.totalDurationSeconds))return fail('MEDIA_PROPERTIES_OUT_OF_RANGE','inputs','素材真实大小或时长超过协议约束');
   }
   return mapDraft({...draft,inputs:draft.inputs.map(i=>({id:i.id,nodeId:i.nodeId,kind:i.kind,role:i.role,value:i.kind==='text'?i.text:i.asset.storageKey}))},contract.description as NativeVideoRecipe,binding.wireModel);
  }};
}

function mapDraft(draft:VideoExecutionDraft,recipe:NativeVideoRecipe,model:string):VideoResult<VideoProfileOutput>{
 if(draft.structure)return fail('STRUCTURE_NOT_CONSUMED','structure','此原生协议尚未映射镜头或元素分组');
 const intent=deriveNestedVideoIntent(draft,recipe.layout)??deriveVideoIntent(draft,recipe.defaults);if(!intent.ok)return intent;
 const operation=recipe.operations.find(o=>o.intent===intent.value);if(!operation)return fail('INPUT_INTENT_NOT_MAPPABLE','intentPreference','此绑定没有该输入意图的协议映射');
 const media=draft.inputs.filter(i=>i.kind!=='text'),images=media.filter(i=>i.kind==='image');
 if(isNestedVideoLayout(recipe.layout))return compileNestedVideoLayout(draft,recipe,model,intent.value,operation);
 if(isReferenceVideoLayout(recipe.layout))return compileReferenceVideoLayout(draft,recipe,model,intent.value,operation);
 if(media.length!==images.length||images.some(i=>!['reference','first_frame','last_frame'].includes(i.role)))return fail('INPUT_ROLE_NOT_MAPPABLE','inputs','此原生协议仅接受图片参考或首尾帧');
 const first=images.filter(i=>i.role==='first_frame'),last=images.filter(i=>i.role==='last_frame'),ordinary=images.filter(i=>i.role==='reference');
 if(first.length>1||last.length>1)return fail('FRAME_INPUT_REQUIRED','inputs','首帧和尾帧各只能有一张');
 if(intent.value==='text'&&media.length)return fail('TEXT_INTENT_HAS_MEDIA','inputs','文生意图包含图片');
 if(intent.value!=='text'&&!media.length)return fail('FRAME_INPUT_REQUIRED','inputs','图片生成意图缺少图片输入');
 if(intent.value==='frames_required'&&(first.length!==1||last.length!==1))return fail('FRAME_INPUT_REQUIRED','inputs','首尾帧意图需要明确的一张首帧和一张尾帧');
 if(!['text','single_image','frames_required','reference'].includes(intent.value))return fail('INPUT_INTENT_NOT_MAPPABLE','intentPreference','该意图没有此协议的真实字段');
 if(intent.value==='single_image'&&images.length!==1)return fail('SINGLE_MEDIA_REQUIRED','inputs','单图意图需要恰好一张图片');
 if(recipe.layout==='gemini'){
  if(last.length&&!first.length||ordinary.length&&(first.length||last.length)||ordinary.length>3)return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','Gemini首尾帧不能与普通参考混用，普通参考最多三张');
 }else if(images.length>1||last.length)return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','OpenAI视频请求仅映射一张输入图片');
 if(operation.images&&(images.length<operation.images.min||operation.images.max!==undefined&&images.length>operation.images.max))return fail('MEDIA_COUNT_OUT_OF_RANGE','inputs','图片数量不符合已发布操作映射');
 let prompt:string;try{prompt=compileVideoPrompt(draft.prompt,draft.inputs.map(i=>({...i,value:i.kind==='text'?i.value??'':i.nodeId}))).prompt;}catch{return fail('PROMPT_REFERENCE_INVALID','prompt','提示词引用失效');}
 if(operation.requiresPrompt&&!prompt.trim())return fail('PROMPT_REQUIRED','prompt','此操作需要提示词');
 if(operation.maxPromptChars!==undefined&&prompt.length>operation.maxPromptChars)return fail('PROMPT_TOO_LONG','prompt','提示词超过真实协议限制');
 const rules={...recipe.parameters,...operation.parameters},mapped=mapVideoParameters(draft.parameters,rules);if(!mapped.ok)return mapped;
 const {effective,wire}=mapped.value,duration=effective.durationSeconds,resolution=effective.resolution,aspectRatio=effective.aspectRatio;
 if(typeof duration!=='number'||duration<=0||typeof resolution!=='string'||!resolution.trim()||aspectRatio!==undefined&&typeof aspectRatio!=='string')return fail('BILLING_FACTS_MISSING','parameters','原生协议缺少有效的时长、分辨率或画幅');
 const val=(key:string)=>Object.hasOwn(wire,key)?wire[key]:effective[key];
 if(Number(val('durationSeconds'))!==duration)return fail('BILLING_FACTS_MISMATCH','durationSeconds','wire时长与有效计费时长不一致，数值变化应配置在语义映射');
 if(recipe.layout==='gemini'&&(effective.width!==undefined||effective.height!==undefined))return fail('PARAMETER_MAPPING_MISSING','width','Gemini请求没有独立宽高字段，请明确不发送或配置分辨率');
 const core=new Set(['durationSeconds','resolution','aspectRatio','width','height']);
 const options:Record<string,Json>={};
 const allowed=recipe.layout==='gemini'?['negativePrompt','seed','personGeneration','numberOfVideos','sampleCount','enhancePrompt']:recipe.layout==='openai-legacy'&&!images.length?['negative_prompt','generate_audio','watermark']:[];
 for(const [name,rule]of Object.entries(rules)){
  if(!Object.hasOwn(effective,name)||core.has(name))continue;
  if(!Object.hasOwn(wire,name)||!rule.wireField||!allowed.includes(rule.wireField))return fail('PARAMETER_MAPPING_MISSING',name,'此参数没有对应的原生请求字段，须显式映射或不发送');
  if(Object.hasOwn(options,rule.wireField))return fail('WIRE_FIELD_COLLISION',name,'原生参数字段重复');options[rule.wireField]=wire[name];
 }
 const slot=(id:string)=>({$videoAsset:id});
 let body:Record<string,Json>,encoding:'json'|'multipart'|'inline-json',path:string;
 if(recipe.layout==='gemini'){
  const inline=(id:string)=>({inlineData:slot(id)});
  const instance:Record<string,Json>={prompt,...(first.length?{image:inline(first[0].id)}:{}),...(last.length?{lastFrame:inline(last[0].id)}:{})};
  // An ordinary single image stays an asset reference, matching the native
  // protocol. A first-frame role maps to image, never silently swaps roles.
  if(ordinary.length)instance.referenceImages=ordinary.map(i=>({image:inline(i.id),referenceType:'asset'}));
  body={instances:[instance],parameters:{durationSeconds:val('durationSeconds'),resolution:val('resolution'),...(aspectRatio!==undefined?{aspectRatio:val('aspectRatio')}:{}),...options}};
  encoding='inline-json';path=(recipe.createPath??'/v1beta/models/{model}:predictLongRunning').replaceAll('{model}',encodeURIComponent(model));
 }else{
  let size:string;
  const width=effective.width,height=effective.height;
  if(width!==undefined||height!==undefined){if(typeof width!=='number'||typeof height!=='number'||!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)return fail('PARAMETER_VALUE_INVALID','width','显式尺寸需要两个正整数');size=`${val('width')}x${val('height')}`;}
  else if(recipe.layout==='openai-legacy')size=String(val('resolution'));
  else{
   const ratio=typeof aspectRatio==='string'?aspectRatio:'adaptive',dims=recipe.sizes?.[resolution]?.[ratio];
   if(!dims)return fail('PARAMETER_VALUE_NOT_MAPPABLE','resolution','有效分辨率和画幅缺少明确的物理尺寸映射');
   size=dims.join('x');
  }
  body={model,prompt,seconds:String(val('durationSeconds')),size,...options,...(images.length?{input_reference:slot(images[0].id)}:{})};
  encoding=recipe.layout==='openai-videos'||images.length?'multipart':'json';path=recipe.createPath??'/v1/videos';
 }
 return {ok:true,value:{intent:intent.value,effectiveParameters:effective,consumedInputIds:draft.inputs.map(i=>i.id),wireTemplate:{method:'POST',path,encoding,body},billingFacts:{durationSeconds:duration,resolution,...(typeof aspectRatio==='string'?{aspectRatio}:{})}}};
}
