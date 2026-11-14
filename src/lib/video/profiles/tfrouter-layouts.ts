import {assertNestedOptions,nestedFailure,type NestedLayoutContext,type NestedJson} from './nested-contract';
import type {VideoResult} from '../execution-contract';

export function compileTFRouterLayout(c:NestedLayoutContext):VideoResult<{path:string;body:Record<string,NestedJson>}>{
 const {layout,model,prompt,effective:e,options:o,media,images,videos,audios,first,last,ordinary,slot}=c;
 const checked=assertNestedOptions(c,['seed','mode','negative_prompt','generate_audio','watermark']);if(!checked.ok)return checked;
 const {generate_audio,watermark,...extra}=o;let metadata:Record<string,NestedJson>;
 if(layout==='tfrouter-kling'||layout==='tfrouter-kling-omni'){
  if(audios.length)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','此Kling路由没有独立音频字段');
  if(generate_audio!==undefined&&typeof generate_audio!=='boolean')return nestedFailure('PARAMETER_VALUE_INVALID','generate_audio','声音参数需要布尔值');
  metadata={...(e.aspectRatio!==undefined?{aspect_ratio:e.aspectRatio}:{}),...(generate_audio!==undefined?{sound:generate_audio?'on':'off'}:{}),video_list:videos.map(i=>({video_url:slot(i.id)})),image_list:[],...extra};
  if(layout==='tfrouter-kling-omni')metadata.image_list=images.map(i=>({image_url:slot(i.id),...(i.role==='first_frame'?{type:'first_frame'}:i.role==='last_frame'?{type:'end_frame'}:{})}));
  else{
   // Legacy allowed two ordinary images but serialized only images[0]. Do not
   // silently consume the second; only real first/tail fields are compilable.
   if(images.length>2||ordinary.length>1||ordinary.length&&(first||last))return nestedFailure('INPUT_NOT_CONSUMED','inputs','Kling只有明确首尾字段，两张普通图没有完整映射');
   if(first)metadata.image=slot(first.id);else if(ordinary[0])metadata.image=slot(ordinary[0].id);
   if(last)metadata.image_tail=slot(last.id);
  }
 }else if(layout==='tfrouter-grok'){
  if(media.length)return nestedFailure('NATIVE_MEDIA_COMBINATION_INVALID','inputs','此Grok元数据布局没有媒体字段');
  if(generate_audio!==undefined)return nestedFailure('PARAMETER_MAPPING_MISSING','generate_audio','此Grok布局没有声音字段');
  metadata={...(e.aspectRatio!==undefined?{aspectRatio:e.aspectRatio}:{}),...extra};
 }else{
  metadata={...(generate_audio!==undefined?{generate_audio}:{}),...(e.aspectRatio!==undefined?{ratio:e.aspectRatio}:{}),references:media.map(i=>({role:i.role==='first_frame'||i.role==='last_frame'?i.role:`reference_${i.kind}`,type:`${i.kind}_url`,[`${i.kind}_url`]:{url:slot(i.id)}})),resolution:e.resolution,...extra};
 }
 if(watermark!==undefined)metadata.watermark=watermark;
 return {ok:true,value:{path:'/v1/video/generateVideo',body:{model,prompt,duration:e.durationSeconds,resolution:e.resolution,metadata}}};
}
