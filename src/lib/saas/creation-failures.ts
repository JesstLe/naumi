import 'server-only';
import type {Pool,PoolClient} from 'pg';
import {creationStatus,type CreationFailure} from './creation-contracts';

type Reader=Pick<Pool|PoolClient,'query'>;
type Ref={root:string;table_name:string;id:string;email:string};
const tables=['app_image_jobs','app_canvas_image_tasks','app_video_tasks'];
const sourceTable=(type:string)=>type.startsWith('image:')?'app_image_jobs':type==='canvas-image'?'app_canvas_image_tasks':type==='video'?'app_video_tasks':null;
export const hasCreationFailure=(status:unknown)=>['failed','partial','needs_review'].includes(creationStatus(status));
const transportLabels:Record<string,string>={ECONNRESET:'供应调用连接被重置',ETIMEDOUT:'供应调用超时',UND_ERR_CONNECT_TIMEOUT:'供应连接超时',ECONNREFUSED:'供应连接被拒绝',ENOTFOUND:'供应地址解析失败',EAI_AGAIN:'供应地址解析暂时失败',ENETUNREACH:'供应网络不可达',EHOSTUNREACH:'供应主机不可达',CERT_HAS_EXPIRED:'供应连接证书已过期',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'供应连接证书校验失败'};
const categoryLabels:Record<string,string>={quota:'供应接口报告余额或额度不足',credential:'供应接口鉴权失败','model-permission':'供应接口模型权限不足','content-policy':'供应接口内容审核拒绝','rate-limit':'供应接口限流','authorization-or-edge':'供应接口访问被拒绝','upstream-unavailable':'供应接口服务异常','upstream-rejected':'供应接口拒绝请求'};
const knownState=(value:unknown,allowed:string[])=>typeof value==='string'&&allowed.includes(value)?value:'unknown';
const credits=(value:unknown)=>value!==null&&value!==undefined&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const label=(value:unknown)=>typeof value==='string'&&value.length<=100&&/^[\p{L}\p{N}_.:+ -]+$/u.test(value)?value:null;
const when=(value:unknown)=>value&&Number.isFinite(Date.parse(String(value)))?new Date(String(value)).toISOString():null;
export function missingCreationFailure(incomplete=false):CreationFailure{return {
 title:incomplete?'失败原因证据不完整':'失败原因未记录',description:incomplete?'关联记录达到读取上限，保留未确认状态。':'现有记录没有明确的底层错误，尚未确认失败环节。',
 stage:'未确认',code:null,evidence:'not_recorded',observedAt:null,incomplete,supplier:null,customerBilling:null,
};}

/** No free-form upstream message, URL, credential, request body or inferred charge. */
export function creationFailureFromRow(row:Record<string,any>):CreationFailure{
 const http=Number(row.http_status),httpStatus=Number.isInteger(http)&&http>=100&&http<=599?http:null;
 const transport=typeof row.transport_code==='string'&&Object.hasOwn(transportLabels,row.transport_code)?row.transport_code:null;
 const category=typeof row.failure_category==='string'&&Object.hasOwn(categoryLabels,row.failure_category)?row.failure_category:null;
 const hasCall=!!row.call_id;
 const postStages:Record<string,string>={'download-image':'原结果图片下载失败','decode-pixels':'原结果图片解码失败','parse-response':'供应响应解析失败','validate-envelope':'供应响应缺少有效图片','read-response':'供应响应读取失败','decode-base64':'原结果图片编码异常','validate-size':'原结果图片大小异常','serialize-response':'原结果转换失败','parse-image-url':'原结果图片地址异常'};
 const postStage=typeof row.post_stage==='string'&&Object.hasOwn(postStages,row.post_stage)?row.post_stage:null;
 const postCode=Array.isArray(row.post_causes)?row.post_causes.map((c:any)=>c?.code).find((c:unknown)=>typeof c==='string'&&Object.hasOwn(transportLabels,c)):null;
 const responseSucceeded=httpStatus!==null&&httpStatus<400&&['response-received','stream-completed','completed'].includes(row.call_state);
 const failure:CreationFailure={...missingCreationFailure(),evidence:'task_state',observedAt:when(row.call_updated_at||row.updated_at),
  supplier:hasCall?{provider:label(row.provider_id),model:label(row.actual_model||row.model),state:knownState(row.call_state,['started','unknown','rejected','submitted','accepted','response-received','stream-completed','completed','failed','cancelled']),costStatus:knownState(row.cost_status,['pending','estimated','reported','reconciled','not_charged']),httpStatus}:null,
  customerBilling:row.billing_state?{state:knownState(row.billing_state,['reserved','settled','released','hold','manual']),charged:credits(row.charged_credits),reserved:credits(row.reserved_credits)}:null};
 if(hasCall&&postStage)return {...failure,title:postStage==='download-image'&&postCode==='ECONNRESET'?'原结果图片下载连接被重置':postStages[postStage],description:'供应响应已经返回；这是读取或处理原结果时的错误，不等于生成请求未被受理。',stage:postStage==='download-image'?'下载原结果图片':'结果处理 / 交付',code:postCode||null,evidence:'supplier_receipt'};
 if(hasCall&&(transport||row.failure_category==='transport')&&!responseSucceeded)return {...failure,title:transport?transportLabels[transport]:'供应调用通信异常',description:'调用链路发生通信异常；具体断点及供应商是否受理，以原回执为准。',stage:'供应调用',code:transport,evidence:'supplier_receipt'};
 if(hasCall&&(category||httpStatus!==null&&httpStatus>=400)&&!responseSucceeded)return {...failure,title:category?categoryLabels[category]:`供应接口返回 HTTP ${httpStatus}`,description:'原因来自该任务最近一次供应回执；未记录的信息不推断为额度、权限或扣费结论。',stage:'供应调用',code:httpStatus?`HTTP ${httpStatus}`:null,evidence:'supplier_receipt'};
 if(hasCall&&Number(row.delivered)>0)return {...failure,title:'供应响应已有输出，任务交付仍异常',description:'供应记录中的输出数量不等于本地图片已保存或交付，需核对结果处理与交付记录。',stage:'结果处理 / 交付',code:null,evidence:'supplier_receipt'};
 if(hasCall&&['unknown','started','submitted','accepted'].includes(row.call_state))return {...failure,title:'供应调用结果待确认',description:'原调用尚无明确最终回执，不能据此认定未受理或未扣费。',stage:'供应调用',code:null,evidence:'supplier_receipt'};
 const code=knownState(row.failure_code,['image-result-unavailable','image-worker-failed','legacy-unknown-submission','EXECUTION_FAILED']);
 return {...failure,title:code==='image-result-unavailable'?'未取得可交付图片，底层原因未记录':'任务失败，底层原因未记录',code:code==='unknown'?null:code,stage:'任务执行',description:'当前只有任务失败记录，未找到可确认的供应或本地错误证据。'};
}

async function readFailures(tx:Reader,refs:Ref[],roots:string[],incomplete=false):Promise<Map<string,CreationFailure>>{
 const result=new Map(roots.map(id=>[id,missingCreationFailure(incomplete)]));
 if(incomplete||!refs.length)return result;
 const supplierPresent=!!(await tx.query("SELECT to_regclass('app_supplier_calls') AS name")).rows[0]?.name;
 // Only the requested page's exact IDs and owners. Parent-child expansion never
 // follows a child of another owner. Do not load payloads or paid result bytes.
 const sql=`WITH RECURSIVE refs AS (SELECT DISTINCT * FROM jsonb_to_recordset($1::jsonb) AS r(root text,table_name text,id text,email text)),
 images AS (
  SELECT r.root,j.id,j.email,j.snapshot->'children' AS children,COALESCE(j.snapshot#>>'{result,status}',j.snapshot->>'status') AS status,
  COALESCE(j.snapshot->>'failureCode',j.snapshot#>>'{result,error,code}') AS failure_code,j.updated_at,0 AS depth,ARRAY[j.id] AS path FROM refs r
  JOIN app_image_jobs j ON r.table_name='app_image_jobs' AND j.id=r.id AND j.email=r.email
  UNION ALL SELECT p.root,j.id,j.email,j.snapshot->'children',COALESCE(j.snapshot#>>'{result,status}',j.snapshot->>'status'),
  COALESCE(j.snapshot->>'failureCode',j.snapshot#>>'{result,error,code}'),j.updated_at,p.depth+1,p.path||j.id FROM images p
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.children)='object' THEN p.children ELSE '{}'::jsonb END) child
  JOIN app_image_jobs j ON j.id=child.value->>'jobId' AND j.email=p.email WHERE p.depth<8 AND NOT j.id=ANY(p.path)),
 task_rows AS (
  SELECT root,id,email,status,failure_code,updated_at,depth=8 AS clipped FROM images
  UNION ALL SELECT r.root,v.id,v.email,v.status,NULL,v.updated_at,false FROM refs r JOIN app_video_tasks v ON r.table_name='app_video_tasks' AND v.id=r.id AND v.email=r.email
  UNION ALL SELECT r.root,c.id,c.email,c.status,NULL,c.updated_at,false FROM refs r JOIN app_canvas_image_tasks c ON r.table_name='app_canvas_image_tasks' AND c.id=r.id AND c.email=r.email),
 selected AS MATERIALIZED (SELECT DISTINCT * FROM task_rows ORDER BY root,updated_at DESC,id LIMIT 1001)
 SELECT t.*,b.state AS billing_state,b.charged_credits,b.reserved_credits${supplierPresent?',s.*':''} FROM selected t
 LEFT JOIN app_billing_operations b ON b.id=t.id AND b.email=t.email
 ${supplierPresent?`LEFT JOIN LATERAL (
  SELECT s.id AS call_id,s.provider_id,s.model,s.actual_model,s.state AS call_state,s.cost_status,s.delivered,s.updated_at AS call_updated_at,
  s.evidence->>'transportCode' AS transport_code,s.evidence->>'failureCategory' AS failure_category,s.evidence->>'httpStatus' AS http_status,
  s.evidence#>>'{postAcceptanceFailure,stage}' AS post_stage,s.evidence#>'{postAcceptanceFailure,causes}' AS post_causes
  FROM app_supplier_calls s WHERE s.operation_id=t.id AND s.user_email=t.email ORDER BY s.started_at DESC,s.id DESC LIMIT 1)s ON true`:''}
 ORDER BY t.root,t.updated_at DESC,t.id`;
 const rows=(await tx.query(sql,[JSON.stringify(refs)])).rows;
 if(rows.length>1000||rows.some(r=>r.clipped))return new Map(roots.map(id=>[id,missingCreationFailure(true)]));
 for(const root of roots){
  const candidates=rows.filter(r=>r.root===root&&hasCreationFailure(r.status)).map(creationFailureFromRow);
  result.set(root,candidates.find(f=>f.evidence==='supplier_receipt')||candidates[0]||missingCreationFailure());
 }
 return result;
}

export async function legacyCreationFailures(pool:Pool,refs:Ref[]){
 if(refs.length>100)throw new Error('FAILURE_PAGE_LIMIT');
 if(!refs.length)return new Map<string,CreationFailure>();
 const tx=await pool.connect();
 try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await tx.query("SET LOCAL statement_timeout='15s'");
  const result=await readFailures(tx,refs.filter(r=>tables.includes(r.table_name)),refs.map(r=>r.root));await tx.query('COMMIT');return result;
 }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}

export async function creationFailures(tx:Reader,roots:{id:string;email:string}[]){
 if(roots.length>100)throw new Error('FAILURE_PAGE_LIMIT');
 if(!roots.length)return new Map<string,CreationFailure>();
 const rows=(await tx.query(`WITH RECURSIVE family AS (
  SELECT c.id AS root,c.id,c.actor_email,c.tenant_id,c.source_kind,c.source_id,0 AS depth,ARRAY[c.id] AS path
  FROM jsonb_to_recordset($1::jsonb) AS r(id text,email text) JOIN app_creation_records c ON c.id=r.id AND c.actor_email=r.email
  UNION ALL SELECT f.root,c.id,c.actor_email,c.tenant_id,c.source_kind,c.source_id,f.depth+1,f.path||c.id
  FROM family f JOIN app_creation_records c ON c.parent_id=f.id AND c.actor_email=f.actor_email AND c.tenant_id IS NOT DISTINCT FROM f.tenant_id
  WHERE f.depth<16 AND NOT c.id=ANY(f.path)),
 refs AS (SELECT f.root,f.actor_email AS email,l.target_type AS type,l.target_id AS id,f.depth FROM family f JOIN app_creation_links l ON l.creation_id=f.id AND l.actor_email=f.actor_email
  UNION SELECT root,actor_email,source_kind,source_id,depth FROM family)
 SELECT DISTINCT * FROM refs ORDER BY root,id,type LIMIT 1001`,[JSON.stringify(roots)])).rows;
 const refs:Ref[]=rows.flatMap(r=>{const table=sourceTable(r.type);return table?[{root:r.root,table_name:table,id:r.id,email:r.email}]:[];});
 return readFailures(tx,refs,roots.map(r=>r.id),rows.length>1000||rows.some(r=>r.depth===16));
}
