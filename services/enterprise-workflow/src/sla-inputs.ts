import type {PoolClient} from 'pg';
import {WorkflowError} from './contracts';
import type {SlaEvent} from './sla-domain';

type OrderInputs={events:SlaEvent[];panels:Record<string,string[]>};

/** Preserve the old 1,000 distinct event groups per order and the most recent
 * event in each group, without hydrating notes, assets, or other event data. */
export async function loadSlaInputs(tx:PoolClient,enterpriseId:string,orders:readonly string[]){
 const result=new Map<string,OrderInputs>();
 if(!orders.length)return result;
 const {rows}=await tx.query<{id:string;events:SlaEvent[]}>(`SELECT wanted.id,ARRAY(
   SELECT DISTINCT ON (fields.task,fields.kind,fields.batch)
    jsonb_build_object('id',e.event->'id','occurredAt',e.event->'occurredAt','aggregateVersion',e.event->'aggregateVersion',
     'data',jsonb_build_object('action',jsonb_build_object('type',fields.kind,'taskId',e.event#>'{data,action,taskId}',
      'taskIds',e.event#>'{data,action,taskIds}','operation',jsonb_build_object('type',e.event#>'{data,action,operation,type}'))))
   FROM enterprise_workflow.events e
   CROSS JOIN LATERAL (SELECT COALESCE(e.event#>>'{data,action,taskId}','') task,e.event#>>'{data,action,type}' kind,
    CASE WHEN e.event#>>'{data,action,type}'='batch-tasks' THEN e.event#>>'{data,action,taskIds}' ELSE '' END batch) fields
   WHERE e.enterprise_id=$1 AND e.order_id=wanted.id AND fields.kind IN ('submit-requirement','publish','release','assign','batch-tasks','block','submit-delivery')
    AND (fields.kind<>'batch-tasks' OR e.event#>>'{data,action,operation,type}'='assign')
   ORDER BY fields.task,fields.kind,fields.batch,e.aggregate_version DESC LIMIT 1001) events
  FROM unnest($2::uuid[]) wanted(id)`,[enterpriseId,orders]);
 const submitted:string[]=[];
 for(const row of rows){
  if(row.events.length>1000)throw new WorkflowError(422,'SLA_EVENT_RANGE_TOO_LARGE');
  result.set(row.id,{events:row.events,panels:Object.create(null)});
  for(const event of row.events)if(event.data.action?.type==='submit-delivery')submitted.push(event.id);
 }
 if(submitted.length){
  const {rows:panels}=await tx.query<{order_id:string;submission_id:string;reviewers:string[]}>(`SELECT order_id,submission_id,document->'reviewers' reviewers
   FROM enterprise_workflow.delivery_reviews WHERE enterprise_id=$1 AND order_id=ANY($2::uuid[]) AND submission_id=ANY($3::text[])`,[enterpriseId,orders,submitted]);
  for(const panel of panels)result.get(panel.order_id)!.panels[panel.submission_id]=panel.reviewers;
 }
 return result;
}
