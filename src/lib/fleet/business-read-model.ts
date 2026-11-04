import 'server-only';
import type {Pool,PoolClient} from 'pg';
import {ADMIN_CREDIT_ADJUSTMENT_FEATURE,administrativeDebitPredicate} from '@/lib/billing/consumption-read';
import {fleetBusinessQuerySchema,parseFleetBusinessSnapshot,type FleetBusinessQuery,type FleetBusinessSnapshot} from './business-contracts';

const PAGE_SIZE=30;
/** Convert a database numeric value only when finite and within the safe magnitude bound; reject non-finite or out-of-range observations. */
function number(value:unknown):number {
  const result=Number(value);if(!Number.isFinite(result)||Math.abs(result)>Number.MAX_SAFE_INTEGER)throw new Error('FLEET_BUSINESS_NUMBER_UNAVAILABLE');return result;
}
/** Normalize a database date or timestamp-like value to ISO text; invalid timestamps propagate as read failures. */
const iso=(value:unknown)=>(value instanceof Date?value:new Date(String(value))).toISOString();
/** Preserve null or absent database timestamps while normalizing present values to ISO text. */
const nullableIso=(value:unknown)=>value===null||value===undefined?null:iso(value);
/** Account filters are parameterized and shared across all facts, including deleted-account ledger history. */
const filter=(alias:string)=>`($3::text='' OR position(lower($3) in lower(${alias}.email||' '||COALESCE((SELECT fu.name FROM app_users fu WHERE fu.email=${alias}.email),'')))>0) AND ($4::text IS NULL OR ${alias}.email=$4)`;
/** Build the shared half-open timestamp predicate for a trusted table alias using the query's bound start and end parameters. */
const range=(alias:string)=>`${alias}.created_at >= $1::timestamptz AND ${alias}.created_at < $2::timestamptz`;
/** Compose the read-side wallet and ledger CTEs, separating provenance-backed administrative debits from actual customer consumption. */
function ledgerCtes(){
  const adjustmentKeys=`SELECT DISTINCT o.email,o.ledger_id FROM app_billing_operations o JOIN candidate_ledger l ON l.email=o.email AND l.id=o.ledger_id WHERE o.feature='${ADMIN_CREDIT_ADJUSTMENT_FEATURE}'`;
  return `wallets AS MATERIALIZED (SELECT email,sum(remaining::bigint) principal FROM app_credit_batches WHERE expires_at>CURRENT_TIMESTAMP AND remaining>0 GROUP BY email),
    candidate_ledger AS MATERIALIZED (SELECT l.id,l.email,l.delta,l.kind,l.reason,l.created_at FROM app_ledger l WHERE ${range('l')} AND ${filter('l')}),
    admin_adjustment_keys AS MATERIALIZED (${adjustmentKeys}),
    classified_ledger AS MATERIALIZED (SELECT l.*,${administrativeDebitPredicate('l.reason','a.ledger_id IS NOT NULL')} AS admin_debit FROM candidate_ledger l LEFT JOIN admin_adjustment_keys a ON a.email=l.email AND a.ledger_id=l.id),
    consumption AS MATERIALIZED (SELECT * FROM classified_ledger WHERE kind='consume' AND delta<0 AND NOT admin_debit)`;
}
type ReadClient=Pick<PoolClient,'query'>;
/** Existing business tables only; no schema initialization, provider requests, ledger mutation, or data import. */
export async function readFleetBusinessQueryInTransaction(tx:ReadClient,input:FleetBusinessQuery):Promise<FleetBusinessSnapshot> {
  const query=fleetBusinessQuerySchema.parse(input),from=new Date(Date.parse(query.asOf)-query.days*86400000).toISOString();
  const values=[from,query.asOf,query.search,query.email??null,PAGE_SIZE,(query.page-1)*PAGE_SIZE];
  const catalog=(await tx.query("SELECT current_timestamp AS observed_at,to_regclass('app_billing_operations') IS NOT NULL AS has_operations")).rows[0];
  if(catalog.has_operations!==true)throw new Error('FLEET_BILLING_PROVENANCE_UNAVAILABLE');
  const ctes=ledgerCtes();
  const totals=(await tx.query(`WITH ${ctes} SELECT
    (SELECT COALESCE(sum(-delta::bigint),0) FROM consumption) credits,
    (SELECT count(*) FROM consumption) operations,(SELECT count(DISTINCT email) FROM consumption) active_users,
    (SELECT COALESCE(sum(COALESCE(w.principal,0)-u.credits_used::bigint),0) FROM app_users u LEFT JOIN wallets w ON w.email=u.email WHERE ${filter('u')}) balance,
    (SELECT count(*) FROM app_users u WHERE ${filter('u')}) users,
    (SELECT count(*) FROM app_artworks a WHERE a.deleted_at IS NULL AND ${filter('a')}) artworks,
    (SELECT count(*) FROM app_orders o WHERE o.status='paid' AND o.paid_at >= $1::timestamptz AND o.paid_at < $2::timestamptz AND ${filter('o')}) paid_orders,
    (SELECT COALESCE(sum(amount::bigint),0) FROM app_orders o WHERE o.status='paid' AND o.paid_at >= $1::timestamptz AND o.paid_at < $2::timestamptz AND ${filter('o')}) paid_amount,
    (SELECT COALESCE(sum(delta::bigint),0) FROM classified_ledger WHERE kind='refund' AND delta>0) refund_credits,
    (SELECT COALESCE(sum(-delta::bigint),0) FROM classified_ledger WHERE kind='consume' AND delta<0 AND admin_debit) administrative_debits`,values.slice(0,4))).rows[0];
  const snapshot:FleetBusinessSnapshot={schemaVersion:1,view:query.view,asOf:query.asOf,from,observedAt:iso(catalog.observed_at),timeZone:'Asia/Shanghai',scope:'site',page:query.page,pageSize:PAGE_SIZE,total:0,
    totals:{credits:number(totals.credits),operations:number(totals.operations),activeUsers:number(totals.active_users),balance:number(totals.users)===0&&(query.email||number(totals.active_users)>0)?null:number(totals.balance),users:number(totals.users),artworks:number(totals.artworks),paidOrders:number(totals.paid_orders),paidAmount:number(totals.paid_amount),refundCredits:number(totals.refund_credits),administrativeDebits:number(totals.administrative_debits)},
    users:[],daily:[],orders:[],ledger:[],creations:[]};
  if(query.view==='usage'||query.view==='overview'||query.view==='users'){
    const people=`WITH ${ctes},usage AS(SELECT email,sum(-delta::bigint) credits,count(*) operations,max(created_at) last_used_at FROM consumption GROUP BY email),
      people AS(SELECT COALESCE(u.email,l.email) email,left(COALESCE(u.name,''),80) name,left(COALESCE(u.role,'unknown'),24) role,left(COALESCE(u.plan,''),32) plan,COALESCE(u.banned,true) banned,
        CASE WHEN u.email IS NULL THEN NULL ELSE COALESCE(w.principal,0) END credits_total,u.credits_used,
        CASE WHEN u.email IS NULL THEN NULL ELSE COALESCE(w.principal,0)-u.credits_used::bigint END balance,
        COALESCE(l.credits,0) credits,COALESCE(l.operations,0) operations,l.last_used_at
        FROM app_users u ${query.view==='users'?'LEFT':'FULL OUTER'} JOIN usage l ON l.email=u.email
        LEFT JOIN wallets w ON w.email=u.email
        WHERE ${filter('{person}').replaceAll('{person}.email','COALESCE(u.email,l.email)')})`;
    const data=(await tx.query(`${people} SELECT (SELECT count(*) FROM people) total,
      COALESCE((SELECT jsonb_agg(p) FROM(SELECT * FROM people ORDER BY credits DESC,last_used_at DESC NULLS LAST,email LIMIT $5 OFFSET $6)p),'[]'::jsonb) people`,values)).rows[0];
    snapshot.total=number(data.total);snapshot.users=data.people.map((p:Record<string,unknown>)=>({email:String(p.email),name:String(p.name),role:String(p.role),plan:String(p.plan),banned:p.banned===true,
      creditsTotal:p.credits_total===null?null:number(p.credits_total),creditsUsed:p.credits_used===null?null:number(p.credits_used),balance:p.balance===null?null:number(p.balance),credits:number(p.credits),operations:number(p.operations),lastUsedAt:nullableIso(p.last_used_at)}));
    if(query.view!=='users')snapshot.daily=(await tx.query(`WITH ${ctes} SELECT (created_at AT TIME ZONE 'Asia/Shanghai')::date::text AS date,sum(-delta::bigint) credits,count(*) operations FROM consumption GROUP BY 1 ORDER BY 1`,values.slice(0,4))).rows.map(p=>({date:String(p.date),credits:number(p.credits),operations:number(p.operations)}));
  }else if(query.view==='orders'){
    const where=`${range('o')} AND ${filter('o')}`;
    const count=(await tx.query(`SELECT count(*) total FROM app_orders o WHERE ${where}`,values.slice(0,4))).rows[0];snapshot.total=number(count.total);
    snapshot.orders=(await tx.query(`SELECT o.id,o.email,left(o.title,100) title,left(o.kind,40) kind,o.credits,o.amount,left(o.status,40) status,o.created_at,o.paid_at FROM app_orders o WHERE ${where} ORDER BY o.created_at DESC,o.id DESC LIMIT $5 OFFSET $6`,values)).rows.map(p=>({id:String(p.id),email:String(p.email),title:String(p.title),kind:String(p.kind),credits:number(p.credits),amount:number(p.amount),status:String(p.status),createdAt:iso(p.created_at),paidAt:nullableIso(p.paid_at)}));
  }else if(query.view==='ledger'){
    snapshot.total=number((await tx.query(`SELECT count(*) total FROM app_ledger l WHERE ${range('l')} AND ${filter('l')}`,values.slice(0,4))).rows[0].total);
    snapshot.ledger=(await tx.query(`SELECT l.id,l.email,left(l.kind,40) kind,l.delta,left(l.reason,160) reason,l.created_at FROM app_ledger l WHERE ${range('l')} AND ${filter('l')} ORDER BY l.created_at DESC,l.id DESC LIMIT $5 OFFSET $6`,values)).rows.map(p=>({id:String(p.id),email:String(p.email),kind:String(p.kind),delta:number(p.delta),reason:String(p.reason),createdAt:iso(p.created_at)}));
  }else{
    const where=`a.deleted_at IS NULL AND ${range('a')} AND ${filter('a')}`;
    snapshot.total=number((await tx.query(`SELECT count(*) total FROM app_artworks a WHERE ${where}`,values.slice(0,4))).rows[0].total);
    snapshot.creations=(await tx.query(`SELECT a.id,a.email,left(a.title,100) title,a.created_at,left(a.group_id,200) project_key,
      CASE WHEN COALESCE(a.video_url,'')<>'' THEN 'video' WHEN octet_length(a.image_url)>0 THEN 'image' ELSE 'unknown' END type,left(a.status,40) status FROM app_artworks a WHERE ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT $5 OFFSET $6`,values)).rows.map(p=>({id:String(p.id),email:String(p.email),title:String(p.title),createdAt:iso(p.created_at),projectKey:p.project_key===null?null:String(p.project_key),type:p.type as 'image'|'video'|'unknown',status:String(p.status)}));
  }
  return parseFleetBusinessSnapshot(snapshot);
}

/** Run the business snapshot in a bounded repeatable-read, read-only transaction; roll back on errors and always release the pooled client. */
export async function readFleetBusinessQuery(pool:Pool,input:FleetBusinessQuery):Promise<FleetBusinessSnapshot> {
  const tx=await pool.connect();
  try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await tx.query("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='1s'");
    const result=await readFleetBusinessQueryInTransaction(tx,input);await tx.query('COMMIT');return result;
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
