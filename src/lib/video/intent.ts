import {videoDiagnostic,type ResolvedVideoDraft,type VideoExecutionIntent,type VideoResult} from './execution-contract';

export type VideoIntentDefaults={ordinaryImage?:'single_image'|'reference';sourceVideo?:'video_edit'|'reference'};
/** Input-derived intent, independent of legacy modes/limits/test evidence.
 * Protocol-specific defaults are explicit published contract values. */
export function deriveVideoIntent(draft:ResolvedVideoDraft,defaults:VideoIntentDefaults={}):VideoResult<VideoExecutionIntent> {
  const media=draft.inputs.filter(input=>input.kind!=='text');
  const preference=draft.intentPreference??(draft.legacyMode==='text'&&media.length?undefined:draft.legacyMode);
  if(preference){
    const intent=preference==='image_reference'||preference==='omni_reference'?'reference':preference;
    if(preference==='image_reference'&&media.some(input=>input.kind!=='image'))
      return {ok:false,diagnostics:[videoDiagnostic('input','IMAGE_PREFERENCE_HAS_OTHER_MEDIA','intentPreference','图片参考意图包含其他媒体','选择全能参考或调整素材')]};
    return {ok:true,value:intent};
  }
  if(!media.length)return {ok:true,value:'text'};
  const images=media.filter(input=>input.kind==='image');
  if(images.length===media.length){
    if(images.length===2&&images.filter(input=>input.role==='first_frame').length===1&&images.filter(input=>input.role==='last_frame').length===1)
      return {ok:true,value:'frames_required'};
    if(images.length===1){
      if(images[0].role==='first_frame')return {ok:true,value:'single_image'};
      if(images[0].role==='last_frame')return {ok:true,value:'first_optional'};
      if(defaults.ordinaryImage)return {ok:true,value:defaults.ordinaryImage};
      return {ok:false,diagnostics:[videoDiagnostic('input','INPUT_INTENT_AMBIGUOUS','intentPreference','此图片尚未指定首帧或参考用途','选择图片用途或生成意图',images[0].id)]};
    }
    return {ok:true,value:'reference'};
  }
  if(media.length===1&&media[0].kind==='video'&&media[0].role==='source_video'){
    if(defaults.sourceVideo)return {ok:true,value:defaults.sourceVideo};
    return {ok:false,diagnostics:[videoDiagnostic('input','INPUT_INTENT_AMBIGUOUS','intentPreference','来源视频可用于编辑或参考','选择视频编辑或参考意图',media[0].id)]};
  }
  return {ok:true,value:'reference'};
}
