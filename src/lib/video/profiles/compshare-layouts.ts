import {assertNestedOptions,nestedContent,nestedFailure,type NestedLayoutContext,type NestedJson} from './nested-contract';
import type {VideoResult} from '../execution-contract';

export function compileCompShareLayout(c:NestedLayoutContext):VideoResult<{path:string;body:Record<string,NestedJson>}>{
 const {layout,model,prompt,intent,effective:e,options:o,media,images,videos,audios,first,last,ordinary,slot}=c,frame=!!(first||last);
 const checked=assertNestedOptions(c,layout==='compshare-h3'?['use_context_ir','skill_id','mute_audio','generate_audio','aigc_watermark']:layout==='compshare-seedance'?['seed','size','generate_audio','watermark']:layout==='compshare-hailuo'?['seed','size','aigc_watermark']:layout==='compshare-wan'?['seed','size']:['seed','size',...(layout==='compshare-vidu-lip-sync'?['text']:[])]);if(!checked.ok)return checked;
 const resolution=String(e.resolution);
 const hasRatio=layout==='compshare-h3'||layout==='compshare-seedance'||layout==='compshare-wan'&&intent==='text'||layout==='compshare-vidu'&&['text','reference'].includes(intent);
 if(!hasRatio&&e.aspectRatio!==undefined)return nestedFailure('PARAMETER_MAPPING_MISSING','aspectRatio','此分支没有画幅字段，请在操作映射中明确不发送');
 if(layout==='compshare-h3'){
  if(frame&&(ordinary.length||videos.length||audios.length)||audios.length&&!ordinary.length&&!videos.length)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','H3帧模式与混合参考互斥，音频需要图或视频');
  const {generate_audio,mute_audio,...rest}=o;if(generate_audio!==undefined&&typeof generate_audio!=='boolean'||mute_audio!==undefined&&typeof mute_audio!=='boolean')return nestedFailure('PARAMETER_VALUE_INVALID','generate_audio','声音开关需要布尔值');
  if(generate_audio!==undefined&&mute_audio!==undefined&&mute_audio===generate_audio)return nestedFailure('AUDIO_PARAMETER_CONFLICT','mute_audio','声音开关与静音参数冲突');
  if(frame)e.aspectRatio='adaptive';
  return {ok:true,value:{path:'/minimax/v2/video_generation',body:{model,content:nestedContent(c),duration:e.durationSeconds,resolution:resolution.toUpperCase(),...(e.aspectRatio!==undefined?{ratio:e.aspectRatio}:{}),...(generate_audio!==undefined?{mute_audio:!generate_audio}:mute_audio!==undefined?{mute_audio}:{}),...rest}}};
 }
 const input:Record<string,NestedJson>={prompt},parameters:Record<string,NestedJson>={duration:e.durationSeconds};
 if(layout==='compshare-seedance'){
  delete input.prompt;input.content=nestedContent(c);Object.assign(parameters,{resolution:resolution.toLowerCase(),...(e.aspectRatio!==undefined?{ratio:e.aspectRatio}:{})},o);
 }else if(layout==='compshare-hailuo'){
  if(videos.length||audios.length||images.length>1||last)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','Hailuo只映射一张首帧');
  if(intent!=='text'){if(!images[0])return nestedFailure('FRAME_INPUT_REQUIRED','inputs','Hailuo图生缺少图片');input.first_frame_image=slot(images[0].id);}
  Object.assign(parameters,{resolution:resolution.toUpperCase()},o);
 }else if(layout==='compshare-wan'){
  if(videos.length||audios.length>1||ordinary.length>1||ordinary.length&&frame)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','Wan需要明确首尾或单图以及最多一段音频');
  const start=first??(images.length===1?ordinary[0]:undefined);
  if(intent!=='text'){if(!start)return nestedFailure('FRAME_INPUT_REQUIRED','inputs','Wan图生缺少首帧');input.first_frame_url=slot(start.id);if(last)input.last_frame_url=slot(last.id);}
  if(audios[0])input.audio_url=slot(audios[0].id);
  if(intent==='text'){
   let size:string;
   if(o.size!==undefined){if(typeof o.size!=='string'||!/^\d{1,5}x\d{1,5}$/.test(o.size)||o.size.split('x').some(n=>Number(n)<=0))return nestedFailure('PARAMETER_VALUE_INVALID','size','尺寸需要两个正整数');size=o.size;if(e.aspectRatio==='9:16')size=size.split('x').reverse().join('x');}
   else{const dims=c.recipe.sizes?.[resolution]?.[String(e.aspectRatio??'adaptive')];if(!dims)return nestedFailure('PARAMETER_VALUE_NOT_MAPPABLE','resolution','Wan文生缺少明确的物理尺寸映射');size=dims.join('x');}
   parameters.size=size;
  }else if(o.size!==undefined)return nestedFailure('PARAMETER_MAPPING_MISSING','size','Wan图生分支没有size字段');
  parameters.resolution=resolution.toUpperCase();const {size:_size,...rest}=o;Object.assign(parameters,rest);
 }else{
  parameters.resolution=resolution.toLowerCase();
  if(layout==='compshare-vidu-extend'){
   if(videos.length!==1||audios.length||ordinary.length||first)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','Vidu续写需要一个视频，可附明确尾帧');
   input.video_url=slot(videos[0].id);if(last)input.last_frame_url=slot(last.id);parameters.vidu_type='extend';
  }else if(layout==='compshare-vidu-lip-sync'){
   if(videos.length!==1||audios.length>1||images.length)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','口型同步需要一个视频和至多一段音频');
   const text=o.text??prompt;if(typeof text!=='string'||!audios.length&&!text.trim())return nestedFailure('PROMPT_REQUIRED','text','口型同步需要音频或朗读文字');
   if(audios.length&&o.text!==undefined)return nestedFailure('PARAMETER_MAPPING_MISSING','text','音频与显式朗读文字不能同时映射，不会丢弃其中一项');
   input.video_url=slot(videos[0].id);if(audios.length)input.audio_url=slot(audios[0].id);else input.text=text;parameters.vidu_type='lip-sync';
  }else if(layout==='compshare-vidu'){
   if(videos.length||audios.length)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','Vidu生成没有视频或音频字段');
   if(intent==='reference'){if(!ordinary.length||ordinary.length>7||frame)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','Vidu参考需要1至7张普通图片');input.images=ordinary.map(i=>slot(i.id));parameters.vidu_type='reference2video';if(e.aspectRatio!==undefined)parameters.aspect_ratio=e.aspectRatio;}
   else if(intent==='frames_required'){input.first_frame_url=slot(first!.id);input.last_frame_url=slot(last!.id);parameters.vidu_type='start-end2video';}
   else if(intent==='text'){parameters.vidu_type='text2video';if(e.aspectRatio!==undefined)parameters.aspect_ratio=e.aspectRatio;}
   else{if(images.length!==1||last)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','Vidu单图需要一张首帧');input.first_frame_url=slot(images[0].id);parameters.vidu_type='img2video';}
  }else return nestedFailure('NATIVE_PROFILE_MAPPING_MISSING','layout','CompShare布局未配置');
  const {text:_text,...rest}=o;Object.assign(parameters,rest);
 }
 return {ok:true,value:{path:'/v1/tasks/submit',body:{model,input,parameters}}};
}
