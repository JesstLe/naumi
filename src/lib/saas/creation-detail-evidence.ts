import 'server-only';
import type {PoolClient} from 'pg';
import {creationAssetKeysSql,creationAssetViewOrder} from './creation-asset-view';

export const creationFamilySql=`WITH RECURSIVE family AS(
 SELECT id,parent_id,actor_email,tenant_id,accepted_at FROM app_creation_records WHERE id=$1
 UNION ALL SELECT c.id,c.parent_id,c.actor_email,c.tenant_id,c.accepted_at FROM app_creation_records c
 JOIN family p ON c.parent_id=p.id AND c.actor_email=p.actor_email AND c.tenant_id IS NOT DISTINCT FROM p.tenant_id)`;
export const evidencePageSize=24;
/** A child page needs only immediate edges with the same owner and tenant. */
export async function readCreationChildPage(tx:PoolClient,id:string,page:number){
 const size=evidencePageSize;
 const {rows:[result]}=await tx.query<{child_ids:string[];child_total:number}>(`WITH child_keys AS MATERIALIZED(
  SELECT c.id,c.accepted_at FROM app_creation_records p JOIN app_creation_records c
  ON c.parent_id=p.id AND c.actor_email=p.actor_email AND c.tenant_id IS NOT DISTINCT FROM p.tenant_id WHERE p.id=$1)
  SELECT (SELECT count(*)::int FROM child_keys) AS child_total,
   ARRAY(SELECT id FROM child_keys ORDER BY accepted_at,id LIMIT $2 OFFSET $3) AS child_ids`,[id,size,(page-1)*size]);
 return result;
}
/** Sort the covered event keys first. Large summaries and internal event
 * fields should only be read for the selected page, never kept in the sort. */
export const creationEventPageSql=`${creationFamilySql},
 event_page_keys AS MATERIALIZED(
  SELECT e.id,e.occurred_at FROM app_creation_events e JOIN family f ON f.id=e.creation_id
  ORDER BY e.occurred_at,e.id LIMIT $2 OFFSET $3
 )
 SELECT e.id,e.event_key,e.type,e.status,e.summary,e.occurred_at,e.observed_at
 FROM event_page_keys k JOIN app_creation_events e ON e.id=k.id
 ORDER BY k.occurred_at,k.id`;
// Opt-in exact pagination. The count and the page see the same family and
// event keys; materialize only keys, never event summaries for the count.
export const creationEventPageWithTotalSql=`${creationFamilySql},
 event_keys AS MATERIALIZED(
  SELECT e.id,e.occurred_at FROM app_creation_events e JOIN family f ON f.id=e.creation_id
 ),
 event_page AS(
  SELECT e.id,e.event_key,e.type,e.status,e.summary,e.occurred_at,e.observed_at
  FROM (SELECT * FROM event_keys ORDER BY occurred_at,id LIMIT $2 OFFSET $3) k
  JOIN app_creation_events e ON e.id=k.id
 )
 SELECT (SELECT count(*)::int FROM event_keys) AS total,
  COALESCE((SELECT jsonb_agg(e ORDER BY e.occurred_at,e.id) FROM event_page e),'[]'::jsonb) AS items`;
type EvidencePages={assets:number;events:number;children:number};
type ReadRow={
 assets:Record<string,any>[];events:Record<string,any>[];child_ids:string[];
 asset_total:number;event_total:number;child_total:number;
 operations:Record<string,any>[];refunds:number|null;no_charge:boolean;
};
const assetPageSql=`asset_rows AS(SELECT to_jsonb(a) AS data,0 AS priority FROM app_creation_assets a JOIN family f ON f.id=a.creation_id
 UNION ALL SELECT value,1 FROM jsonb_array_elements($2::jsonb)),${creationAssetKeysSql},
 asset_page AS MATERIALIZED(SELECT * FROM representatives ORDER BY ${creationAssetViewOrder} LIMIT $3 OFFSET $4),
 asset_roles AS(SELECT a.asset_key,jsonb_agg(DISTINCT a.data->>'role' ORDER BY a.data->>'role') AS roles
 FROM keyed_assets a JOIN asset_page p ON p.asset_key=a.asset_key GROUP BY a.asset_key)`;
const assetFields=`(SELECT COUNT(*)::int FROM representatives) AS asset_total,
 COALESCE((SELECT jsonb_agg(p.data||jsonb_build_object('roles',r.roles) ORDER BY ${creationAssetViewOrder}) FROM asset_page p JOIN asset_roles r USING(asset_key)),'[]'::jsonb) AS assets`;

export async function readCreationAssetPage(tx:PoolClient,id:string,recovered:Record<string,unknown>[],page:number){
 const size=evidencePageSize;
 const {rows:[result]}=await tx.query<Pick<ReadRow,'assets'|'asset_total'>>(`${creationFamilySql},${assetPageSql} SELECT ${assetFields}`,
  [id,JSON.stringify(recovered),size,(page-1)*size]);
 return result;
}

/** One authorized family and one set of dedup keys; expand only the selected evidence and child pages. */
export async function readCreationDetailEvidence(tx:PoolClient,id:string,recovered:Record<string,unknown>[],pages:EvidencePages){
 const size=evidencePageSize,offset=(page:number)=>(page-1)*size;
 const {rows:[result]}=await tx.query<ReadRow>(`${creationFamilySql},${assetPageSql},
 event_keys AS MATERIALIZED(SELECT e.id,e.occurred_at FROM app_creation_events e JOIN family f ON f.id=e.creation_id),
 event_page AS(SELECT e.id,e.event_key,e.type,e.status,e.summary,e.occurred_at,e.observed_at
  FROM (SELECT * FROM event_keys ORDER BY occurred_at,id LIMIT $3 OFFSET $5) k JOIN app_creation_events e ON e.id=k.id),
 child_keys AS MATERIALIZED(SELECT id,accepted_at FROM family WHERE parent_id=$1),
 child_page AS(SELECT id,accepted_at FROM child_keys ORDER BY accepted_at,id LIMIT $3 OFFSET $6),
 billing_links AS MATERIALIZED(SELECT l.target_id,l.actor_email,l.reserved_credits,l.released_credits
  FROM app_creation_links l JOIN family f ON f.id=l.creation_id WHERE l.target_type='billing'),
 billing_ops AS(SELECT o.id,o.state,o.charged_credits,o.quote,max(l.reserved_credits) AS evidence_reserved,max(l.released_credits) AS evidence_released
  FROM billing_links l JOIN app_billing_operations o ON o.id=l.target_id AND o.email=l.actor_email GROUP BY o.id)
 SELECT
  ${assetFields},
  (SELECT COUNT(*)::int FROM event_keys) AS event_total,
  COALESCE((SELECT jsonb_agg(e ORDER BY e.occurred_at,e.id) FROM event_page e),'[]'::jsonb) AS events,
  (SELECT COUNT(*)::int FROM child_keys) AS child_total,
  ARRAY(SELECT id FROM child_page ORDER BY accepted_at,id) AS child_ids,
  COALESCE((SELECT jsonb_agg(o ORDER BY o.id) FROM billing_ops o),'[]'::jsonb) AS operations,
  (SELECT SUM(r.refund_credits)::int FROM app_billing_api_cost_reviews r WHERE r.status IN ('confirmed','refunded') AND EXISTS(SELECT 1 FROM billing_links l WHERE l.target_id=r.operation_id)) AS refunds,
  EXISTS(SELECT 1 FROM app_creation_links WHERE creation_id=$1 AND target_type='no-charge' AND relation='explicit-no-charge') AS no_charge`,
 [id,JSON.stringify(recovered),size,offset(pages.assets),offset(pages.events),offset(pages.children)]);
 return result;
}
