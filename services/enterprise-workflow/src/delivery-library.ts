import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {Actor} from './contracts';
import {readScope} from './read-scope';
export const deliveryLibraryQuery=z.strictObject({query:z.string().max(120).default(''),scope:z.enum(['all','mine']).default('all'),state:z.enum(['all','candidate','submitted','historical','accepted']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1)});
export type LibraryRelation={state:'candidate'|'submitted'|'historical'|'accepted';submission:{id:string;actor:string;at:string;version:number}|null;acceptance:{id:string;actor:string;at:string;version:number}|null};
type LibraryRow={id:string;order_id:string;task_id:string;uploader:string;name:string;bytes:number;sha256:string;revision:number;created_at:string;
 order_title:string;order_status:string;order_version:number;task_title:string|null;task_status:string|null;relation:LibraryRelation};
export type LibraryRows={summary:{total:number;candidate:number;submitted:number;historical:number;accepted:number};total:number;rows:LibraryRow[]};
export async function deliveryLibraryRows(tx:PoolClient,a:Actor,q:z.infer<typeof deliveryLibraryQuery>){
 const has=(p:typeof a.permissions[number])=>a.permissions.includes(p),values=[a.enterpriseId,a.teamId??null,has('manage')||has('dispatch')||has('review'),a.subject,has('execute'),a.workKinds,has('manage')||has('dispatch'),q.query,q.scope,q.state,(q.page-1)*24];
 // Find event evidence once per visible order, rather than walking the same order's history for every file.
 return (await tx.query(`WITH visible AS MATERIALIZED (
  SELECT f.id,f.order_id,f.task_id,f.created_at,o.document->>'title' order_title,o.document->>'status' order_status,o.version order_version,
    t->>'title' task_title,t->>'status' task_status,t->'assetIds' current_ids
  FROM enterprise_workflow.delivery_assets f JOIN enterprise_workflow.orders o ON o.enterprise_id=f.enterprise_id AND o.id=f.order_id
  LEFT JOIN LATERAL (SELECT x t FROM jsonb_array_elements(o.document->'tasks') x WHERE x->>'id'=f.task_id::text LIMIT 1) task ON true
  WHERE o.enterprise_id=$1 AND ${readScope('o.document','$7')} AND ($9='all' OR f.uploader=$4)
    AND ($8='' OR strpos(lower(f.name||' '||(o.document->>'title')||' '||COALESCE(t->>'title','')),lower($8))>0)
 ), relevant_events AS MATERIALIZED (
  SELECT e.id,o.order_id,e.aggregate_version,e.event,
   e.event#>>'{data,action,type}'='submit-delivery' AS submitted,e.event->>'type'='workflow.task.accepted.v1' AS accepted
  FROM (SELECT DISTINCT order_id FROM visible) o
  JOIN LATERAL (SELECT e.id,e.aggregate_version,e.event FROM enterprise_workflow.events e WHERE e.enterprise_id=$1 AND e.order_id=o.order_id
   AND (e.event#>>'{data,action,type}'='submit-delivery' OR e.event->>'type'='workflow.task.accepted.v1') OFFSET 0) e ON true
 ), event_refs AS (
  SELECT id,order_id,aggregate_version,'submission' AS kind,event#>>'{data,action,taskId}' AS task,event#>'{data,action,assetIds}' AS refs
  FROM relevant_events WHERE submitted
  UNION ALL
  SELECT id,order_id,aggregate_version,'acceptance',event#>>'{data,taskId}',event#>'{data,assetIds}' FROM relevant_events WHERE accepted
 ), latest AS MATERIALIZED (
  SELECT DISTINCT ON (f.id,e.kind) f.id AS asset_id,e.kind,e.id AS event_id
  FROM event_refs e
  CROSS JOIN LATERAL jsonb_array_elements_text(CASE jsonb_typeof(e.refs)
    WHEN 'array' THEN e.refs WHEN 'string' THEN jsonb_build_array(e.refs)
    WHEN 'object' THEN (SELECT jsonb_agg(k) FROM jsonb_object_keys(e.refs) k) ELSE '[]'::jsonb END) item(asset_id)
  JOIN visible f ON f.order_id=e.order_id AND f.task_id::text=e.task AND f.id::text=item.asset_id
  ORDER BY f.id,e.kind,e.aggregate_version DESC
 ), facts AS MATERIALIZED (
  SELECT f.id,f.created_at,s.event_id AS submission_id,a.event_id AS acceptance_id,
   CASE WHEN a.event_id IS NOT NULL THEN 'accepted'
    WHEN s.event_id IS NOT NULL AND f.order_status='active' AND f.task_status='review' AND f.current_ids ? f.id::text THEN 'submitted'
    WHEN s.event_id IS NOT NULL THEN 'historical' ELSE 'candidate' END AS business_state
  FROM visible f LEFT JOIN latest s ON s.asset_id=f.id AND s.kind='submission' LEFT JOIN latest a ON a.asset_id=f.id AND a.kind='acceptance'
 ), page_keys AS MATERIALIZED (
  SELECT * FROM facts WHERE $10='all' OR business_state=$10 ORDER BY created_at DESC,id DESC LIMIT 24 OFFSET $11
 ), page AS (
  SELECT d.id,d.order_id,d.task_id,d.uploader,d.name,d.bytes,d.sha256,d.revision,d.created_at,f.order_title,f.order_status,f.order_version,f.task_title,f.task_status,
   jsonb_build_object('state',k.business_state,
    'submission',CASE WHEN s.id IS NOT NULL THEN jsonb_build_object('id',s.id,'actor',s.event->>'actor','at',s.event->>'occurredAt','version',s.aggregate_version) END,
    'acceptance',CASE WHEN a.id IS NOT NULL THEN jsonb_build_object('id',a.id,'actor',a.event->>'actor','at',a.event->>'occurredAt','version',a.aggregate_version) END) AS relation
  FROM page_keys k JOIN visible f ON f.id=k.id JOIN enterprise_workflow.delivery_assets d ON d.enterprise_id=$1 AND d.id=k.id
  LEFT JOIN LATERAL (SELECT id,event,aggregate_version FROM enterprise_workflow.events WHERE enterprise_id=$1 AND id=k.submission_id LIMIT 1) s ON true
  LEFT JOIN LATERAL (SELECT id,event,aggregate_version FROM enterprise_workflow.events WHERE enterprise_id=$1 AND id=k.acceptance_id LIMIT 1) a ON true
 ), counts AS (
  SELECT jsonb_build_object('total',count(*),'candidate',count(*) FILTER(WHERE business_state='candidate'),
   'submitted',count(*) FILTER(WHERE business_state='submitted'),'historical',count(*) FILTER(WHERE business_state='historical'),
   'accepted',count(*) FILTER(WHERE business_state='accepted')) AS summary,
   count(*) FILTER(WHERE $10='all' OR business_state=$10) AS total FROM facts
 )
 SELECT jsonb_build_object('summary',counts.summary,'total',counts.total,
  'rows',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb)) data FROM counts`,values)).rows[0].data as LibraryRows;
}
