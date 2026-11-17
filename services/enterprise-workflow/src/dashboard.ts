import {z} from 'zod';
import type {Pool} from 'pg';
import type {Principal,WorkOrder,Task} from './contracts';
import type {ResolveActor} from './store';
import {readScope} from './read-scope';
import {readWithCurrentScope} from './read-transaction';

export const dashboardQuery=z.strictObject({scope:z.enum(['all','mine']).default('all'),queue:z.enum(['all','pending','running','review','accepted','overdue','today']).default('all'),todoPage:z.coerce.number().int().min(1).max(10000).default(1)});
type DashboardData={
 counts:{pending:number;running:number;review:number;accepted:number;total:number;overdue:number;dueToday:number};
 tasks:{order:Pick<WorkOrder,'id'|'title'|'status'|'version'|'teamId'>;task:Pick<Task,'id'|'title'|'kind'|'status'|'assignee'|'percent'|'dueAt'|'points'>&{handoverPending:boolean};overdue:boolean;intent:string|null}[];
 taskTotal:number;todoTotal:number;
 todos:{key:string;entity:'task'|'order';orderId:string;taskId:string|null;title:string;orderTitle:string;version:number;intent:string}[];
 activity:{id:string;orderId:string;orderTitle:string;type:string;actor:string;at:string;version:number;taskId:string|null}[];
};
// No task mutation, cached permission, source table or historical-import status here.
export async function readDashboard(pool:Pool,resolveActor:ResolveActor,p:Principal,raw:unknown,now:()=>Date){
 const q=dashboardQuery.parse(raw);
 return readWithCurrentScope(pool,resolveActor,p,async(tx,a)=>{
  const at=now(),asOf=at.toISOString(),day=new Date(+at+8*3600000).toISOString().slice(0,10),todayStart=new Date(day+'T00:00:00+08:00').toISOString(),todayEnd=new Date(Date.parse(todayStart)+86400000).toISOString();
  const has=(s:typeof a.permissions[number])=>a.permissions.includes(s);
  const values=[a.enterpriseId,a.teamId??null,has('manage')||has('dispatch')||has('review'),a.subject,has('execute'),a.workKinds,has('manage')||has('dispatch'),q.scope,q.queue,asOf,todayStart,todayEnd,has('dispatch'),has('review'),has('request'),has('manage'),(q.todoPage-1)*30];
  const data=(await tx.query(`WITH
   visible AS MATERIALIZED (SELECT o.id,o.document d FROM enterprise_workflow.orders o WHERE o.enterprise_id=$1 AND ${readScope('o.document','$7')}),
   flat AS MATERIALIZED (
    SELECT o.id order_id,o.d,t,(o.d->>'teamId') IS NOT DISTINCT FROM $2::text execution,
     COALESCE(t->>'assignee'=$4,false) mine,COALESCE(t->'pendingHandover'->>'to'=$4,false) incoming,
     COALESCE(t->'pendingHandover','null'::jsonb)<>'null'::jsonb handover,
     COALESCE(t->>'assignee'=$4,false) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(t->'handoverHistory','[]'::jsonb)) h WHERE h->>'outcome'='accepted' AND (h->>'from'=$4 OR h->>'to'=$4)) participated,
     NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(t->'dependencyIds') dep WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o.d->'tasks') x WHERE x->>'id'=dep AND x->>'status'='accepted')) dependencies_ready,
     (t->>'dueAt')::timestamptz due_at
    FROM visible o CROSS JOIN LATERAL jsonb_array_elements(o.d->'tasks') t
   ),
   intents AS MATERIALIZED (
    SELECT *,CASE WHEN d->>'status'<>'active' OR NOT execution THEN NULL
      WHEN handover THEN CASE WHEN incoming AND $5::boolean AND t->>'kind'=ANY($6::text[]) THEN 'handover' END
      WHEN t->>'status'='review' AND $14::boolean AND NOT participated THEN 'review'
      WHEN mine AND $5::boolean AND t->>'kind'=ANY($6::text[]) THEN CASE
       WHEN t->>'status'='in_progress' THEN 'execute'
       WHEN t->>'status'='blocked' THEN 'resume'
       WHEN t->>'status' IN ('claimed','rework') AND dependencies_ready THEN 'start'
       WHEN t->>'status'='assigned' AND dependencies_ready THEN 'confirm' END
      WHEN t->>'status'='open' AND $5::boolean AND t->>'kind'=ANY($6::text[]) AND t->>'assignee' IS NULL AND dependencies_ready THEN 'claim'
      WHEN t->>'status'='open' AND $13::boolean THEN 'assign' END intent,
     d->>'status'='active' AND t->>'status'<>'accepted' AND due_at<$10::timestamptz overdue,
     CASE WHEN t->>'status'='accepted' THEN 'accepted' WHEN t->>'status' IN ('open','assigned') THEN 'pending' WHEN t->>'status'='review' THEN 'review' ELSE 'running' END bucket
    FROM flat
   ),
   selected AS MATERIALIZED (SELECT * FROM intents WHERE (d->>'status'='active' OR t->>'status'='accepted') AND ($8='all' OR mine OR incoming)),
   overview AS (SELECT * FROM selected WHERE ($9='all' OR bucket=$9 OR $9='overdue' AND overdue OR $9='today' AND d->>'status'='active' AND t->>'status'<>'accepted' AND due_at>=$11::timestamptz AND due_at<$12::timestamptz) ORDER BY due_at,order_id,t->>'id' LIMIT 8),
   todo AS MATERIALIZED (
    SELECT 'task:'||(t->>'id') key,'task' entity,order_id,t->>'id' task_id,t->>'title' title,d->>'title' order_title,(d->>'version')::int version,intent,
     CASE intent WHEN 'handover' THEN 10 WHEN 'review' THEN 20 WHEN 'confirm' THEN 30 WHEN 'resume' THEN 40 WHEN 'start' THEN 50 WHEN 'claim' THEN 60 WHEN 'assign' THEN 60 ELSE 70 END priority,due_at
    FROM intents WHERE intent IS NOT NULL
    UNION ALL
    SELECT 'order:'||id,'order',id,NULL,d->>'title',d->>'title',(d->>'version')::int,
     CASE WHEN d->>'status'='draft' THEN 'draft' WHEN d->>'status'='submitted' THEN 'intake' WHEN d->>'status'='approved' THEN 'plan' ELSE 'operations' END,
     CASE WHEN d->>'status'='completed' THEN 20 WHEN d->>'status'='submitted' THEN 30 WHEN d->>'status'='approved' THEN 40 ELSE 80 END,(d->>'createdAt')::timestamptz
    FROM visible WHERE
     ((d->>'teamId') IS NOT DISTINCT FROM $2::text AND (
       d->>'status'='draft' AND $15::boolean AND (d->>'requester'=$4 OR $16::boolean)
       OR d->>'status' IN ('submitted','approved') AND $13::boolean))
     OR (d->>'status'='completed' AND COALESCE(d->'operations','null'::jsonb)='null'::jsonb
       AND COALESCE(d->>'requestTeamId',d->>'teamId') IS NOT DISTINCT FROM $2::text
       AND ($16::boolean OR d->>'requester'=$4 AND $15::boolean)
       AND NOT EXISTS(SELECT 1 FROM flat f WHERE f.order_id=visible.id AND f.participated))
   ),
   todo_page AS (SELECT * FROM todo ORDER BY priority,due_at,key LIMIT 30 OFFSET $17),
   recent AS (SELECT e.event,o.d,e.id,o.id order_id FROM enterprise_workflow.events e JOIN visible o ON o.id=e.order_id WHERE e.enterprise_id=$1
      AND ($8='all' OR e.event->>'actor'=$4 OR EXISTS(SELECT 1 FROM flat f WHERE f.order_id=o.id AND f.t->>'id'=e.event#>>'{data,action,taskId}' AND (f.mine OR f.incoming)))
     ORDER BY (e.event->>'occurredAt')::timestamptz DESC,e.order_id,e.aggregate_version DESC LIMIT 10)
   SELECT jsonb_build_object(
    'counts',(SELECT jsonb_build_object('pending',count(*) FILTER(WHERE bucket='pending'),'running',count(*) FILTER(WHERE bucket='running'),'review',count(*) FILTER(WHERE bucket='review'),'accepted',count(*) FILTER(WHERE bucket='accepted'),'total',count(*),'overdue',count(*) FILTER(WHERE overdue),'dueToday',count(*) FILTER(WHERE d->>'status'='active' AND t->>'status'<>'accepted' AND due_at>=$11::timestamptz AND due_at<$12::timestamptz)) FROM selected),
    'tasks',COALESCE((SELECT jsonb_agg(jsonb_build_object('order',jsonb_build_object('id',order_id,'title',d->>'title','status',d->>'status','version',(d->>'version')::int,'teamId',d->>'teamId'),
      'task',jsonb_build_object('id',t->>'id','title',t->>'title','kind',t->>'kind','status',t->>'status','assignee',t->>'assignee','percent',(t->>'percent')::int,'dueAt',t->>'dueAt','points',(t->>'points')::int,'handoverPending',handover),'overdue',overdue,'intent',intent) ORDER BY due_at,order_id,t->>'id') FROM overview),'[]'::jsonb),
    'taskTotal',(SELECT count(*) FROM selected WHERE ($9='all' OR bucket=$9 OR $9='overdue' AND overdue OR $9='today' AND d->>'status'='active' AND t->>'status'<>'accepted' AND due_at>=$11::timestamptz AND due_at<$12::timestamptz)),
    'todos',COALESCE((SELECT jsonb_agg(jsonb_build_object('key',key,'entity',entity,'orderId',order_id,'taskId',task_id,'title',title,'orderTitle',order_title,'version',version,'intent',intent) ORDER BY priority,due_at,key) FROM todo_page),'[]'::jsonb),
    'todoTotal',(SELECT count(*) FROM todo),
    'activity',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'orderId',order_id,'orderTitle',d->>'title','type',event#>>'{data,action,type}','actor',event->>'actor','at',event->>'occurredAt','version',(event->>'aggregateVersion')::int,
       'taskId',CASE WHEN EXISTS(SELECT 1 FROM flat f WHERE f.order_id=recent.order_id AND f.t->>'id'=event#>>'{data,action,taskId}') THEN event#>>'{data,action,taskId}' ELSE NULL END) ORDER BY (event->>'occurredAt')::timestamptz DESC,order_id,(event->>'aggregateVersion')::int DESC) FROM recent),'[]'::jsonb)
   ) data`,values)).rows[0].data as DashboardData;
  return {...data,asOf,timezone:'Asia/Shanghai',day,scope:q.scope,queue:q.queue,todoPage:q.todoPage,todoPageSize:30,taskLimit:8,activityLimit:10,viewer:{subject:a.subject,teamId:a.teamId??null,permissions:a.permissions}};
 },result=>[...result.tasks.map(row=>row.order.id),...result.todos.map(row=>row.orderId),...result.activity.map(row=>row.orderId)]);
}
