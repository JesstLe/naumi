import type {NativeVideoRecipe} from '../src/lib/video/profiles/native-profile';
import {JOB_VIDEO_LAYOUTS,jobVideoIntents,type JobVideoLayout} from '../src/lib/video/profiles/job-structure';
import type {VideoDraftStructure} from '../src/lib/video/execution-contract';
export const JOB_FIXTURE_LAYOUTS=JOB_VIDEO_LAYOUTS;
export type JobFixtureCase={name:string;intent:NonNullable<NativeVideoRecipe['operations'][number]['intent']>;refs:Array<{id:string;kind:'image'|'video'|'audio';role:'reference'|'first_frame'|'last_frame'|'source_video'|'source_audio'|'element'}>;structure?:VideoDraftStructure;parameters?:Record<string,string|number|boolean>};
const image=(id='image1',role:'reference'|'first_frame'|'last_frame'|'element'='reference')=>({id,kind:'image' as const,role}),video={id:'video',kind:'video' as const,role:'source_video' as const},audio={id:'audio',kind:'audio' as const,role:'source_audio' as const};
export function jobFixtureCases(layout:JobVideoLayout):JobFixtureCase[]{
 const text:JobFixtureCase={name:'text',intent:'text',refs:[]},single:JobFixtureCase={name:'single',intent:'single_image',refs:[image('image1','first_frame')]},frames:JobFixtureCase={name:'frames',intent:'frames_required',refs:[image('image1','first_frame'),image('image2','last_frame')]},reference:JobFixtureCase={name:'reference',intent:'reference',refs:[image(),image('image2')]};
 const structure:VideoDraftStructure={shots:[{id:'shot1',prompt:'First shot',durationSeconds:2},{id:'shot2',prompt:'Second shot',durationSeconds:3}],elements:[{id:'actor',name:'Actor',description:'Identity',inputIds:['element-image']}]};
 const structured:JobFixtureCase={name:'structure',intent:'reference',refs:[image(),image('element-image','element')],structure};
 if(layout.endsWith('motion-control'))return [{name:'motion',intent:'motion_control',refs:[image(),video]}];
 if(layout==='kie-kling-omni-text')return [text,{name:'shots',intent:'text',refs:[],structure:{shots:structure.shots}}];
 if(layout==='kie-kling-omni-image')return [single,frames,structured];
 if(layout==='kie-kling-omni-transform')return [{name:'video-only',intent:'video_edit',refs:[video]},{name:'video-image',intent:'reference',refs:[video,image()]}];
 if(layout==='kie-kling-omni-reference')return [reference,structured,{name:'video-only',intent:'video_edit',refs:[video]},{name:'video-image',intent:'reference',refs:[video,image()]},{name:'audio-element',intent:'reference',refs:[{...audio,role:'element'}],structure:{elements:[{id:'voice',name:'Voice',inputIds:['audio']}]}}];
 if(layout==='kie-kling'||layout==='apimart-kling')return [text,single,frames,structured];
 if(layout==='apimart-kling-omni')return [text,single,reference,{name:'video-image',intent:'reference',refs:[video,image()]}];
 if(layout.endsWith('generic'))return [text,single,frames,{name:'multimodal',intent:'reference',refs:[image(),video,audio]}];
 return [text,single,frames];
}
export function jobFixtureRecipe(layout:JobVideoLayout):NativeVideoRecipe{
 const motion=layout.endsWith('motion-control'),omni=layout.startsWith('kie-kling-omni-'),kling=['kie-kling','kie-kling-v26','apimart-kling','apimart-kling-v26'].includes(layout);
 const parameters:NativeVideoRecipe['parameters']={durationSeconds:{type:'integer',default:5,send:'semantic'},resolution:{type:'string',default:'4K',mapping:{'4K':'1080p'},send:'semantic'},aspectRatio:{type:'string',default:'16:9',send:'semantic'},seed:{type:'integer',default:0,wireField:'seed'},watermark:{type:'boolean',default:false,wireField:'watermark'}};
 if(!motion)parameters.generateAudio={type:'boolean',default:false,wireField:omni||layout==='apimart-kling-omni'?'audio':kling?layout.endsWith('v26')?'sound':layout.startsWith('kie-')?'sound':'audio':'generate_audio'};
 const omit={type:'number' as const,send:'omit' as const};
 return {layout,defaults:{ordinaryImage:'single_image',sourceVideo:'reference'},modes:{'1080p':'pro'},parameters,operations:jobVideoIntents(layout)!.map((intent):NativeVideoRecipe['operations'][number]=>({intent:intent as NativeVideoRecipe['operations'][number]['intent'],...(motion?{parameters:{durationSeconds:omit,aspectRatio:{type:'string' as const,send:'omit' as const}}}:intent==='video_edit'&&omni?{parameters:{durationSeconds:omit}}:{})}))};
}
