import {assertNestedOptions,nestedContent,nestedFailure,type NestedLayoutContext,type NestedJson} from './nested-contract';
import type {VideoResult} from '../execution-contract';

const paths:Record<string,string>={'tokendance-seedance':'/ark/v3/generations/tasks','tokendance-kling-text':'/kling/v1/text2video','tokendance-kling-image':'/kling/v1/image2video','tokendance-kling-motion':'/kling/v1/motion-control','tokendance-kling-omni':'/kling/v1/omni-video','tokendance-wan3':'/alibaba/wan3/v1/video-synthesis','tokendance-happyhorse':'/alibaba/happyhorse/v1/video-synthesis','tokendance-minimax':'/minimax/v2/video_generation'};
export function compileTokenDanceLayout(c:NestedLayoutContext):VideoResult<{path:string;body:Record<string,NestedJson>}>{
 const {layout,model,prompt,effective:e,options:o,media,images,videos,audios,ordinary,first,last,slot}=c;
 const frame=!!(first||last),ratio=e.aspectRatio,duration=e.durationSeconds,resolution=String(e.resolution);
 const finish=(body:Record<string,NestedJson>):VideoResult<{path:string;body:Record<string,NestedJson>}>=>({ok:true,value:{path:paths[layout],body}});
 if(layout==='tokendance-seedance'||layout==='tokendance-minimax'){
  const checked=assertNestedOptions(c,layout==='tokendance-seedance'?['generate_audio','watermark','seed','camera_fixed','return_last_frame','draft','service_tier']:['seed']);if(!checked.ok)return checked;
  if(layout==='tokendance-minimax'&&(frame&&(ordinary.length||videos.length||audios.length)||audios.length&&!ordinary.length&&!videos.length))return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','MiniMax帧与混合参考互斥，音频需要图或视频');
  if(frame)e.aspectRatio='adaptive';
  return finish({model,content:nestedContent(c),duration,resolution,...(e.aspectRatio!==undefined?{ratio:e.aspectRatio}:{}),...o});
 }
 const checked=assertNestedOptions(c,layout.startsWith('tokendance-kling-')?['seed','character_orientation','keep_original_sound','audio','negative_prompt']:layout==='tokendance-wan3'?['seed','character_orientation','keep_original_sound','audio','watermark']:['seed','character_orientation','keep_original_sound','watermark']);if(!checked.ok)return checked;
 if(layout.startsWith('tokendance-kling-')){
  const {negative_prompt,audio,...extra}=o;
  if(audio!==undefined&&typeof audio!=='boolean')return nestedFailure('PARAMETER_VALUE_INVALID','audio','声音参数需要明确布尔值');
  const settings:Record<string,NestedJson>={resolution:resolution.toLowerCase(),duration,...(ratio!==undefined?{aspect_ratio:ratio}:{}),...(audio!==undefined?{audio:audio?'on':'off'}:{}),...extra};
  const body:Record<string,NestedJson>={model_name:model,settings,...(negative_prompt!==undefined?{negative_prompt}:{})};
  if(layout==='tokendance-kling-text'){
   if(media.length)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','text2video没有媒体字段');body.prompt=prompt;
  }else{
   const contents:NestedJson[]=[{type:'prompt',text:prompt}];
   if(layout==='tokendance-kling-motion'){
    if(images.length!==1||videos.length!==1||audios.length)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','motion-control需要一张图片和一个运动视频');
    settings.character_orientation=extra.character_orientation??'video';contents.push({type:'image',url:slot(images[0].id)},{type:'video',url:slot(videos[0].id)});
   }else if(layout==='tokendance-kling-image'){
    if(videos.length||audios.length||images.length<1||images.length>2||ordinary.length>1||ordinary.length&&frame)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','image2video需要单图或明确首尾帧，不会把两张普通参考猜成首尾');
    if(ordinary.length)contents.push({type:'first_frame',url:slot(ordinary[0].id)});
    if(first)contents.push({type:'first_frame',url:slot(first.id)});if(last)contents.push({type:'last_frame',url:slot(last.id)});
   }else for(const ref of media)contents.push({type:ref.role==='first_frame'||ref.role==='last_frame'?ref.role:ref.kind,url:slot(ref.id)});
   body.contents=contents;
  }
  return finish(body);
 }
 const mediaValues=media.map(ref=>({type:ref.role==='first_frame'||ref.role==='last_frame'?ref.role:`reference_${ref.kind}`,url:slot(ref.id)}));
 if(layout==='tokendance-wan3')return finish({model,input:{prompt,...(media.length?{media:mediaValues}:{})},parameters:{resolution:resolution.toUpperCase(),duration,...(ratio!==undefined?{ratio}:{}),...o}});
 if(layout!=='tokendance-happyhorse')return nestedFailure('NATIVE_PROFILE_MAPPING_MISSING','layout','TokenDance路径未配置');
 if(audios.length||videos.length>1||videos.length&&media.length!==1)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','HappyHorse仅接受独立视频或图片，不接受音频');
 // The wire has no ratio for framed/video input: record the actual semantic
 // instead of retaining a user-facing ratio that was never sent.
 if((frame||videos.length)&&ratio!==undefined)return nestedFailure('PARAMETER_MAPPING_MISSING','aspectRatio','HappyHorse帧或视频分支没有画幅字段，请明确不发送');
 return finish({model,input:{prompt,...(videos.length?{video_url:slot(videos[0].id)}:media.length?{media:mediaValues}:{})},parameters:{resolution:resolution.toUpperCase(),duration,...(!frame&&!videos.length&&ratio!==undefined?{ratio}:{}),...o}});
}
