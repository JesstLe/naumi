import {z} from 'zod';
import {id} from './contracts';
export const PART_BYTES=4*1024*1024,MAX_MULTIPART_BYTES=512*1024*1024;
export const multipartName=z.string().min(1).max(180).refine(s=>!/[\u0000-\u001f\u007f/\\]/.test(s)&&s.trim()===s&&s!=='.'&&s!=='..');
export const uploadSessionSchema=z.strictObject({sessionId:id,orderId:id,taskId:id,expectedVersion:z.number().int().positive(),name:multipartName,bytes:z.number().int().min(1).max(MAX_MULTIPART_BYTES),parts:z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(128)}).refine(c=>c.parts.length===Math.ceil(c.bytes/PART_BYTES),'INVALID_PART_COUNT');
export function partBytes(bytes:number,index:number){return Math.min(PART_BYTES,bytes-index*PART_BYTES);}
