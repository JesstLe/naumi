import type {PoolClient} from 'pg';
import type {LegacySource} from './creation-history-identity';
import {TeamError} from '@/lib/teams/errors';
const sourceKinds:Record<LegacySource['table'],string[]|null>={app_image_jobs:['image:generate','image:imagegen','image:suite','image:aplus'],app_canvas_image_tasks:['canvas-image','canvas'],app_video_tasks:['video'],app_artworks:null};

/** A historical route cannot strip a positively recorded foreign tenant. */
export async function assertLegacySourceTenant(tx:Pick<PoolClient,'query'>,ref:LegacySource,tenantId?:string){
 if(!tenantId)return;
 if(!(await tx.query("SELECT to_regclass('app_creation_records') IS NOT NULL AND to_regclass('app_creation_links') IS NOT NULL AS ready")).rows[0]?.ready)return;
 const result=await tx.query(`SELECT 1 FROM app_creation_records c WHERE c.actor_email=$1 AND c.tenant_id IS NOT NULL AND c.tenant_id<>$4::uuid AND (
 (c.source_kind=ANY($2::text[]) AND c.source_id=$3) OR EXISTS(SELECT 1 FROM app_creation_links l WHERE l.creation_id=c.id AND l.actor_email=c.actor_email AND l.target_id=$3
 AND (l.target_type=ANY($2::text[]) OR $2::text[] IS NULL AND l.target_type='artwork' AND l.relation='output'))) LIMIT 1`,[ref.email,sourceKinds[ref.table],ref.id,tenantId]);
 if(result.rowCount)throw new TeamError('记录不存在或无权访问',404);
}

/** Exact immutable link only. Never infer a creation from dates, prompts or current membership. */
export async function linkedCreation(tx:PoolClient,ref:LegacySource,tenantId?:string){
 const kinds=sourceKinds[ref.table];
 if(!(await tx.query("SELECT to_regclass('app_creation_records') IS NOT NULL AND to_regclass('app_creation_links') IS NOT NULL AS ready")).rows[0]?.ready)return null;
 return (await tx.query(`SELECT c.id,c.actor_email,c.tenant_id FROM app_creation_records c
 WHERE c.actor_email=$1 AND ($4::uuid IS NULL OR c.tenant_id=$4 OR c.tenant_id IS NULL AND c.scope_kind='personal') AND (
 ($2::text[] IS NOT NULL AND c.source_kind=ANY($2) AND c.source_id=$3) OR EXISTS(
 SELECT 1 FROM app_creation_links l WHERE l.creation_id=c.id AND l.actor_email=c.actor_email AND l.target_id=$3
 AND (l.target_type=ANY($2) OR $2::text[] IS NULL AND l.target_type='artwork' AND l.relation='output')))
 ORDER BY CASE WHEN c.source_id=$3 AND c.source_kind=ANY($2) THEN 0 ELSE 1 END,c.accepted_at,c.id LIMIT 1`,[ref.email,kinds,ref.id,tenantId||null])).rows[0]||null;
}
