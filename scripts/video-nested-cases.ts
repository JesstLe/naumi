import type {NativeVideoRecipe} from '../src/lib/video/profiles/native-profile';
import {NESTED_VIDEO_LAYOUTS,type NestedVideoLayout,nestedVideoIntents} from '../src/lib/video/profiles/nested-layouts';
import type {VideoExecutionIntent} from '../src/lib/video/execution-contract';

export type NestedFixtureCase={name:string;intent:Exclude<VideoExecutionIntent,'workflow'>;refs:Array<{id:string;kind:'image'|'video'|'audio';role:'reference'|'first_frame'|'last_frame'|'source_video'|'source_audio'}>;parameters?:Record<string,string|number|boolean>};
const image=(id='image1',role:'reference'|'first_frame'|'last_frame'='reference')=>({id,kind:'image' as const,role});
const video={id:'video',kind:'video' as const,role:'source_video' as const},audio={id:'audio',kind:'audio' as const,role:'source_audio' as const};
export const NESTED_FIXTURE_LAYOUTS=NESTED_VIDEO_LAYOUTS;
export function nestedFixtureCases(layout:NestedVideoLayout):NestedFixtureCase[]{
 const text:NestedFixtureCase={name:'text',intent:'text',refs:[]},single:NestedFixtureCase={name:'single',intent:'single_image',refs:[image('image1','first_frame')]},frames:NestedFixtureCase={name:'frames',intent:'frames_required',refs:[image('image1','first_frame'),image('image2','last_frame')]},reference:NestedFixtureCase={name:'reference',intent:'reference',refs:[image(),image('image2')]},multi:NestedFixtureCase={name:'multimodal',intent:'reference',refs:[image(),video,audio]};
 if(layout==='tokendance-kling-text'||layout==='tfrouter-grok')return [text];
 if(layout==='tokendance-kling-motion')return [{name:'motion',intent:'motion_control',refs:[image(),video]}];
 if(layout==='tokendance-kling-image')return [single,frames,{name:'tail',intent:'first_optional',refs:[image('image2','last_frame')]}];
 if(layout==='tokendance-happyhorse')return [text,single,reference,{name:'video',intent:'video_edit',refs:[video]}];
 if(layout==='tfrouter-kling')return [text,single,frames,{name:'image-video',intent:'reference',refs:[image(),video]}];
 if(layout==='tfrouter-kling-omni')return [text,single,frames,{name:'images-video',intent:'reference',refs:[image(),image('image2'),video]}];
 if(layout==='compshare-hailuo')return [text,single];
 if(layout==='compshare-wan')return [{...text,parameters:{size:'2048x1080'}},single,frames,{name:'frames-audio',intent:'frames_required',refs:[...frames.refs,audio]}];
 if(layout==='compshare-vidu-extend')return [{name:'extend',intent:'extend',refs:[video]},{name:'extend-tail',intent:'extend',refs:[video,image('image2','last_frame')]}];
 if(layout==='compshare-vidu-lip-sync')return [{name:'audio-lips',intent:'lip_sync',refs:[video,audio]},{name:'text-lips',intent:'lip_sync',refs:[video],parameters:{speech:'Speak exactly'}}];
 if(layout==='compshare-vidu')return [text,single,frames,reference];
 return [text,single,frames,reference,multi];
}
export function nestedFixtureRecipe(layout:NestedVideoLayout):NativeVideoRecipe{
 const semantic={type:'string' as const,default:'16:9',send:'semantic' as const},omit={type:'string' as const,send:'omit' as const};
 const noRatio=(intent:string)=>layout==='compshare-hailuo'||layout==='compshare-vidu-extend'||layout==='compshare-vidu-lip-sync'||layout==='compshare-vidu'&&!['text','reference'].includes(intent)||layout==='compshare-wan'&&intent!=='text'||layout==='tokendance-happyhorse'&&['single_image','frames_required','first_optional','last_optional','video_edit','extend'].includes(intent);
 const parameters:NativeVideoRecipe['parameters']={durationSeconds:{type:'integer',default:4,send:'semantic'},resolution:{type:'string',default:'4K',mapping:{'4K':'2K'},send:'semantic'},aspectRatio:semantic};
 if(layout==='compshare-h3'){parameters.useContextIR={type:'boolean',default:false,wireField:'use_context_ir'};parameters.generateAudio={type:'boolean',default:false,wireField:'generate_audio'};parameters.watermark={type:'boolean',default:false,wireField:'aigc_watermark'};}
 else{parameters.seed={type:'integer',default:0,wireField:'seed'};
  if(layout==='compshare-wan')parameters.size={type:'string',wireField:'size'};
  if(layout==='compshare-vidu-lip-sync')parameters.speech={type:'string',wireField:'text'};
  if(['tokendance-seedance','tokendance-wan3','tokendance-kling-text','tokendance-kling-image','tokendance-kling-motion','tokendance-kling-omni','tfrouter-generic','tfrouter-kling','tfrouter-kling-omni','compshare-seedance'].includes(layout))parameters.generateAudio={type:'boolean',default:false,wireField:layout==='tokendance-wan3'||layout.startsWith('tokendance-kling-')?'audio':'generate_audio'};
  if(['tokendance-seedance','tokendance-wan3','tokendance-happyhorse','tfrouter-generic','tfrouter-kling','tfrouter-kling-omni','tfrouter-grok','compshare-seedance','compshare-hailuo'].includes(layout))parameters.watermark={type:'boolean',default:false,wireField:layout==='compshare-hailuo'?'aigc_watermark':'watermark'};
 }
 // HappyHorse reference case ordinary images has ratio; only frame/video
 // operations omit it explicitly. A video reference can be saved as video_edit.
 return {layout,defaults:{ordinaryImage:'single_image',sourceVideo:'reference'},sizes:{'2K':{'16:9':[2048,1080],'9:16':[1080,2048]}},parameters,operations:nestedVideoIntents(layout)!.map(intent=>({intent:intent as NativeVideoRecipe['operations'][number]['intent'],...(noRatio(intent)?{parameters:{aspectRatio:omit}}:{})}))};
}
