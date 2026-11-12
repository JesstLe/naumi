import {z} from 'zod';
import {TeamError} from '@/lib/teams/errors';
const source=z.object({table:z.enum(['app_image_jobs','app_canvas_image_tasks','app_video_tasks','app_artworks']),id:z.string().min(1).max(240),email:z.string().min(1).max(254)});
export type LegacySource=z.infer<typeof source>;
export function legacyCreationId(value:LegacySource){return `legacy-${Buffer.from(JSON.stringify(value)).toString('base64url')}`;}
export function parseLegacyCreationId(id:string):LegacySource{try{if(id.length>1600||!id.startsWith('legacy-'))throw new Error();return source.parse(JSON.parse(Buffer.from(id.slice(7),'base64url').toString()));}catch{throw new TeamError('记录不存在或无权访问',404);}}
