import 'server-only';
import {z} from 'zod';
import {decryptAtRest} from '../settings';
import {videoWorkflowManifestSchema} from './workflow-schema';
import {videoModelBindingSchema} from './execution-contract';
import {ModelConfigError} from '../model-config/types';
import type {VideoTaskRow} from './task-types';
const name=z.string().min(1).max(160);
export const byocVideoSnapshotSchema=z.strictObject({actor:z.string(),providerId:name,endpointId:name,baseUrl:z.url(),credentialRef:z.uuid().optional(),manifest:videoWorkflowManifestSchema,executionBinding:videoModelBindingSchema.optional()});
export function readByocVideoSnapshot(actor:string,task:VideoTaskRow){
 const plain=typeof task.parameters.byocSnapshot==='string'?decryptAtRest(task.parameters.byocSnapshot):null;
 if(!plain)throw new ModelConfigError('BYOC_SNAPSHOT_UNAVAILABLE','自备视频工作流快照不可用',503);
 let snapshot:z.infer<typeof byocVideoSnapshotSchema>;try{snapshot=byocVideoSnapshotSchema.parse(JSON.parse(plain));}catch{throw new ModelConfigError('BYOC_SNAPSHOT_UNAVAILABLE','自备视频工作流快照无效',503);}
 if(snapshot.actor!==actor.toLowerCase()||snapshot.providerId!==task.providerId)throw new ModelConfigError('BYOC_OWNER_MISMATCH','自备视频任务归属不一致',403);
 return snapshot;
}
