import {mapVideoParameters} from './parameters';
import {compileVideoPrompt} from '../prompt';
import {videoDiagnostic,type VideoExecutionDraft,type VideoExecutionIntent,type VideoProfileOutput,type VideoResult} from '../execution-contract';
import type {NativeVideoRecipe} from './native-profile';

const layouts=['grok2api','cogvideox3','agnes','agnes-v25','ark','minimax','metaso'];
export const isReferenceVideoLayout=(layout:string)=>layouts.includes(layout);
const fail=(code:string,field:string,reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic('mapping',code,field,reason,'调整素材用途或明确配置真实协议映射')]});
type Json=VideoProfileOutput['wireTemplate']['body'];

/** Actual reference protocol layouts, not legacy create-codec wrappers. The
 * complete original ordered inputs are consumed; only execution fills slots. */
export function compileReferenceVideoLayout(draft:VideoExecutionDraft,recipe:NativeVideoRecipe,model:string,intent:VideoExecutionIntent,operation:NativeVideoRecipe['operations'][number]):VideoResult<VideoProfileOutput>{
 const media=draft.inputs.filter(i=>i.kind!=='text'),images=media.filter(i=>i.kind==='image'),videos=media.filter(i=>i.kind==='video'),audios=media.filter(i=>i.kind==='audio');
 const first=images.filter(i=>i.role==='first_frame'),last=images.filter(i=>i.role==='last_frame'),ordinary=images.filter(i=>i.role==='reference');
 if(media.some(i=>!['reference','first_frame','last_frame','source_video','source_audio'].includes(i.role)))return fail('INPUT_ROLE_NOT_MAPPABLE','inputs','此协议尚未定义该素材角色');
 if(first.length>1||last.length>1)return fail('FRAME_INPUT_REQUIRED','inputs','首帧和尾帧各只能一张');
 if(intent==='text'&&media.length)return fail('TEXT_INTENT_HAS_MEDIA','inputs','文生意图包含媒体');
 if(intent!=='text'&&!media.length)return fail('FRAME_INPUT_REQUIRED','inputs','媒体意图缺少素材');
 if(intent==='single_image'&&images.length!==1)return fail('SINGLE_MEDIA_REQUIRED','inputs','单图意图需要一张图片');
 if(intent==='frames_required'&&(first.length!==1||last.length!==1))return fail('FRAME_INPUT_REQUIRED','inputs','首尾帧意图缺少明确的首帧或尾帧');
 if(intent==='first_optional'&&last.length!==1||intent==='last_optional'&&first.length!==1)return fail('FRAME_INPUT_REQUIRED','inputs','所选单端帧意图缺少相应角色');
 if((intent==='video_edit'||intent==='extend')&&!videos.length)return fail('SOURCE_VIDEO_REQUIRED','inputs','视频编辑或续写需要来源视频');
 for(const kind of ['image','video','audio'] as const){const items=media.filter(i=>i.kind===kind),rule=operation[({image:'images',video:'videos',audio:'audios'} as const)[kind]];
  if(rule&&(items.length<rule.min||rule.max!==undefined&&items.length>rule.max))return fail('MEDIA_COUNT_OUT_OF_RANGE','inputs','素材数量超出此操作的实际映射');
 }
 const layout=recipe.layout;
 if(['grok2api','cogvideox3','agnes'].includes(layout)){
  if(videos.length||audios.length||layout==='grok2api'&&last.length||layout==='cogvideox3'&&images.length>2||layout==='agnes'&&images.length>7)return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','该图片协议的素材组合没有真实请求映射');
 }
 if(['agnes-v25','minimax','metaso'].includes(layout)&&(first.length||last.length)&&(ordinary.length||videos.length||audios.length))return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','首尾帧不能与混合参考同时映射');
 if(['minimax','metaso'].includes(layout)&&audios.length&&!ordinary.length&&!videos.length)return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','此协议的音频参考需要图片或视频');
 let prompt:string;try{prompt=compileVideoPrompt(draft.prompt,draft.inputs.map(i=>({...i,value:i.kind==='text'?i.value??'':i.nodeId}))).prompt;}catch{return fail('PROMPT_REFERENCE_INVALID','prompt','提示词引用无效');}
 if(operation.requiresPrompt&&!prompt.trim())return fail('PROMPT_REQUIRED','prompt','此操作需要提示词');
 if(operation.maxPromptChars!==undefined&&prompt.length>operation.maxPromptChars)return fail('PROMPT_TOO_LONG','prompt','提示词超出真实协议限制');
 const rules={...recipe.parameters,...operation.parameters},mapped=mapVideoParameters(draft.parameters,rules);if(!mapped.ok)return mapped;
 const {effective,wire}=mapped.value,duration=effective.durationSeconds,resolution=effective.resolution;
 if(typeof duration!=='number'||duration<=0||typeof resolution!=='string'||!resolution.trim()||effective.aspectRatio!==undefined&&typeof effective.aspectRatio!=='string')return fail('BILLING_FACTS_MISSING','parameters','有效时长、分辨率或画幅无效');
 const core=new Set(['durationSeconds','resolution','aspectRatio','width','height']),options:Record<string,Json>={};
 const allowed=layout==='ark'?['generate_audio','watermark','seed','camera_fixed','return_last_frame','draft','service_tier']:layout==='cogvideox3'?['with_audio','seed']:layout==='grok2api'?[]:['seed'];
 for(const [name,rule]of Object.entries(rules)){
  if(!Object.hasOwn(effective,name)||core.has(name))continue;
  if(!Object.hasOwn(wire,name)||!rule.wireField||!allowed.includes(rule.wireField))return fail('PARAMETER_MAPPING_MISSING',name,'参数缺少此原生协议的实际字段');
  if(Object.hasOwn(options,rule.wireField))return fail('WIRE_FIELD_COLLISION',name,'多个参数映射到同一字段');options[rule.wireField]=wire[name];
 }
 const slot=(id:string)=>({$videoAsset:id}),allImages=(intent==='frames_required'?[...first,...last]:images).map(i=>slot(i.id));
 const aspect=effective.aspectRatio;
 let body:Record<string,Json>,path:string;
 if(layout==='grok2api'){
  if(effective.width!==undefined||effective.height!==undefined)return fail('PARAMETER_MAPPING_MISSING','width','Grok2API没有独立宽高字段');
  body={model,prompt,duration,resolution,...(aspect!==undefined&&aspect!=='adaptive'?{aspect_ratio:aspect}:{}),...(images.length===1?{image:{url:allImages[0]}}:images.length?{reference_images:allImages.map(url=>({url}))}:{})};path='/v1/videos/generations';
 }else if(layout==='cogvideox3'||layout==='agnes'){
  let dims:[number,number]|undefined;
  if(effective.width!==undefined||effective.height!==undefined){const w=effective.width,h=effective.height;if(typeof w!=='number'||typeof h!=='number'||!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0)return fail('PARAMETER_VALUE_INVALID','width','显式宽高须为两个正整数');dims=[w,h];}
  else dims=recipe.sizes?.[resolution]?.[typeof aspect==='string'?aspect:'adaptive'];
  if(!dims)return fail('PARAMETER_VALUE_NOT_MAPPABLE','resolution','缺少有效规格到实际宽高的映射');
  if(layout==='cogvideox3')body={model,prompt,quality:resolution==='480p'?'speed':'quality',size:dims.join('x'),duration,...options,...(images.length?{image_url:images.length===1?allImages[0]:allImages}:{})};
  else{
   const schedule=recipe.frameSchedules?.[String(duration)];if(!schedule||Math.abs((schedule.numFrames-1)/schedule.frameRate-duration)>1e-9)return fail('FRAME_SCHEDULE_NOT_MAPPABLE','durationSeconds','时长没有精确对应的帧数与帧率映射，不会静默取整或截短');
   effective.frameRate=schedule.frameRate;effective.numFrames=schedule.numFrames;
   body={model,prompt,num_frames:schedule.numFrames,frame_rate:schedule.frameRate,width:dims[0],height:dims[1],...options,...(images.length===1?{image:allImages[0]}:images.length?{extra_body:{image:allImages,mode:'keyframes'}}:{})};
  }
  path=layout==='cogvideox3'?'/v1/videos/generations':'/v1/videos';
 }else if(layout==='agnes-v25'){
  if(effective.width!==undefined||effective.height!==undefined)return fail('PARAMETER_MAPPING_MISSING','width','此协议通过size规格控制尺寸，没有独立宽高字段');
  body={model,prompt,mode:first.length||last.length?'keyframe':media.length?'reference':'text',seconds:String(duration),size:resolution.toUpperCase(),...(aspect!==undefined?{aspect_ratio:aspect}:{}),...(first.length?{first_frame:slot(first[0].id)}:{}),...(last.length?{last_frame:slot(last[0].id)}:{}),...(ordinary.length?{images:ordinary.map(i=>slot(i.id))}:{}),...(videos.length?{videos:videos.map(i=>({url:slot(i.id)}))}:{}),...(audios.length?{audios:audios.map(i=>slot(i.id))}:{}),...options};path='/v1/videos';
 }else if(layout==='ark'||layout==='minimax'||layout==='metaso'){
  if(effective.width!==undefined||effective.height!==undefined)return fail('PARAMETER_MAPPING_MISSING','width','此协议没有独立宽高字段');
  const content:Json[]=[{type:'text',text:prompt}];for(const item of media){const kind=item.kind,role=item.role==='first_frame'||item.role==='last_frame'?item.role:`reference_${kind}`;content.push({type:`${kind}_url`,[`${kind}_url`]:{url:slot(item.id)},role});}
  if(layout!=='ark'&&(first.length||last.length))effective.aspectRatio='adaptive';
  body={model,content,duration,resolution,...(effective.aspectRatio!==undefined?{ratio:effective.aspectRatio}:{}),...options};path=layout==='ark'?'/contents/generations/tasks':'/v2/video_generation';
 }else return fail('NATIVE_PROFILE_MAPPING_MISSING','layout','原生参考布局没有实现');
 return {ok:true,value:{intent,effectiveParameters:effective,consumedInputIds:draft.inputs.map(i=>i.id),wireTemplate:{method:'POST',path:recipe.createPath??path,encoding:['grok2api','cogvideox3','agnes'].includes(layout)?'inline-json':'json',body},billingFacts:{durationSeconds:duration,resolution,...(typeof effective.aspectRatio==='string'?{aspectRatio:effective.aspectRatio}:{})}}};
}
