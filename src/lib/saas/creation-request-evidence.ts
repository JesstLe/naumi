import 'server-only';
import type {PoolClient} from 'pg';
import {creationRequestFacts} from './creation-parameters';

/** Exact owner + immutable source key. This read never repairs evidence or replays work. */
export async function creationRequestEvidence(tx:PoolClient,record:{source_kind:string;source_id:string;actor_email:string}){
 const args=[record.source_id,record.actor_email];
 if(record.source_kind.startsWith('image:')){
  const row=(await tx.query(`SELECT jsonb_build_object(
   'p',(payload->'p')-ARRAY['images','mask'],
   'plan',jsonb_build_object('request',(payload#>'{plan,request}')-'inputs'),
   'request',(payload->'request')-'inputs','parameters',payload->'parameters','prompt',payload->'prompt') AS payload
   FROM app_image_jobs WHERE id=$1 AND email=$2 AND kind=$3`,[...args,record.source_kind.slice(6)])).rows[0];
  return creationRequestFacts(row?.payload);
 }
 if(record.source_kind==='canvas-image'||record.source_kind==='video'){
  const table=record.source_kind==='video'?'app_video_tasks':'app_canvas_image_tasks';
  const row=(await tx.query(`SELECT parameters,${record.source_kind==='video'?'prompt':'NULL::text AS prompt'} FROM ${table} WHERE id=$1 AND email=$2`,args)).rows[0];
  return creationRequestFacts({},row?.parameters,row?.prompt);
 }
 return {text:null,values:{}};
}
