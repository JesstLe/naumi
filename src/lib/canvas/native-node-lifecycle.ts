import "server-only";
import type {PoolClient} from "pg";
import {assertCreationProjectInput} from "../saas/creation-access";
import {CANVAS_NATIVE_NODE_KINDS,type CanvasNativeIds,type CanvasNativeRecords} from "./native-node-records";
import {ensureVideoNodeSchema,ensureDirectorNodeSchema,ensureCharacterNodeSchema,ensureSceneNodeSchema,ensureAudioNodeSchema,ensureTimelineNodeSchema} from "./storage-schema";
import {mapVideoNode} from "./video-node-repository";
import {mapDirectorNode} from "./director-node-repository";
import {mapCharacterNode} from "./character-node-repository";
import {mapSceneNode} from "./scene-node-repository";
import {mapAudioNode} from "./audio-node-repository";
import {mapTimelineNode} from "./timeline-node-repository";

// Concrete table adapters are limited to the existing six native documents.
// Kind-specific payloads, revisions, reference validation and render/task rules
// stay in their original repositories/services.
const storage={
  video:{table:"app_canvas_video_nodes",ensure:ensureVideoNodeSchema,map:mapVideoNode},
  director:{table:"app_canvas_director_nodes",ensure:ensureDirectorNodeSchema,map:mapDirectorNode},
  character:{table:"app_canvas_character_nodes",ensure:ensureCharacterNodeSchema,map:mapCharacterNode},
  scene:{table:"app_canvas_scene_nodes",ensure:ensureSceneNodeSchema,map:mapSceneNode},
  audio:{table:"app_canvas_audio_nodes",ensure:ensureAudioNodeSchema,map:mapAudioNode},
  timeline:{table:"app_canvas_timeline_nodes",ensure:ensureTimelineNodeSchema,map:mapTimelineNode},
};
export function nativeHistoryIds(operations:readonly {type:string;id?:string;video?:boolean;director?:boolean;character?:boolean;scene?:boolean;audio?:boolean;timeline?:boolean}[]):CanvasNativeIds{
  return Object.fromEntries(CANVAS_NATIVE_NODE_KINDS.map(({kind,ids})=>[ids,[...new Set(operations.filter(op=>op.type.startsWith(kind+"-")||op.type==="node-settings"&&op[kind]).flatMap(op=>op.id?[op.id]:[]))]]));
}
export async function ensureNativeNodeSchemas(ids?:CanvasNativeIds){
  for(const entry of CANVAS_NATIVE_NODE_KINDS)if(!ids||ids[entry.ids]?.length)await storage[entry.kind].ensure();
}
export async function readNativeNodeReceiptsTx(tx:PoolClient,actor:string,ids:CanvasNativeIds,lock=false):Promise<CanvasNativeRecords>{
  const receipt:CanvasNativeRecords={};
  for(const entry of CANVAS_NATIVE_NODE_KINDS){
    const requested=ids[entry.ids];if(!requested?.length)continue;
    const adapter=storage[entry.kind];
    const rows=(await tx.query(`SELECT * FROM ${adapter.table} WHERE email=$1 AND id=ANY($2::text[])${lock?" FOR UPDATE":""}`,[actor,requested])).rows;
    if(rows.length!==requested.length)throw new Error("节点不存在或无权修改");
    for(const project of new Set(rows.map(row=>String(row.project_key))))await assertCreationProjectInput(actor,project,tx,true);
    Object.assign(receipt,{[entry.records]:rows.map(row=>adapter.map(row))});
  }
  return receipt;
}
/** Caller holds owner -> graph lock, including receipt replays. No connection,
 * transaction, render/task cancellation or new receipt store is opened here. */
export async function deleteNativeNodesTx(tx:PoolClient,actor:string,ids:CanvasNativeIds){
  await readNativeNodeReceiptsTx(tx,actor,ids,true);
  for(const entry of CANVAS_NATIVE_NODE_KINDS)if(ids[entry.ids]?.length)await tx.query(`UPDATE ${storage[entry.kind].table} SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL`,[actor,ids[entry.ids]]);
  return readNativeNodeReceiptsTx(tx,actor,ids);
}
export async function deleteNativeProjectTx(tx:PoolClient,actor:string,projectKey:string){
  await assertCreationProjectInput(actor,projectKey,tx,true);
  const ids:CanvasNativeIds={};
  for(const entry of CANVAS_NATIVE_NODE_KINDS){const rows=(await tx.query(`SELECT id FROM ${storage[entry.kind].table} WHERE email=$1 AND project_key=$2 FOR UPDATE`,[actor,projectKey])).rows;ids[entry.ids]=rows.map(row=>row.id);}
  return deleteNativeNodesTx(tx,actor,ids);
}

export async function readNativeProjectReceiptsTx(tx:PoolClient,actor:string,projectKey:string){
  const ids:CanvasNativeIds={};
  for(const entry of CANVAS_NATIVE_NODE_KINDS){const rows=(await tx.query(`SELECT id FROM ${storage[entry.kind].table} WHERE email=$1 AND project_key=$2`,[actor,projectKey])).rows;ids[entry.ids]=rows.map(row=>row.id);}
  return readNativeNodeReceiptsTx(tx,actor,ids);
}
