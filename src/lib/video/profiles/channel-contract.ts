import {z} from 'zod';
import {shotsMapping} from './structured-json';
import type {VideoUiContract} from '../ui-contract';
export const CHANNEL_VIDEO_LAYOUTS=['apimart-apib-seedance','apimart-apib-kling','apimart-apib-wan','apimart-apib-h3','geek-kling','geek-wan3','apib-video-v2','geek-video-v2','geek-h3-v2','apib-video-v3','geek-wan3-v3','geek-h3-v3','apib-storyboard-v4'] as const;
export const isChannelVideoLayout=(layout:string)=>(CHANNEL_VIDEO_LAYOUTS as readonly string[]).includes(layout);
export const channelVideoProtocol=(layout:string)=>!isChannelVideoLayout(layout)?undefined:layout.startsWith('apimart-')||layout.startsWith('apib-')?'apimart':layout.startsWith('geek-h3')?'minimax':'openai-videos';
/** Executable field choices, not model descriptions or verified-name lists. */
export const channelVideoMappingSchema=z.strictObject({
 kind:z.enum(['apib-flat','apib-seedance20','apib-seedance25','apib-wan3','apib-kling-feature','apib-h3','geek-kling','geek-wan','geek-h3','geek-h3-multimodal']),
 resolutionCase:z.enum(['upper','lower','preserve']),
 resolutionField:z.enum(['resolution','mode']).optional(),
 frameImages:z.enum(['urls','roles','named','first-only']).optional(),
 referenceImages:z.enum(['urls','roles']).optional(),
 ratio:z.strictObject({field:z.enum(['size','aspect_ratio']),frames:z.enum(['omit','adaptive','value']),omitDefault:z.string().optional(),mapping:z.record(z.string(),z.string()).optional()}).optional(),
 audio:z.strictObject({deniedModes:z.array(z.string()).optional(),denyLastFrame:z.boolean().optional()}).optional(),
 shots:shotsMapping.optional(),
});
export type ChannelVideoMapping=z.infer<typeof channelVideoMappingSchema>;
export function channelMappingMatches(layout:string,c:ChannelVideoMapping):boolean{
 if(!isChannelVideoLayout(layout))return false;
 if(c.shots&&layout!=='apib-storyboard-v4')return false;
 if(c.kind!=='apib-flat'&&(c.frameImages||c.referenceImages||c.ratio))return false;
 if(!c.kind.startsWith('apib-')&&c.resolutionField!==undefined)return false;
 if(c.kind==='apib-kling-feature'&&c.resolutionField!=='mode')return false;
 if(!['apib-flat','apib-kling-feature','geek-kling'].includes(c.kind)&&c.audio)return false;
 if(layout.startsWith('apimart-apib-'))return c.kind==='apib-flat';
 if(layout==='apib-video-v2')return c.kind==='apib-flat';
 if(layout==='apib-video-v3')return ['apib-seedance20','apib-seedance25','apib-wan3','apib-kling-feature','apib-h3'].includes(c.kind);
 if(layout==='apib-storyboard-v4')return !!c.shots&&['apib-flat','apib-kling-feature'].includes(c.kind);
 if(layout==='geek-kling')return c.kind==='geek-kling';
 if(layout==='geek-wan3'||layout==='geek-wan3-v3')return c.kind==='geek-wan';
 if(layout==='geek-video-v2')return ['geek-kling','geek-wan'].includes(c.kind);
 return layout==='geek-h3-v2'?c.kind==='geek-h3':layout==='geek-h3-v3'&&c.kind==='geek-h3-multimodal';
}
export const channelVideoIntents=(layout:string)=>!isChannelVideoLayout(layout)?undefined:['text','single_image','frames_required','first_optional','last_optional','reference','video_edit'];
export function channelOperationMatches(c:ChannelVideoMapping,intent:string):boolean{
 if(c.kind==='geek-kling')return ['text','single_image','reference'].includes(intent);
 if(c.kind==='geek-wan')return ['text','single_image','frames_required','reference'].includes(intent);
 if(c.kind==='apib-flat')return ['single_image','frames_required','first_optional','last_optional'].includes(intent)?!!c.frameImages:intent==='reference'?!!c.referenceImages:['text','video_edit'].includes(intent);
 return ['text','single_image','frames_required','first_optional','last_optional','reference'].includes(intent);
}
export function channelStructurePresentation(c:ChannelVideoMapping|undefined):VideoUiContract['operations'][number]['structure']{
 const shots=c?.shots;return shots?{shots:{min:shots.min,max:shots.max,maxPromptChars:shots.maxPromptChars,minDurationSeconds:shots.minDurationSeconds,durationStep:shots.durationStep}}:undefined;
}
