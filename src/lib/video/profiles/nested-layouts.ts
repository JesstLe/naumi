import {readVideoIntentPreference} from '../intent';
import {mapVideoParameters} from './parameters';
import {compileVideoPrompt} from '../prompt';
import {type VideoExecutionDraft,type VideoExecutionIntent,type VideoProfileOutput,type VideoResult} from '../execution-contract';
import type {NativeVideoRecipe} from './native-profile';
import {nestedFailure,type NestedJson,type NestedLayoutContext,type Media} from './nested-contract';
import {compileTokenDanceLayout} from './tokendance-layouts';
import {compileTFRouterLayout} from './tfrouter-layouts';
import {compileCompShareLayout} from './compshare-layouts';

export const NESTED_VIDEO_LAYOUTS=['tokendance-seedance','tokendance-kling-text','tokendance-kling-image','tokendance-kling-motion','tokendance-kling-omni','tokendance-wan3','tokendance-happyhorse','tokendance-minimax','tfrouter-generic','tfrouter-kling','tfrouter-kling-omni','tfrouter-grok','compshare-h3','compshare-hailuo','compshare-vidu','compshare-vidu-extend','compshare-vidu-lip-sync','compshare-wan','compshare-seedance'] as const;
export type NestedVideoLayout=typeof NESTED_VIDEO_LAYOUTS[number];
export const isNestedVideoLayout=(value:string):value is NestedVideoLayout=>(NESTED_VIDEO_LAYOUTS as readonly string[]).includes(value);
export function nestedVideoProtocol(value:string){return isNestedVideoLayout(value)?value.startsWith('tokendance-')?'tokendance':value.startsWith('tfrouter-')?'tfrouter':'compshare':undefined;}
/** A unique wire operation may determine automatic intent from actual roles.
 * Explicit preferences (including meaningful legacy modes) always win. */
export function deriveNestedVideoIntent(draft:VideoExecutionDraft,layout:string):VideoResult<VideoExecutionIntent>|undefined{
 if(readVideoIntentPreference(draft))return undefined;
 const media=draft.inputs.filter(i=>i.kind!=='text'),images=media.filter(i=>i.kind==='image'),videos=media.filter(i=>i.kind==='video'),audios=media.filter(i=>i.kind==='audio');
 if(layout==='tokendance-kling-motion'&&images.length===1&&videos.length===1&&!audios.length)return {ok:true,value:'motion_control'};
 if(layout==='compshare-vidu-extend'&&videos.length===1&&!audios.length&&images.every(i=>i.role==='last_frame'))return {ok:true,value:'extend'};
 if(layout==='compshare-vidu-lip-sync'&&videos.length===1&&!images.length&&audios.length<=1)return {ok:true,value:'lip_sync'};
 return undefined;
}
export function nestedVideoIntents(layout:string):string[]|undefined{
 if(!isNestedVideoLayout(layout))return undefined;
 if(layout==='tokendance-kling-text'||layout==='tfrouter-grok')return ['text'];
 if(layout==='tokendance-kling-motion')return ['motion_control'];
 if(layout==='tokendance-kling-image')return ['single_image','frames_required','first_optional','last_optional'];
 if(layout==='compshare-hailuo')return ['text','single_image'];
 if(layout==='compshare-vidu-extend')return ['extend'];
 if(layout==='compshare-vidu-lip-sync')return ['lip_sync'];
 if(layout==='compshare-wan')return ['text','single_image','frames_required'];
 if(layout==='compshare-vidu')return ['text','single_image','frames_required','reference'];
 return ['text','single_image','frames_required','first_optional','last_optional','reference','video_edit','extend'];
}
/** Only shared input/parameter mechanics live here. Actual protocol layout and
 * branch constraints belong to each family implementation, not one DSL. */
export function compileNestedVideoLayout(draft:VideoExecutionDraft,recipe:NativeVideoRecipe,model:string,intent:VideoExecutionIntent,operation:NativeVideoRecipe['operations'][number]):VideoResult<VideoProfileOutput>{
 if(!isNestedVideoLayout(recipe.layout))return nestedFailure('NATIVE_PROFILE_MAPPING_MISSING','layout','未知嵌套协议布局');
 const media=draft.inputs.filter((i):i is Media=>i.kind!=='text'),images=media.filter(i=>i.kind==='image'),videos=media.filter(i=>i.kind==='video'),audios=media.filter(i=>i.kind==='audio'),first=images.filter(i=>i.role==='first_frame'),last=images.filter(i=>i.role==='last_frame'),ordinary=images.filter(i=>i.role==='reference');
 if(media.some(i=>!['reference','first_frame','last_frame','source_video','source_audio'].includes(i.role)))return nestedFailure('INPUT_ROLE_NOT_MAPPABLE','inputs','此协议没有该素材角色映射');
 if(first.length>1||last.length>1)return nestedFailure('FRAME_INPUT_REQUIRED','inputs','首帧和尾帧各只能一张');
 if(intent==='text'&&media.length&&!(recipe.layout==='compshare-wan'&&!images.length&&!videos.length))return nestedFailure('TEXT_INTENT_HAS_MEDIA','inputs','文生意图包含非音频参考素材');
 if(intent!=='text'&&!media.length)return nestedFailure('FRAME_INPUT_REQUIRED','inputs','媒体意图缺少素材');
 if(intent==='single_image'&&images.length!==1)return nestedFailure('SINGLE_MEDIA_REQUIRED','inputs','单图意图需要一张图片');
 if(intent==='frames_required'&&(first.length!==1||last.length!==1))return nestedFailure('FRAME_INPUT_REQUIRED','inputs','首尾帧意图需要明确的一张首帧和一张尾帧');
 if(intent==='first_optional'&&!last.length||intent==='last_optional'&&!first.length)return nestedFailure('FRAME_INPUT_REQUIRED','inputs','所选意图缺少相应帧角色');
 if((intent==='extend'||intent==='video_edit'||intent==='lip_sync')&&!videos.length)return nestedFailure('SOURCE_VIDEO_REQUIRED','inputs','该意图需要来源视频');
 for(const kind of ['image','video','audio'] as const){const items=media.filter(i=>i.kind===kind),rule=operation[({image:'images',video:'videos',audio:'audios'} as const)[kind]];if(rule&&(items.length<rule.min||rule.max!==undefined&&items.length>rule.max))return nestedFailure('MEDIA_COUNT_OUT_OF_RANGE','inputs','素材数量超过实际协议映射');}
 let prompt:string;try{prompt=compileVideoPrompt(draft.prompt,draft.inputs.map(i=>({...i,value:i.kind==='text'?i.value??'':i.nodeId}))).prompt;}catch{return nestedFailure('PROMPT_REFERENCE_INVALID','prompt','提示词引用失效');}
 if(operation.requiresPrompt&&!prompt.trim())return nestedFailure('PROMPT_REQUIRED','prompt','此操作需要提示词');
 if(operation.maxPromptChars!==undefined&&prompt.length>operation.maxPromptChars)return nestedFailure('PROMPT_TOO_LONG','prompt','提示词超过真实协议限制');
 const rules={...recipe.parameters,...operation.parameters},mapped=mapVideoParameters(draft.parameters,rules);if(!mapped.ok)return mapped;
 const {effective,wire}=mapped.value;
 if(typeof effective.durationSeconds!=='number'||effective.durationSeconds<=0||typeof effective.resolution!=='string'||!effective.resolution.trim()||effective.aspectRatio!==undefined&&typeof effective.aspectRatio!=='string')return nestedFailure('BILLING_FACTS_MISSING','parameters','有效时长、分辨率或画幅无效');
 const options:Record<string,NestedJson>={},core=['durationSeconds','resolution','aspectRatio','width','height'];
 for(const [name,rule]of Object.entries(rules)){
  if(!Object.hasOwn(effective,name)||core.includes(name))continue;
  if(!Object.hasOwn(wire,name)||!rule.wireField)return nestedFailure('PARAMETER_MAPPING_MISSING',name,'参数没有明确的协议字段');
  if(Object.hasOwn(options,rule.wireField))return nestedFailure('WIRE_FIELD_COLLISION',name,'多个参数映射到同一字段');options[rule.wireField]=wire[name];
 }
 const ctx:NestedLayoutContext={layout:recipe.layout,recipe,model,intent,prompt,media,images,videos,audios,ordinary,first:first[0],last:last[0],effective,options,slot:id=>({$videoAsset:id})};
 const compiled=recipe.layout.startsWith('tokendance-')?compileTokenDanceLayout(ctx):recipe.layout.startsWith('tfrouter-')?compileTFRouterLayout(ctx):compileCompShareLayout(ctx);if(!compiled.ok)return compiled;
 return {ok:true,value:{intent,effectiveParameters:effective,consumedInputIds:draft.inputs.map(i=>i.id),wireTemplate:{method:'POST',path:recipe.createPath??compiled.value.path,encoding:recipe.layout==='compshare-hailuo'?'inline-json':'json',body:compiled.value.body},billingFacts:{durationSeconds:effective.durationSeconds,resolution:effective.resolution,...(typeof effective.aspectRatio==='string'?{aspectRatio:effective.aspectRatio}:{})}}};
}
