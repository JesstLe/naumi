import 'server-only';
import { z } from 'zod';
import type { TeamActor } from '@/lib/teams/grants';
import { TeamError } from "@/lib/teams/errors";
import { CATEGORY_FEATURES } from '@/lib/billing/feature-map';
import { excludeImportedHistory } from '@/lib/staging-history';
import { enterpriseRead } from './server';
import { PURPOSES, shiftDate, type AnalyticsFilter, type EnterpriseAnalytics, type LedgerEntry } from './analytics-contracts';

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const n=Date.parse(v+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===v},'日期无效');
export const analyticsQuerySchema=z.object({enterpriseId:z.string().uuid(),from:date,to:date,group:z.enum(['day','week','month']).default('day'),email:z.string().max(254).default(''),team:z.string().max(254).default(''),purpose:z.string().refine(v=>v===''||Object.hasOwn(PURPOSES,v)).default(''),kind:z.enum(['','consume','refund','grant','purchase','expire','adjust','other']).default(''),page:z.coerce.number().int().min(1).max(1000000).default(1),format:z.enum(['json','csv']).default('json')}).strict().superRefine((q,c)=>{const span=Date.parse(q.to)-Date.parse(q.from);if(span<0||span>3659*86400000||q.from<'2000-01-01'||q.to>'2100-12-31')c.addIssue({code:z.ZodIssueCode.custom,path:['to'],message:'日期顺序无效或范围超过10年'})});
const literal=(v:string)=>"'"+v.replaceAll("'","''")+"'";
const featureCase=(expr:string)=>`CASE ${expr} ${Object.keys(PURPOSES).filter(k=>k!=='unknown').map(k=>`WHEN ${literal(k)} THEN ${literal(k)}`).join(' ')} ELSE NULL END`;
const categoryCase=(expr:string)=>`CASE ${expr} ${Object.entries({...CATEGORY_FEATURES,image:'image.generate',generate:'image.generate',expand:'canvas.expand','text-edit':'canvas.text-edit',annotate:'canvas.annotate'}).map(([k,v])=>`WHEN ${literal(k)} THEN ${literal(v)}`).join(' ')} ELSE NULL END`;
// Only exact known legacy prefixes become public labels. Raw reasons/quotes/models
// never leave the server, including unknown supplier/model-bearing historical rows.
const historical=`CASE
 WHEN l.reason ~ '^生成 [0-9]+ 张图' THEN 'image.generate'
 WHEN l.reason ~ '^爆款复刻 [0-9]+ 张' THEN 'tool.replicate'
 WHEN l.reason ~ '^一键套图 [0-9]+ 张' THEN 'image.suite'
 WHEN l.reason ~ '^A\\+ 详情页 [0-9]+ 张' THEN 'image.aplus'
 WHEN l.reason IN ('竞品工作台生成','竞品衍生图') THEN 'competitor.action'
 WHEN l.reason ~ '^画布扩图( · (low|medium|high))?$' THEN 'canvas.expand'
 WHEN l.reason ~ '^画布标注编辑( · (low|medium|high))?$' THEN 'canvas.annotate'
 WHEN l.reason='画布在线改字' THEN 'canvas.text-edit'
 ELSE NULL END`;
const ledgerSourceCTE=(window="l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz")=>`WITH ledger_input AS MATERIALIZED (
 SELECT l.id,l.email,l.created_at,l.delta,l.kind,l.reason FROM app_ledger l
 WHERE l.email=ANY($1::text[]) AND ${window} AND ($4::text='' OR l.email=$4)
), operation_keys AS (
 SELECT DISTINCT ON (o.email,o.ledger_id) o.email,o.ledger_id,o.id,o.feature
 FROM app_billing_operations o JOIN ledger_input l ON l.id=o.ledger_id AND l.email=o.email
 ORDER BY o.email,o.ledger_id,o.created_at,o.id
), mapped AS (
 SELECT l.id,l.email,l.created_at,l.delta,l.kind,l.reason,
  COALESCE(o.id,ro.id) AS operation_id,
  COALESCE(${featureCase('o.feature')},${featureCase('ro.feature')},${historical},'unknown') AS purpose,
  CASE WHEN o.id IS NOT NULL OR ro.id IS NOT NULL THEN '计费记录' WHEN ${historical} IS NOT NULL THEN '历史摘要' ELSE '未记录' END AS source,
  CASE WHEN o.feature='credits.adjust' OR l.reason='管理员调整积分' THEN 'adjust'
    WHEN l.kind='refund' AND l.delta>0 OR l.delta>0 AND EXISTS(SELECT 1 FROM app_credit_batches b WHERE b.email=l.email AND b.source='refund' AND b.id='bat-'||substring(l.id from 5)) THEN 'refund'
    WHEN l.kind='consume' AND l.delta<0 THEN 'consume'
    WHEN l.kind IN('grant','purchase','expire') THEN l.kind ELSE 'other' END AS event_kind
 FROM ledger_input l
 LEFT JOIN operation_keys o ON o.email=l.email AND o.ledger_id=l.id
 LEFT JOIN app_billing_api_cost_reviews r ON starts_with(l.id,'led-api-refund-') AND r.id=substring(l.id from 16)
 LEFT JOIN app_billing_operations ro ON ro.id=r.operation_id AND ro.email=l.email
), ledger AS (SELECT * FROM mapped WHERE $5::text='' OR purpose=$5)`;
const ledgerCTE=ledgerSourceCTE();
const sums=`COALESCE(sum(-delta) FILTER(WHERE event_kind='consume'),0)::float8 AS consumed,COALESCE(sum(delta) FILTER(WHERE event_kind='refund'),0)::float8 AS refunded,
 COALESCE(sum(CASE WHEN event_kind='consume' THEN -delta WHEN event_kind='refund' THEN -delta ELSE 0 END),0)::float8 AS net,count(*)::int AS events`;
const jobStatus=(expr:string)=>`CASE WHEN ${expr} IN('done','completed','succeeded','success') THEN 'succeeded' WHEN ${expr} IN('error','failed','cancelled','canceled') THEN 'failed' WHEN ${expr} IN('queued','running','pending','processing','reserved','prepared') THEN 'pending' ELSE 'unknown' END`;
const tasksCTE=`WITH raw_tasks AS (
 SELECT 'image:'||j.id AS key,j.id,j.email,j.created_at,j.updated_at,COALESCE(${featureCase('o.feature')},${categoryCase('j.kind')},'unknown') AS purpose,${jobStatus("j.snapshot->>'status'")} AS status FROM app_image_jobs j LEFT JOIN app_billing_operations o ON o.id=j.id AND o.email=j.email WHERE j.email=ANY($1::text[])
 UNION ALL SELECT 'canvas:'||c.id,c.id,c.email,c.created_at,c.updated_at,COALESCE(${featureCase('o.feature')},${categoryCase('c.kind')},'unknown'),${jobStatus('c.status')} FROM app_canvas_image_tasks c LEFT JOIN app_billing_operations o ON o.id=c.id AND o.email=c.email WHERE c.email=ANY($1::text[])
 UNION ALL SELECT 'video:'||v.id,v.id,v.email,v.created_at,v.updated_at,'video.generate',${jobStatus('v.status')} FROM app_video_tasks v WHERE v.email=ANY($1::text[])
 UNION ALL SELECT 'operation:'||o.id,o.id,o.email,o.created_at,o.updated_at,COALESCE(${featureCase('o.feature')},'unknown'),
 CASE WHEN o.state IN('hold','manual') THEN 'unknown' WHEN o.state IN('reserved','prepared') THEN 'pending' ELSE ${jobStatus("o.settlement_result->>'state'")} END
 FROM app_billing_operations o WHERE o.email=ANY($1::text[]) AND o.feature NOT LIKE 'credits.%'
 AND NOT EXISTS(SELECT 1 FROM app_image_jobs j WHERE j.id=o.id AND j.email=o.email)
 AND NOT EXISTS(SELECT 1 FROM app_canvas_image_tasks c WHERE c.id=o.id AND c.email=o.email)
 AND NOT EXISTS(SELECT 1 FROM app_video_tasks v WHERE v.id=o.id AND v.email=o.email)
), tasks AS (SELECT * FROM raw_tasks WHERE created_at >= $2::timestamptz AND created_at < $3::timestamptz AND ($4::text='' OR email=$4) AND ($5::text='' OR purpose=$5))`;
const taskSums=`count(*)::int AS tasks,count(*) FILTER(WHERE status='succeeded')::int AS succeeded,count(*) FILTER(WHERE status='failed')::int AS failed,count(*) FILTER(WHERE status='pending')::int AS pending,count(*) FILTER(WHERE status='unknown')::int AS unknown`;
function range(q:AnalyticsFilter,emails:string[]){return [emails,q.from+'T00:00:00+08:00',shiftDate(q.to,1)+'T00:00:00+08:00',q.email,q.purpose]}
function scopedEmails(s:Parameters<Parameters<typeof enterpriseRead>[2]>[1],q:AnalyticsFilter){
 let emails=[...s.visible,...(s.owner?[s.team.owner_email]:[])];
 if(q.team){
  if(!emails.includes(q.team))throw new TeamError('没有该团队经营数据的查看权限');
  const selected=new Set([q.team]);let changed=true;
  while(changed){changed=false;for(const n of s.nodes)if(selected.has(n.supervisor_email)&&!selected.has(n.email)){selected.add(n.email);changed=true}}
  emails=emails.filter(e=>selected.has(e));
 }
 if(q.email&&!emails.includes(q.email))throw new TeamError('没有该成员经营数据的查看权限');
 return emails;
}
const detailSQL=`SELECT l.id,l.email,u.name,l.created_at AS "createdAt",l.event_kind AS kind,l.purpose,l.delta,l.operation_id AS "operationId",l.source FROM ledger l JOIN app_users u ON u.email=l.email WHERE ($6::text='' OR event_kind=$6) ORDER BY l.created_at DESC,l.id DESC`;
export async function enterpriseAnalytics(actor:TeamActor,q:AnalyticsFilter):Promise<EnterpriseAnalytics>{
 return enterpriseRead(actor,q.enterpriseId,async(tx,s)=>{
  const emails=scopedEmails(s,q),p=range(q,emails);
  const choices=(await tx.query(`SELECT u.email,u.name,COALESCE(m.supervisor_email,'') AS supervisor FROM app_users u LEFT JOIN app_enterprise_members m ON m.email=u.email AND m.enterprise_id=$2 WHERE u.email=ANY($1::text[]) ORDER BY u.name,u.email`,[emails,q.enterpriseId])).rows;
  // Materialize the filtered ledger once for the six views of the current range.
  const bucket=(v:string)=>`date_trunc('${q.group}',${v} AT TIME ZONE 'Asia/Shanghai')::date`;
  const {summary,purposes,usage,total,detailRows,trend}=(await tx.query(`${ledgerCTE},
   summary AS (
    SELECT ${sums},count(DISTINCT email) FILTER(WHERE event_kind='consume')::int AS "activeMembers",
     COALESCE(sum(delta) FILTER(WHERE event_kind IN('grant','purchase')),0)::float8 AS issued,
     COALESCE(sum(delta) FILTER(WHERE event_kind='adjust'),0)::float8 AS adjustment,
     COALESCE(sum(-delta) FILTER(WHERE event_kind='expire'),0)::float8 AS expired,
     count(*) FILTER(WHERE event_kind IN('consume','refund') AND purpose='unknown')::int AS unclassified FROM ledger
   ), purposes AS (
    SELECT purpose,${sums} FROM ledger WHERE event_kind IN('consume','refund') GROUP BY purpose
   ), usage AS (SELECT email,${sums} FROM ledger GROUP BY email),
   detail_rows AS (${detailSQL} LIMIT 25 OFFSET $7),
   days AS (SELECT DISTINCT ${bucket('d')} AS date FROM generate_series($2::timestamptz,$3::timestamptz-interval '1 day',interval '1 day')d),
   spending AS (SELECT ${bucket('created_at')} AS date,${sums} FROM ledger GROUP BY 1),
   output AS (
    SELECT ${bucket('created_at')} AS date,count(*)::int AS artworks FROM app_artworks WHERE email=ANY($1::text[])
     AND created_at >= $2 AND created_at < $3 AND deleted_at IS NULL AND ($4::text='' OR email=$4) AND $5::text='' GROUP BY 1
   ), trend AS (
    SELECT to_char(d.date,'YYYY-MM-DD') AS date,COALESCE(u.consumed,0)::float8 AS consumed,COALESCE(u.refunded,0)::float8 AS refunded,
     COALESCE(u.net,0)::float8 AS net,COALESCE(u.events,0)::int AS events,COALESCE(o.artworks,0)::int AS artworks
    FROM days d LEFT JOIN spending u USING(date) LEFT JOIN output o USING(date)
   )
   SELECT (SELECT row_to_json(s) FROM summary s) AS summary,
    COALESCE((SELECT json_agg(p ORDER BY net DESC,purpose) FROM purposes p),'[]') AS purposes,
    COALESCE((SELECT json_agg(u) FROM usage u),'[]') AS usage,
    (SELECT count(*)::int FROM ledger WHERE $6::text='' OR event_kind=$6) AS total,
    COALESCE((SELECT json_agg(d ORDER BY "createdAt" DESC,id DESC) FROM detail_rows d),'[]') AS "detailRows",
    COALESCE((SELECT json_agg(t ORDER BY date) FROM trend t),'[]') AS trend`,[...p,q.kind,(q.page-1)*25])).rows[0] as {
      summary: Pick<EnterpriseAnalytics['summary'],'consumed'|'refunded'|'net'|'events'|'activeMembers'|'issued'|'adjustment'|'expired'|'unclassified'>;
      purposes: EnterpriseAnalytics['purposes']; usage: { email: string; consumed: number; refunded: number; net: number; events: number }[];
      total: number; detailRows: LedgerEntry[]; trend: EnterpriseAnalytics['trend'];
    };
  const details=detailRows.map(row=>({...row,createdAt:new Date(row.createdAt).toISOString()}));
  const days=(Date.parse(q.to)-Date.parse(q.from))/86400000+1;
  const previous=(await tx.query(`${ledgerCTE} SELECT ${sums} FROM ledger`,[emails,shiftDate(q.from,-days)+'T00:00:00+08:00',q.from+'T00:00:00+08:00',q.email,q.purpose])).rows[0];
  const tasks=(await tx.query(`${tasksCTE} SELECT email,${taskSums} FROM tasks GROUP BY email`,p)).rows;
  // Artworks have no immutable business-purpose association. Never guess it;
  // in a purpose-filtered report output metrics are deliberately unavailable.
  const artworks=q.purpose?[]:(await tx.query(`SELECT email,count(*)::int AS n FROM app_artworks WHERE email=ANY($1::text[]) AND created_at >= $2 AND created_at < $3 AND deleted_at IS NULL AND ($4::text='' OR email=$4) GROUP BY email`,p.slice(0,4))).rows;
  const wallets=(await tx.query(`SELECT u.email,u.name,COALESCE(r.name,CASE WHEN m.email IS NULL THEN '企业老板' ELSE '员工' END) AS role,COALESCE(m.employment,'owner') AS employment,COALESCE(m.supervisor_email,'') AS supervisor,
    u.banned,u.account_expires_at AS "expiresAt",u.credits_used::float8 AS reserved,GREATEST(0,COALESCE(b.principal,0)-u.credits_used)::float8 AS available,COALESCE(b.expiring,0)::float8 AS expiring
    FROM app_users u LEFT JOIN app_enterprise_members m ON m.email=u.email AND m.enterprise_id=$2 LEFT JOIN app_enterprise_roles r ON r.enterprise_id=m.enterprise_id AND r.id=m.role_id
    LEFT JOIN LATERAL(SELECT sum(remaining) AS principal,sum(remaining) FILTER(WHERE expires_at <= now()+interval '30 days') AS expiring FROM app_credit_batches WHERE email=u.email AND remaining>0 AND expires_at>now())b ON true
    WHERE u.email=ANY($1::text[]) AND ($3::text='' OR u.email=$3) ORDER BY u.name,u.email`,[emails,q.enterpriseId,q.email])).rows;
  const members=wallets.map(w=>({...w,...(usage.find(u=>u.email===w.email)||{consumed:0,refunded:0,net:0,events:0}),...(tasks.find(t=>t.email===w.email)||{tasks:0,succeeded:0,failed:0,pending:0,unknown:0}),artworks:artworks.find(a=>a.email===w.email)?.n||0})).sort((a,b)=>b.net-a.net||a.email.localeCompare(b.email));
  const risk=(code:string,rows:typeof wallets,amount=0)=>({code,count:rows.length,amount,members:rows.map(w=>({email:w.email,name:w.name}))});
  const riskRows=(await tx.query(`SELECT DISTINCT o.email FROM app_billing_operations o WHERE o.email=ANY($1::text[]) AND ($2::text='' OR o.email=$2) AND o.feature NOT LIKE 'credits.%' AND (o.state IN('manual','hold') OR o.state IN('prepared','reserved') AND o.created_at < now()-interval '24 hours') ${excludeImportedHistory('app_billing_operations','o')}`,[emails,q.email])).rows;
  const sumsMember=(key:string)=>members.reduce((n,m)=>n+Number(m[key as keyof typeof m]||0),0);
  const completed=sumsMember('succeeded')+sumsMember('failed');
  return {filter:q,timezone:'Asia/Shanghai',generatedAt:new Date().toISOString(),choices,summary:{...summary,scopeMembers:wallets.length,artworks:sumsMember('artworks'),tasks:sumsMember('tasks'),succeeded:sumsMember('succeeded'),failed:sumsMember('failed'),pending:sumsMember('pending'),unknown:sumsMember('unknown'),successRate:completed?sumsMember('succeeded')/completed*100:null,creditsPerArtwork:!q.purpose&&sumsMember('artworks')?summary.net/sumsMember('artworks'):null,previousNet:previous.net,changePercent:previous.net>0?(summary.net-previous.net)/previous.net*100:null,available:sumsMember('available'),reserved:sumsMember('reserved'),expiring:sumsMember('expiring')},trend,purposes,members,details:{rows:details,total,page:q.page,size:25},risks:[
    risk('low-balance',wallets.filter(w=>w.available<100)),risk('expiring-credits',wallets.filter(w=>w.expiring>0),sumsMember('expiring')),
    risk('intern-expiry',wallets.filter(w=>w.employment==='intern'&&w.expiresAt&&Date.parse(w.expiresAt)<=Date.now()+7*86400000)),risk('disabled',wallets.filter(w=>w.banned)),
    risk('settlement-review',wallets.filter(w=>riskRows.some(r=>r.email===w.email)))
  ]};
 });
}

export function csvCell(value:unknown){let text=String(value??'');if(typeof value==='string'&&/^[\s\u0000-\u001f]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
export async function enterpriseLedgerCsv(actor:TeamActor,q:AnalyticsFilter){
 return enterpriseRead(actor,q.enterpriseId,async(tx,s)=>{
  const p=range(q,scopedEmails(s,q));
  const total=Number((await tx.query(`${ledgerCTE} SELECT count(*)::int AS n FROM ledger WHERE $6::text='' OR event_kind=$6`,[...p,q.kind])).rows[0].n);
  if(total>50000)throw new TeamError('超过50000条，请缩小日期范围或选择成员后导出',400);
  const rows=(await tx.query(`${ledgerCTE} ${detailSQL}`,[...p,q.kind])).rows as LedgerEntry[];
  const { EVENT_LABELS }=await import('./analytics-contracts');
  return '\uFEFF'+[['时间（北京时间）','姓名','账号','变动类型','用途','积分变动','流水编号','操作编号','用途来源'],...rows.map(r=>[new Date(r.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}),r.name,r.email,EVENT_LABELS[r.kind],r.kind==='consume'||r.kind==='refund'?PURPOSES[r.purpose]:'—',r.delta,r.id,r.operationId,r.source])].map(r=>r.map(csvCell).join(',')).join('\r\n');
 });
}

/** Narrow read-only ledger list for an already authorized creation scope. Reuses authoritative classification. */
export async function creationLedger(tx:import('pg').PoolClient,emails:string[],q:{start:string;end:string;email:string;page:number;size:number;recordId?:string}){
 const cte=ledgerSourceCTE("(($6::text<>'' AND l.id=$6) OR ($6='' AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz))"),p=[emails,q.start,q.end,q.email,'',q.recordId??''];
 const total=Number((await tx.query(`${cte} SELECT count(*) AS n FROM ledger`,p)).rows[0].n);
 const rows=(await tx.query(`${cte} SELECT l.id,l.email,u.name,l.created_at AS "createdAt",l.event_kind AS kind,l.purpose,l.delta,l.operation_id AS "operationId",l.source FROM ledger l JOIN app_users u ON u.email=l.email ORDER BY l.created_at DESC,l.id DESC LIMIT $7 OFFSET $8`,[...p,q.size,(q.page-1)*q.size])).rows;
 return {rows:rows.map(r=>({...r,createdAt:r.createdAt instanceof Date?r.createdAt.toISOString():r.createdAt})),total,page:q.page,size:q.size};
}
