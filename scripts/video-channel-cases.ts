import base from '../src/lib/model-config/video-family-capabilities.json';
import multi from '../src/lib/model-config/video-family-multimodal.json';
import story from '../src/lib/model-config/video-family-storyboard.json';
import type {NativeVideoRecipe} from '../src/lib/video/profiles/native-profile';
import type {ChannelVideoMapping} from '../src/lib/video/profiles/channel-contract';
import type {VideoExecutionIntent,VideoDraftStructure} from '../src/lib/video/execution-contract';
export type ChannelCase={name:string;intent:VideoExecutionIntent;refs:Array<{id:string;kind:'image'|'video'|'audio';role:'reference'|'first_frame'|'last_frame'|'source_video'|'source_audio'}>;parameters:Record<string,string|number|boolean>;structure?:VideoDraftStructure};
export type ChannelFixture={profile:string;model:string;recipe:NativeVideoRecipe;samples:ChannelCase[]};
const im=(id='im',role:'reference'|'first_frame'|'last_frame'='reference')=>({id,kind:'image' as const,role}),video={id:'video',kind:'video' as const,role:'source_video' as const},audio={id:'audio',kind:'audio' as const,role:'source_audio' as const};
const defaults:Record<string,boolean>={'seedance-1-5-pro':false,'kling-v2-6':false,'kling-v3':false,'kling-v3-omni':false,'wan2.5-preview':true,'wan2.6-i2v-flash':false};
/** Fixture-only translation of each historical published example into explicit
 * field choices. Product code imports neither these tables nor model names. */
function fieldMapping(profile:string,model:string):ChannelVideoMapping{
 const klingMode=['kling-v2-6','kling-v3','kling-v3-omni','kling-video-o1'].includes(model);
 if(profile==='geek-kling'||profile==='geek-wan3'||profile==='geek-video-v2'||profile==='geek-wan3-v3')return {kind:model==='wan3.0-video'?'geek-wan':'geek-kling',resolutionCase:'upper',...(model!=='wan3.0-video'?{audio:{}}:{})};
 if(profile==='geek-h3-v2'||profile==='geek-h3-v3')return {kind:profile==='geek-h3-v2'?'geek-h3':'geek-h3-multimodal',resolutionCase:'preserve'};
 if(profile==='apib-video-v3'||profile==='apib-storyboard-v4'&&model==='kling-v3-omni')return {kind:model==='seedance-2.5'?'apib-seedance25':model.startsWith('seedance-')?'apib-seedance20':model.startsWith('wan')?'apib-wan3':model.startsWith('MiniMax')?'apib-h3':'apib-kling-feature',resolutionCase:model.startsWith('seedance-')?'lower':'upper',...(model==='kling-v3-omni'?{resolutionField:'mode',audio:{}}:{})};
 const verified=profile.startsWith('apimart-'),upper=model.startsWith('wan3.')||model.startsWith('MiniMax')||model==='wan2.7-r2v'||model==='wan2.7-videoedit';
 return {kind:'apib-flat',resolutionCase:upper?'upper':'lower',resolutionField:klingMode?'mode':'resolution',frameImages:model==='kling-3.0-turbo'?'first-only':model.startsWith('MiniMax')?'named':['seedance-1-5-pro','kling-v2-6','kling-v3','kling-video-o1','kling-v4','wan2.5-preview','wan2.6','wan2.6-i2v-flash'].includes(model)||verified?'urls':'roles',referenceImages:model==='kling-v4'||model==='wan2.7-r2v'||model.startsWith('wan3.')?'roles':'urls',ratio:{field:!verified&&(model.startsWith('seedance-2.')||model==='wan2.5-preview'||model==='wan2.7-r2v'||model.startsWith('wan3.'))?'size':'aspect_ratio',frames:verified&&['wan2.6-i2v-flash','wan2.7-videoedit'].includes(model)?'omit':!verified&&(model.startsWith('seedance-2.')||model.startsWith('wan3.'))?'adaptive':!verified&&!model.startsWith('seedance-1-')?'omit':'value',...(verified?{omitDefault:'16:9'}:{}),...(!verified&&model==='kling-v4'?{mapping:{'adaptive':'auto','16:9':'16:9','9:16':'9:16','1:1':'1:1','21:9':'21:9'}}:{})},...(Object.hasOwn(defaults,model)?{audio:{...(model==='kling-v2-6'?{deniedModes:['std'],denyLastFrame:!verified}:{})}}:{})};
}
function fixture(profile:string,model:string,definition:any,verified=false):ChannelFixture{
 const c=fieldMapping(profile,model),hasAudio=c.kind==='geek-kling'||c.kind==='apib-kling-feature'||c.audio!==undefined;
 if(profile==='apib-storyboard-v4')c.shots={wireField:'multi_prompt',promptField:'prompt',durationField:'duration',indexField:'index',max:6,minDurationSeconds:1,...(model==='kling-v3'?{maxPromptChars:512}:{durationStep:1}),constants:{multi_shot:true,shot_type:'customize'}};
 const parameters:NativeVideoRecipe['parameters']={durationSeconds:{type:'integer',default:definition.defaultDurationSeconds,send:'semantic'},resolution:{type:'string',default:'4K',mapping:{'4K':definition.defaultResolution},send:'semantic'},aspectRatio:{type:'string',default:definition.defaultAspectRatio??'16:9',send:'semantic'},...(hasAudio?{generateAudio:{type:'boolean',default:defaults[model]??false,wireField:'audio'}}:{})};
 const recipe:NativeVideoRecipe={layout:profile as NativeVideoRecipe['layout'],channel:c,defaults:{ordinaryImage:'single_image',sourceVideo:'reference'},parameters,modes:{[definition.defaultResolution]:'pro'},operations:definition.modes.map((intent:string)=>({intent,requiresPrompt:true,...(definition.maxPromptChars?{maxPromptChars:definition.maxPromptChars}:{}),images:{min:0,max:definition.limits?.images??30},videos:{min:0,max:definition.limits?.videos??5},audios:{min:0,max:definition.limits?.audios??5}}))};
 if(c.resolutionField==='mode'&&definition.defaultResolution.toLowerCase()==='720p')recipe.modes![definition.defaultResolution]='std';
 for(const op of recipe.operations){const specific=definition.modeParameters?.[op.intent]?.durationResolutionMap?.[0];if(specific){const resolution=specific.resolutions[0];op.parameters={resolution:{type:'string',default:'4K',mapping:{'4K':resolution},send:'semantic'}};recipe.modes![resolution]=resolution.toLowerCase()==='720p'?'std':'pro';}}
 const samples:ChannelCase[]=definition.modes.map((intent:VideoExecutionIntent)=>({name:intent,intent,refs:intent==='single_image'?[im('first','first_frame')]:intent==='frames_required'?[im('first','first_frame'),im('last','last_frame')]:intent==='first_optional'?[im('last','last_frame')]:intent==='last_optional'?[im('first','first_frame')]:intent==='reference'?[im()]:intent==='video_edit'?[video]:[],parameters:{aspectRatio:definition.modeParameters?.[intent]?.aspectRatios?.[0]??definition.defaultAspectRatio??'16:9'}}));
 if(profile==='apib-video-v3'||profile==='geek-wan3-v3'||profile==='geek-h3-v3'||profile==='apib-storyboard-v4'&&c.kind==='apib-kling-feature'){
  const refs=c.kind==='apib-kling-feature'?[im('first','first_frame'),video]:[im(),video,audio];
  if(recipe.operations.some(o=>o.intent==='reference'))samples.push({name:'multimodal',intent:'reference',refs,parameters:{aspectRatio:'16:9'}});
 }
 if(profile==='apib-storyboard-v4')for(const sample of [...samples])samples.push({...sample,name:sample.name+'-shots',structure:{shots:[{id:'s1',prompt:'First literal text',durationSeconds:1},{id:'s2',prompt:'Second literal text',durationSeconds:definition.defaultDurationSeconds-1}]}});
 return {profile,model,recipe,samples};
}
export function channelFixtures():ChannelFixture[]{
 const out:ChannelFixture[]=[];
 for(const item of [...base.items,...multi.items,...story.items])out.push(fixture(item.profile,item.model,item.definition));
 const verified=[...base.items.filter(x=>x.providerId==='apib-video'),{model:'wan2.7-videoedit',definition:{defaultDurationSeconds:5,defaultResolution:'720P',defaultAspectRatio:'16:9',modes:['video_edit'],limits:{images:0,videos:1,audios:0}}}];
 for(const item of verified){const model=item.model,profile='apimart-apib-'+(model.startsWith('seedance')?'seedance':model.startsWith('kling')?'kling':model.startsWith('wan')?'wan':'h3'),d={...item.definition,modes:[model==='wan2.6-i2v-flash'?'single_image':model==='wan2.7-r2v'?'reference':model==='wan2.7-videoedit'?'video_edit':'text'],defaultAspectRatio:'16:9'};out.push(fixture(profile,model,d,true));}
 for(const item of base.items.filter(x=>x.providerId==='geeknow-video'))out.push(fixture(item.model==='wan3.0-video'?'geek-wan3':'geek-kling',item.model,{...item.definition,modes:[item.model==='kling-3.0-omni-720p-ref-mute'?'reference':'text']}));
 return out;
}
