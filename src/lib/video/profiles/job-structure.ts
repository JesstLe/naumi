import type {z} from 'zod';
import type {shotsMapping,elementsMapping} from './structured-json';
import type {VideoUiContract} from '../ui-contract';
export const JOB_VIDEO_LAYOUTS=['kie-generic','kie-kling','kie-kling-v26','kie-kling-omni-text','kie-kling-omni-image','kie-kling-omni-reference','kie-kling-omni-transform','kie-motion-control','apimart-generic','apimart-kling','apimart-kling-v26','apimart-kling-omni','apimart-motion-control'] as const;
export type JobVideoLayout=typeof JOB_VIDEO_LAYOUTS[number];
export const isJobVideoLayout=(value:string):value is JobVideoLayout=>(JOB_VIDEO_LAYOUTS as readonly string[]).includes(value);
export const jobVideoProtocol=(layout:string)=>isJobVideoLayout(layout)?layout.startsWith('kie-')?'kie':'apimart':undefined;
export function jobVideoIntents(layout:string):string[]|undefined{
 if(!isJobVideoLayout(layout))return undefined;
 if(['kie-kling','kie-kling-v26','apimart-kling','apimart-kling-v26'].includes(layout))return ['text','single_image','frames_required','first_optional','last_optional','reference'];
 if(layout.endsWith('motion-control'))return ['motion_control'];
 if(layout==='kie-kling-omni-text')return ['text'];
 if(layout==='kie-kling-omni-image')return ['single_image','frames_required','reference'];
 if(layout==='kie-kling-omni-reference')return ['reference','video_edit'];
 if(layout==='kie-kling-omni-transform')return ['video_edit','reference'];
 return ['text','single_image','frames_required','first_optional','last_optional','reference','video_edit','extend'];
}
/** One executable structure mapping drives serialization and presentation. */
export function jobStructureMaps(layout:string):{shots?:z.infer<typeof shotsMapping>;elements?:z.infer<typeof elementsMapping>}{
 const base={wireField:'multi_prompt',promptField:'prompt',durationField:'duration'};
 if(layout==='apimart-kling')return {shots:{...base,indexField:'index',constants:{multi_shot:true,shot_type:'customize'}},elements:{wireField:'element_list',nameField:'name',descriptionField:'description',max:3,media:[{kinds:['image'],wireField:'element_input_urls',min:1,max:4}]}};
 if(layout==='kie-kling')return {shots:{...base,constants:{multi_shots:true}},elements:{wireField:'kling_elements',nameField:'name',descriptionField:'description',media:[{kinds:['image','video'],wireField:'element_input_urls'},{kinds:['audio'],wireField:'element_input_audio_urls'}]}};
 if(layout.startsWith('kie-kling-omni-')&&layout!=='kie-kling-omni-transform')return {shots:{...base,max:6,constants:{customize_multi_shots:true,...(layout==='kie-kling-omni-reference'?{}:{prefer_multi_shots:false})}},elements:{wireField:'elements',nameField:'name',descriptionField:'description',media:[{kinds:['image','video'],wireField:'element_input_urls'},{kinds:['audio'],wireField:'element_input_audio_urls'}]}};
 return {};
}
export function jobStructurePresentation(layout:string,intent?:string):VideoUiContract['operations'][number]['structure']{
 if(intent==='video_edit'&&layout==='kie-kling-omni-reference')return undefined;
 const {shots,elements}=jobStructureMaps(layout);if(!shots&&!elements)return undefined;
 return {...(shots?{shots:{min:shots.min,max:shots.max,maxPromptChars:shots.maxPromptChars,minDurationSeconds:shots.minDurationSeconds,durationStep:shots.durationStep}}:{}),...(elements?{elements:{min:elements.min,max:elements.max,media:elements.media.map(m=>({kinds:m.kinds,min:m.min,max:m.max}))}}:{})};
}
