import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {Actor} from './contracts';
import {readScope} from './read-scope';
export const deliveryLibraryQuery=z.strictObject({query:z.string().max(120).default(''),scope:z.enum(['all','mine']).default('all'),state:z.enum(['all','candidate','submitted','historical','accepted']).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1)});
export type LibraryRelation={state:'candidate'|'submitted'|'historical'|'accepted';submission:{id:string;actor:string;at:string;version:number}|null;acceptance:{id:string;actor:string;at:string;version:number}|null};
export type LibraryRows={summary:{total:number;candidate:number;submitted:number;historical:number;accepted:number};total:number;rows:(Record<string,any>&{relation:LibraryRelation})[]};
export async function deliveryLibraryRows(tx:PoolClient,a:Actor,q:z.infer<typeof deliveryLibraryQuery>){
 const has=(p:typeof a.permissions[number])=>a.permissions.includes(p),values=[a.enterpriseId,a.teamId??null,has('manage')||has('dispatch')||has('review'),a.subject,has('execute'),a.workKinds,has('manage')||has('dispatch'),q.query,q.scope,q.state,(q.page-1)*24];
 return (await tx.query(`WITH visible AS MATERIALIZED (
  SELECT f.*,o.document->>'title' order_title,o.document->>'status' order_status,(o.document->>'version')::int order_version,
    t->>'title' task_title,t->>'status' task_status,t->'assetIds' current_ids
  FROM enterprise_workflow.delivery_assets f JOIN enterprise_workflow.orders o ON o.enterprise_id=f.enterprise_id AND o.id=f.order_id
  LEFT JOIN LATERAL (SELECT x t FROM jsonb_array_elements(o.document->'tasks') x WHERE x->>'id'=f.task_id::text LIMIT 1) task ON true
  WHERE o.enterprise_id=$1 AND ${readScope('o.document','$7')} AND ($9='all' OR f.uploader=$4)
    AND ($8='' OR strpos(lower(f.name||' '||(o.document->>'title')||' '||COALESCE(t->>'title','')),lower($8))>0)
 ), facts AS MATERIALIZED (
  SELECT f.*,submitted.fact submission,accepted.fact acceptance,
   CASE WHEN accepted.fact IS NOT NULL THEN 'accepted'
    WHEN submitted.fact IS NOT NULL AND f.order_status='active' AND f.task_status='review' AND f.current_ids ? f.id::text THEN 'submitted'
    WHEN submitted.fact IS NOT NULL THEN 'historical' ELSE 'candidate' END business_state
  FROM visible f
  LEFT JOIN LATERAL (SELECT jsonb_build_object('id',e.id,'actor',e.event->>'actor','at',e.event->>'occurredAt','version',e.aggregate_version) fact
   FROM enterprise_workflow.events e WHERE e.enterprise_id=f.enterprise_id AND e.order_id=f.order_id AND e.event#>>'{data,action,type}'='submit-delivery'
    AND e.event#>>'{data,action,taskId}'=f.task_id::text AND (e.event#>'{data,action,assetIds}') ? f.id::text ORDER BY e.aggregate_version DESC LIMIT 1) submitted ON true
  LEFT JOIN LATERAL (SELECT jsonb_build_object('id',e.id,'actor',e.event->>'actor','at',e.event->>'occurredAt','version',e.aggregate_version) fact
   FROM enterprise_workflow.events e WHERE e.enterprise_id=f.enterprise_id AND e.order_id=f.order_id AND e.event->>'type'='workflow.task.accepted.v1'
    AND e.event#>>'{data,taskId}'=f.task_id::text AND (e.event#>'{data,assetIds}') ? f.id::text ORDER BY e.aggregate_version DESC LIMIT 1) accepted ON true
 ), page AS (SELECT *,jsonb_build_object('state',business_state,'submission',submission,'acceptance',acceptance) relation FROM facts WHERE $10='all' OR business_state=$10 ORDER BY created_at DESC,id DESC LIMIT 24 OFFSET $11)
 SELECT jsonb_build_object('summary',(SELECT jsonb_build_object('total',count(*),'candidate',count(*) FILTER(WHERE business_state='candidate'),'submitted',count(*) FILTER(WHERE business_state='submitted'),'historical',count(*) FILTER(WHERE business_state='historical'),'accepted',count(*) FILTER(WHERE business_state='accepted')) FROM facts),
  'total',(SELECT count(*) FROM facts WHERE $10='all' OR business_state=$10),'rows',COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb)) data`,values)).rows[0].data as LibraryRows;
}
