import {mapVideoParameters} from './parameters';
import {compileVideoPrompt} from '../prompt';
import {readVideoIntentPreference} from '../intent';
import {validateVideoStructure} from '../input-resolver';
import {mapStructuredJson} from './structured-json';
import {jobStructureMaps,isJobVideoLayout} from './job-structure';
import {videoDiagnostic,type VideoExecutionDraft,type VideoExecutionIntent,type VideoProfileOutput,type ResolvedVideoAsset,type VideoResult} from '../execution-contract';
import type {NativeVideoRecipe} from './native-profile';
type Json=VideoProfileOutput['wireTemplate']['body'];
const fail=(code:string,field:string,reason:string):VideoResult<never>=>({ok:false,diagnostics:[videoDiagnostic('mapping',code,field,reason,'调整输入或明确配置实际请求映射')]});
export function deriveJobVideoIntent(draft:VideoExecutionDraft,layout:string):VideoResult<VideoExecutionIntent>|undefined{
 if(!isJobVideoLayout(layout)||readVideoIntentPreference(draft))return undefined;
 const elementIds=new Set(draft.structure?.elements?.flatMap(e=>e.inputIds)??[]),media=draft.inputs.filter(i=>i.kind!=='text'&&!elementIds.has(i.id));
 if(layout.endsWith('motion-control')&&media.filter(i=>i.kind==='image').length===1&&media.filter(i=>i.kind==='video').length===1&&!media.some(i=>i.kind==='audio'))return {ok:true,value:'motion_control'};
 if(layout==='kie-kling-omni-transform'&&media.some(i=>i.kind==='video'))return {ok:true,value:media.some(i=>i.kind==='image')?'reference':'video_edit'};
 if(layout==='kie-kling-omni-reference'&&(media.length||elementIds.size))return {ok:true,value:media.some(i=>i.kind==='video')&&!media.some(i=>i.kind==='image')&&!elementIds.size?'video_edit':'reference'};
 return undefined;
}
/** Source duration semantics are shared by preparation and final compile. */
export function jobDurationSource(draft:VideoExecutionDraft,layout:string):string|undefined{
 const grouped=new Set(draft.structure?.elements?.flatMap(e=>e.inputIds)??[]),media=draft.inputs.filter(i=>i.kind!=='text'&&!grouped.has(i.id));
 const videos=media.filter(i=>i.kind==='video'),images=media.filter(i=>i.kind==='image');
 return videos.length===1&&(layout.endsWith('motion-control')||layout==='kie-kling-omni-reference'&&!images.length&&!grouped.size||layout==='kie-kling-omni-transform'&&!images.length)?videos[0].id:undefined;
}
export function compileJobVideoLayout(draft:VideoExecutionDraft,r:NativeVideoRecipe,model:string,intent:VideoExecutionIntent,op:NativeVideoRecipe['operations'][number],assets?:Record<string,ResolvedVideoAsset>):VideoResult<VideoProfileOutput>{
 const valid=validateVideoStructure(draft);if(!valid.ok)return valid;
 const layout=r.layout,kie=layout.startsWith('kie-'),omni=layout.startsWith('kie-kling-omni-'),motion=layout.endsWith('motion-control');
 const maps=jobStructureMaps(layout),shots=draft.structure?.shots??[],elements=draft.structure?.elements??[],elementIds=new Set(elements.flatMap(e=>e.inputIds)),shotTexts=new Set(shots.flatMap(s=>s.promptInputId?[s.promptInputId]:[])),ordinaryInputs=draft.inputs.filter(i=>!elementIds.has(i.id)&&!shotTexts.has(i.id));
 const media=ordinaryInputs.filter(i=>i.kind!=='text'),images=media.filter(i=>i.kind==='image'),videos=media.filter(i=>i.kind==='video'),audios=media.filter(i=>i.kind==='audio'),first=images.filter(i=>i.role==='first_frame'),last=images.filter(i=>i.role==='last_frame');
 if(shots.length&&!maps.shots||elements.length&&!maps.elements)return fail('STRUCTURE_NOT_CONSUMED','structure','当前协议布局没有对应分镜或元素字段');
 if(media.some(i=>!['reference','first_frame','last_frame','source_video','source_audio'].includes(i.role)))return fail('INPUT_ROLE_NOT_MAPPABLE','inputs','素材用途没有对应协议字段');
 if(first.length>1||last.length>1)return fail('FRAME_INPUT_REQUIRED','inputs','首帧和尾帧各只能一张');
 if(intent==='text'&&media.length)return fail('TEXT_INTENT_HAS_MEDIA','inputs','文生意图携带媒体');
 if(intent!=='text'&&!media.length&&!elements.length)return fail('FRAME_INPUT_REQUIRED','inputs','媒体意图缺少素材');
 if(intent==='single_image'&&images.length!==1)return fail('SINGLE_MEDIA_REQUIRED','inputs','单图意图需要一张图片');
 if(intent==='frames_required'&&(first.length!==1||last.length!==1))return fail('FRAME_INPUT_REQUIRED','inputs','首尾帧意图需要明确首帧和尾帧');
 if((intent==='video_edit'||intent==='extend')&&!videos.length)return fail('SOURCE_VIDEO_REQUIRED','inputs','视频操作缺少来源视频');
 for(const kind of ['image','video','audio'] as const){const count=draft.inputs.filter(i=>i.kind===kind).length,rule=op[({image:'images',video:'videos',audio:'audios'} as const)[kind]];if(rule&&(count<rule.min||rule.max!==undefined&&count>rule.max))return fail('MEDIA_COUNT_OUT_OF_RANGE','inputs','素材数量超过此操作的真实映射');}
 if(motion&&(images.length!==1||videos.length!==1||audios.length))return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','运动控制需要一张图片和一个运动视频');
 const kling=['kie-kling','kie-kling-v26','apimart-kling','apimart-kling-v26'].includes(layout);
 if(kling&&(images.length>2||videos.length||audios.length))return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','此Kling分支最多两张图片');
 if(omni){
  const max=layout==='kie-kling-omni-transform'?4:layout==='kie-kling-omni-image'?2:layout==='kie-kling-omni-text'?0:30;
  if(audios.length||videos.length>1||images.length>max)return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','Omni独立音频或素材数量没有该分支映射');
  if(layout==='kie-kling-omni-text'&&media.length||layout==='kie-kling-omni-image'&&(!images.length||videos.length)||layout==='kie-kling-omni-transform'&&!videos.length||layout==='kie-kling-omni-reference'&&!media.length&&!elements.length)return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','Omni分支与真实输入不一致');
 }
 if(layout==='apimart-kling-omni'&&(images.length>7||videos.length>1||audios.length))return fail('NATIVE_MEDIA_COMBINATION_INVALID','inputs','此Omni布局最多七图和一个视频，没有独立音频字段');
 let prompt:string;try{prompt=compileVideoPrompt(draft.prompt,ordinaryInputs.map(i=>({...i,value:i.kind==='text'?i.value??'':i.nodeId}))).prompt;}catch{return fail('PROMPT_REFERENCE_INVALID','prompt','提示词引用无效');}
 if(op.requiresPrompt&&!prompt.trim())return fail('PROMPT_REQUIRED','prompt','此操作需要提示词');
 if(op.maxPromptChars!==undefined&&prompt.length>op.maxPromptChars)return fail('PROMPT_TOO_LONG','prompt','提示词超过真实协议限制');
 const rules={...r.parameters,...op.parameters},mapped=mapVideoParameters(draft.parameters,rules);if(!mapped.ok)return mapped;const {effective,wire}=mapped.value;
 if(typeof effective.resolution!=='string'||!effective.resolution.trim()||effective.aspectRatio!==undefined&&typeof effective.aspectRatio!=='string')return fail('BILLING_FACTS_MISSING','resolution','有效分辨率或画幅无效');
 const sourceId=jobDurationSource(draft,layout),sourceDuration=sourceId!==undefined;
 if(sourceDuration){
  if(rules.durationSeconds?.send!=='omit')return fail('PARAMETER_MAPPING_MISSING','durationSeconds','此操作继承来源视频时长，请明确不发送时长');
  if(shots.length)return fail('STRUCTURE_NOT_CONSUMED','shots','仅来源视频操作没有指定分镜字段');
  const duration=sourceId?assets?.[sourceId]?.durationSeconds:undefined;
  if(assets&&!(typeof duration==='number'&&duration>0))return fail('SOURCE_DURATION_UNAVAILABLE','inputs','来源视频真实时长缺失');
  effective.durationSeconds=duration??-1;
 }else if(typeof effective.durationSeconds!=='number'||effective.durationSeconds<=0)return fail('BILLING_FACTS_MISSING','durationSeconds','缺少有效输出时长');
 if(effective.width!==undefined||effective.height!==undefined)return fail('PARAMETER_MAPPING_MISSING','width','此协议没有独立宽高字段');
 const options:Record<string,Json>={},core=['durationSeconds','resolution','aspectRatio','width','height'];
 const allowed=['seed','mode','character_orientation','keep_original_sound','cfg_scale','return_last_frame','watermark',...(kie?['prefer_multi_shots']:['multi_shot']),...(motion?[]:omni?['audio']:kling?[layout.endsWith('v26')?'sound':kie?'sound':'audio']:layout==='apimart-kling-omni'?['audio']:['generate_audio']),...(!motion&&!omni&&layout!=='kie-kling'?['negative_prompt']:[])];
 for(const [name,rule]of Object.entries(rules)){
  if(!Object.hasOwn(effective,name)||core.includes(name))continue;if(!Object.hasOwn(wire,name)||!rule.wireField||!allowed.includes(rule.wireField))return fail('PARAMETER_MAPPING_MISSING',name,'参数没有此分支的真实字段');
  if(Object.hasOwn(options,rule.wireField))return fail('WIRE_FIELD_COLLISION',name,'参数字段重复');options[rule.wireField]=wire[name];
 }
 const modeRequired=motion||kling||layout==='apimart-kling-omni';
 if(modeRequired){const mode=r.modes?.[effective.resolution];if(!mode)return fail('PARAMETER_VALUE_NOT_MAPPABLE','resolution','有效分辨率缺少显式mode映射');if(options.mode!==undefined&&options.mode!==mode)return fail('PARAMETER_COMBINATION_INVALID','mode','显式mode与有效分辨率不一致');options.mode=mode;}
 else if(omni&&options.mode!==undefined)return fail('PARAMETER_MAPPING_MISSING','mode','Omni没有mode字段，不会静默删除');
 if(layout.endsWith('v26')&&![5,10].includes(Number(effective.durationSeconds)))return fail('PARAMETER_VALUE_INVALID','durationSeconds','此Kling2.6协议时长为五秒或十秒');
 if(motion&&effective.aspectRatio!==undefined)return fail('PARAMETER_MAPPING_MISSING','aspectRatio','运动控制没有画幅字段，请明确不发送');
 if(omni&&(layout==='kie-kling-omni-image'&&images.length>1||layout==='kie-kling-omni-reference'&&videos.length||layout==='kie-kling-omni-transform'&&!images.length))effective.aspectRatio='auto';
 if((layout==='kie-kling-omni-reference'||layout==='apimart-kling-omni')&&videos.length){if(options.audio===true)return fail('AUDIO_PARAMETER_CONFLICT','audio','视频参考分支不生成音频');if(kie)options.audio=false;else if(options.audio!==undefined)delete options.audio;}
 if(shots.length){if(options.prefer_multi_shots===true||options.multi_shot===true)return fail('SHOT_PARAMETER_CONFLICT','shots','智能分镜与显式镜头不能同时执行');delete options.prefer_multi_shots;delete options.multi_shot;}
 else if(omni&&options.prefer_multi_shots!==undefined){if(layout==='kie-kling-omni-reference'||layout==='kie-kling-omni-transform')return fail('PARAMETER_MAPPING_MISSING','prefer_multi_shots','此Omni分支没有智能分镜字段');options.customize_multi_shots=false;}
 else if(layout==='kie-kling'&&options.prefer_multi_shots!==undefined)return fail('PARAMETER_MAPPING_MISSING','prefer_multi_shots','Kling3没有智能分镜字段');
 const slot=(id:string)=>({$videoAsset:id}),orderedImages=(intent==='frames_required'?[...first,...last]:images).map(i=>slot(i.id)),values:Record<string,Json>={prompt,...(!sourceDuration?{duration:kie&&!omni?String(effective.durationSeconds):effective.durationSeconds}:{}),...(!motion&&effective.aspectRatio!==undefined?{aspect_ratio:effective.aspectRatio}:{}),...(!modeRequired||kie&&motion?{resolution:effective.resolution}:{}),...(images.length?{image_urls:orderedImages}:{}),...(videos.length?{video_urls:videos.map(i=>slot(i.id))}:{}),...(audios.length?{audio_urls:audios.map(i=>slot(i.id))}:{}),...options};
 if(motion){values.character_orientation??='image';if(!kie){values.image_url=orderedImages[0];values.video_url=slot(videos[0].id);delete values.image_urls;delete values.video_urls;}}
 if(layout==='kie-generic'||layout==='apimart-generic'){if(first[0])values.first_frame_url=slot(first[0].id);if(last[0])values.last_frame_url=slot(last[0].id);}
 if(layout==='apimart-kling-omni'){delete values.video_urls;if(videos.length)values.video_list=videos.map(i=>({video_url:slot(i.id),refer_type:'base',keep_original_sound:'no'}));}
 if(!shots.length&&layout==='apimart-kling'&&options.multi_shot===true)values.shot_type='intelligence';
 const consumed=ordinaryInputs.filter(i=>i.kind==='text').map(i=>i.id);consumed.push(...media.map(i=>i.id));
 const structure=mapStructuredJson({draft,operation:maps,effective,ordinaryInputs,consumed,put:(key,value)=>{if(Object.hasOwn(values,key))return false;values[key]=value;return true;}});if(!structure.ok)return structure;
 return {ok:true,value:{intent,effectiveParameters:effective,consumedInputIds:consumed,...(draft.structure?{consumedStructure:structure.value}:{}),wireTemplate:{method:'POST',path:r.createPath??(kie?'/api/v1/jobs/createTask':'/v1/videos/generations'),encoding:'json',body:kie?{model,input:values}:{model,...values}},billingFacts:{durationSeconds:Number(effective.durationSeconds),resolution:effective.resolution,...(typeof effective.aspectRatio==='string'?{aspectRatio:effective.aspectRatio}:{})}}};
}
