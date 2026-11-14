import {mapVideoParameters} from './parameters';
import {compileVideoPrompt} from '../prompt';
import {validateVideoStructure} from '../input-resolver';
import {mapStructuredJson} from './structured-json';
import {validateChannelMedia} from './channel-media';
import {videoDiagnostic,type VideoExecutionDraft,type VideoExecutionIntent,type VideoProfileOutput,type ResolvedVideoAsset,type VideoResult} from '../execution-contract';
import type {NativeVideoRecipe} from './native-profile';
type Json=VideoProfileOutput['wireTemplate']['body'];
type Input=VideoExecutionDraft['inputs'][number];
const fail=(code:string,field:string,reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic('mapping',code,field,reason,'调整输入或明确配置真实协议字段')]});
/** Literal reference mappings are appended, never substituted into user text. */
export function channelReferencePrompt(prompt:string,refs:Input[],family:'h3'|'kling'){
 const counts={image:0,video:0,audio:0},labels={image:'图片',video:'视频',audio:'音频'},native={image:'Picture',video:'Video',audio:'Audio'};
 const mappings=refs.flatMap(i=>{if(i.kind==='text')return [];const n=++counts[i.kind];return family==='kling'?i.kind==='image'?[`${labels.image}${n} = <<<image_${n}>>>`]:[]:[`${labels[i.kind]}${n} = <${native[i.kind]} ${n}>`];});
 return mappings.length?`${prompt}\n\n引用素材对应关系（仅说明本次输入，不改写正文）：\n${mappings.join('\n')}`:prompt;
}
export function compileChannelVideoLayout(draft:VideoExecutionDraft,r:NativeVideoRecipe,model:string,intent:VideoExecutionIntent,op:NativeVideoRecipe['operations'][number],assets?:Record<string,ResolvedVideoAsset>):VideoResult<VideoProfileOutput>{
 const c=r.channel;if(!c)return fail('NATIVE_PROFILE_MAPPING_MISSING','channel','缺少版本化通道字段映射');
 const valid=validateVideoStructure(draft);if(!valid.ok)return valid;
 if(draft.structure?.elements?.length||draft.structure?.shots?.length&&!c.shots)return fail('STRUCTURE_NOT_CONSUMED','structure','此通道尚未映射对应结构');
 const shotIds=new Set(draft.structure?.shots?.flatMap(s=>s.promptInputId?[s.promptInputId]:[])??[]),ordinary=draft.inputs.filter(i=>!shotIds.has(i.id)),media=ordinary.filter(i=>i.kind!=='text'),images=media.filter(i=>i.kind==='image'),videos=media.filter(i=>i.kind==='video'),audios=media.filter(i=>i.kind==='audio');
 let first=images.filter(i=>i.role==='first_frame'),last=images.filter(i=>i.role==='last_frame');
 if(media.some(i=>!['reference','first_frame','last_frame','source_video','source_audio'].includes(i.role)))return fail('INPUT_ROLE_NOT_MAPPABLE','inputs','输入用途没有对应真实字段');
 if(first.length>1||last.length>1)return fail('FRAME_INPUT_REQUIRED','inputs','首尾帧各只能一张');
 if(intent==='text'&&media.length)return fail('TEXT_INTENT_HAS_MEDIA','inputs','文生意图包含媒体');
 if(intent!=='text'&&!media.length)return fail('FRAME_INPUT_REQUIRED','inputs','所选意图缺少媒体');
 if(intent==='single_image'){
  if(images.length!==1||videos.length||audios.length||last.length)return fail('SINGLE_MEDIA_REQUIRED','inputs','单图意图需要一张首帧或普通图片');
  // An ordinary single input can be a first frame, but two ordinary inputs
  // never turn into first/last just because a protocol takes an array.
  first=images;
 }
 const frames=['single_image','frames_required','first_optional','last_optional'].includes(intent);
 if(intent==='frames_required'&&(first.length!==1||last.length!==1)||intent==='first_optional'&&last.length!==1||intent==='last_optional'&&first.length!==1)return fail('FRAME_INPUT_REQUIRED','inputs','此帧意图需要明确对应角色');
 if(frames&&(videos.length||audios.length||images.some(i=>i!==first[0]&&i!==last[0])))return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','首尾帧不能与其他参考素材混用');
 if(intent==='video_edit'&&!videos.length)return fail('SOURCE_VIDEO_REQUIRED','inputs','视频编辑缺少来源视频');
 if(intent==='reference'&&images.some(i=>i.role!=='reference')&&!(c.kind==='apib-kling-feature'&&videos.length&&images.length===1&&first.length===1))return fail('INPUT_ROLE_NOT_MAPPABLE','inputs','普通图片参考不能混入首尾帧角色');
 for(const kind of ['image','video','audio'] as const){const count=media.filter(i=>i.kind===kind).length,rule=op[({image:'images',video:'videos',audio:'audios'} as const)[kind]];if(rule&&(count<rule.min||rule.max!==undefined&&count>rule.max))return fail('MEDIA_COUNT_OUT_OF_RANGE','inputs','媒体数量超出实际操作映射');}
 let prompt:string;try{prompt=compileVideoPrompt(draft.prompt,ordinary.map(i=>({...i,value:i.kind==='text'?i.value??'':i.nodeId}))).prompt;}catch{return fail('PROMPT_REFERENCE_INVALID','prompt','提示词引用无效');}
 if(op.requiresPrompt&&!prompt.trim())return fail('PROMPT_REQUIRED','prompt','此操作需要描述');
 const mapped=mapVideoParameters(draft.parameters,{...r.parameters,...op.parameters});if(!mapped.ok)return mapped;const {effective,wire}=mapped.value,duration=effective.durationSeconds,resolution=effective.resolution,ratio=effective.aspectRatio;
 if(typeof duration!=='number'||!Number.isInteger(duration)||duration<=0||typeof resolution!=='string'||!resolution.trim()||ratio!==undefined&&typeof ratio!=='string')return fail('BILLING_FACTS_MISSING','parameters','有效时长、分辨率或画幅无效');
 if(effective.width!==undefined||effective.height!==undefined)return fail('PARAMETER_MAPPING_MISSING','width','此协议没有独立宽高字段');
 let audio:boolean|undefined,seed:Json|undefined;
 for(const [name,rule]of Object.entries({...r.parameters,...op.parameters})){
  if(!Object.hasOwn(effective,name)||['durationSeconds','resolution','aspectRatio','width','height'].includes(name))continue;
  if(name==='generateAudio'&&c.audio&&rule.wireField==='audio'&&typeof effective[name]==='boolean'&&wire[name]===effective[name])audio=effective[name];
  else if(name==='seed'&&c.kind==='geek-h3'&&rule.wireField==='seed'&&Object.hasOwn(wire,name))seed=wire[name];
  else return fail('PARAMETER_MAPPING_MISSING',name,'参数没有此通道的实际请求字段');
 }
 const slot=(i:Input)=>({$videoAsset:i.id}),urls=(items:Input[])=>items.map(slot),roles=(items:Input[],ordinaryRole=false)=>items.map(i=>({url:slot(i),role:ordinaryRole?'reference_image':intent==='single_image'?'first_frame':i.role}));
 const upper=c.resolutionCase==='upper'?resolution.toUpperCase():c.resolutionCase==='lower'?resolution.toLowerCase():resolution;
 let body:Record<string,Json>,path:string;
 if(c.kind.startsWith('apib-')){
  body={model,prompt,duration};path='/v1/videos/generations';
  if(c.resolutionField==='mode'){const mode=r.modes?.[resolution];if(!mode)return fail('PARAMETER_VALUE_NOT_MAPPABLE','resolution','有效分辨率缺少显式上游mode映射');body.mode=mode;}
  else body.resolution=upper;
  if(audio===true&&(c.audio?.deniedModes?.includes(String(body.mode))||c.audio?.denyLastFrame&&last.length))return fail('AUDIO_PARAMETER_CONFLICT','generateAudio','声音开关与此规格或帧组合不兼容');
  if(c.kind==='apib-flat'){
   if(audios.length||videos.length&&(intent!=='video_edit'||videos.length!==1||images.length))return fail('INPUT_KIND_NOT_MAPPABLE','inputs','此图片/单视频布局没有混合音视频字段');
   if(videos.length)body.video_urls=urls(videos);
   if(images.length){
    const style=frames?c.frameImages:c.referenceImages;
    if(!style)return fail('INPUT_ROLE_NOT_MAPPABLE','inputs','此操作没有明确的图片字段布局');
    if(style==='first-only'){if(images.length!==1||!first.length)return fail('SINGLE_MEDIA_REQUIRED','inputs','此字段只接受首帧');body.first_frame_image=slot(first[0]);}
    else if(style==='named'){if(first[0])body.first_frame_image=slot(first[0]);if(last[0])body.last_frame_image=slot(last[0]);}
    else if(style==='roles')body.image_with_roles=roles(frames?images:images,!frames);
    else body.image_urls=urls(frames?[...first,...last]:images);
   }
   if(audio!==undefined)body.audio=audio;
   if(c.ratio&&ratio!==undefined){const value=c.ratio.mapping?.[ratio]??ratio;
    if(c.ratio.mapping&&!Object.hasOwn(c.ratio.mapping,ratio))return fail('PARAMETER_VALUE_NOT_MAPPABLE','aspectRatio','画幅缺少显式上游映射');
    if(!frames||c.ratio.frames==='value'){if(value!==c.ratio.omitDefault)body[c.ratio.field]=value;}
    else if(c.ratio.frames==='adaptive')body[c.ratio.field]='adaptive';
   }
  }else if(c.kind==='apib-kling-feature'){
   if(audios.length||videos.length>1||videos.length&&(intent!=='reference'||images.length>1||images.length!==first.length))return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','特征视频只能搭配一张明确首帧，没有独立音频字段');
   if(videos.length){if(audio===true)return fail('AUDIO_PARAMETER_CONFLICT','generateAudio','视频参考与音频生成不兼容');body.video_list=videos.map(i=>({video_url:slot(i),refer_type:'feature',keep_original_sound:'no'}));if(first[0])body.image_with_roles=roles(first);}
   else{if(audio!==undefined)body.audio=audio;if(frames)body.image_with_roles=roles(images);else if(images.length)body.image_urls=urls(images);}
   if(intent==='reference')body.prompt=channelReferencePrompt(prompt,images,'kling');if(!frames&&ratio!==undefined)body.aspect_ratio=ratio;
  }else{
   if(audio!==undefined)return fail('PARAMETER_MAPPING_MISSING','generateAudio','此多模态版本不发送独立声音开关');
   if(c.kind==='apib-h3'){
    if(frames){if(first[0])body.first_frame_image=slot(first[0]);if(last[0])body.last_frame_image=slot(last[0]);}
    else{if(ratio!==undefined)body.aspect_ratio=ratio;if(images.length)body.image_urls=urls(images);}
   }else{
    if(ratio!==undefined)body.size=frames?'adaptive':ratio;
    if(c.kind==='apib-wan3'){if(images.length)body.image_with_roles=roles(images,!frames);if(intent==='reference')body.generation_type='reference';}
    else{if(frames)body.image_with_roles=roles(images);else if(images.length)body.image_urls=urls(images);if(c.kind==='apib-seedance25'&&intent==='reference')body.omni_reference_task_type='reference';}
   }
   if(videos.length)body.video_urls=urls(videos);if(audios.length)body.audio_urls=urls(audios);
  }
 }else if(c.kind==='geek-kling'){
  if(videos.length||audios.length||frames&&intent!=='single_image')return fail('INPUT_INTENT_NOT_MAPPABLE','inputs','此Kling布局仅映射首帧或普通图片参考');
  const output:Record<string,Json>={resolution:upper,...(audio!==undefined?{audio_generation:audio?'Enabled':'Disabled'}:{})};if(!frames&&ratio!==undefined)output.aspect_ratio=ratio;
  body={model,prompt,seconds:String(duration),metadata:{output_config:output},...(frames?{image:slot(first[0])}:images.length?{images:urls(images)}:{})};path='/v1/videos';
 }else if(c.kind==='geek-wan'){
  if(audio!==undefined)return fail('PARAMETER_MAPPING_MISSING','generateAudio','Wan没有独立声音字段');
  body={model,prompt,seconds:duration,size:upper,...(!frames&&ratio!==undefined?{aspect_ratio:ratio==='adaptive'?ratio:ratio.replace(':','x')}:{})};path='/v1/videos';
  if(intent==='single_image')body.image=slot(first[0]);
  else if(intent==='frames_required'){body.mode='first-last-frame';body.metadata={first_frame_url:slot(first[0]),last_frame_url:slot(last[0])};}
  else if(intent==='reference'){body.mode='all-reference';if(images.length)body.images=urls(images);if(videos.length||audios.length)body.metadata={...(videos.length?{reference_video_urls:urls(videos)}:{}),...(audios.length?{reference_audio_urls:urls(audios)}:{})};}
  else if(media.length)return fail('INPUT_INTENT_NOT_MAPPABLE','inputs','此操作没有Wan媒体字段');
 }else{
  if(audio!==undefined)return fail('PARAMETER_MAPPING_MISSING','generateAudio','H3声音随模型，不发送独立开关');
  if(audios.length&&!images.length&&!videos.length)return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','H3音频参考需要视觉素材');
  if(c.kind==='geek-h3-multimodal'&&!frames)prompt=channelReferencePrompt(prompt,media,'h3');
  const content:Json[]=[{type:'text',text:prompt}];for(const i of media)content.push({type:`${i.kind}_url`,[`${i.kind}_url`]:{url:slot(i)},role:frames?intent==='single_image'?'first_frame':i.role:`reference_${i.kind}`});
  body={model,content,resolution:upper,duration,...(ratio!==undefined?{ratio}:{}),...(seed!==undefined?{seed}:{})};path=c.kind==='geek-h3'?'/v2/video_generation':'/v1/videos';
 }
 if(op.maxPromptChars!==undefined&&Array.from(String(body.prompt??prompt)).length>op.maxPromptChars||c.kind==='geek-h3-multimodal'&&Array.from(prompt).length>7000)return fail('PROMPT_TOO_LONG','prompt','描述与引用映射超过通道长度');
 const consumed=ordinary.map(i=>i.id),mappedStructure=mapStructuredJson({draft,operation:{shots:c.shots},effective,ordinaryInputs:ordinary,consumed,put:(key,value)=>{if(Object.hasOwn(body,key))return false;body[key]=value;return true;}});if(!mappedStructure.ok)return mappedStructure;
 if(c.shots&&c.kind==='apib-kling-feature'&&intent==='reference'&&draft.structure?.shots?.length){const rows=body[c.shots.wireField];if(Array.isArray(rows))for(const row of rows)if(row&&typeof row==='object'&&!Array.isArray(row))row[c.shots.promptField]=channelReferencePrompt(String(row[c.shots.promptField]),images,'kling');}
 if(assets){const physical=validateChannelMedia(c,media,assets,duration);if(!physical.ok)return physical;}
 return {ok:true,value:{intent,effectiveParameters:effective,consumedInputIds:consumed,...(draft.structure?{consumedStructure:mappedStructure.value}:{}),wireTemplate:{method:'POST',path:r.createPath??path,encoding:'json',body,...(c.kind==='geek-h3-multimodal'?{mediaUrlProtocol:'https' as const}:{})},billingFacts:{durationSeconds:duration,resolution,...(typeof ratio==='string'?{aspectRatio:ratio}:{})}}};
}
