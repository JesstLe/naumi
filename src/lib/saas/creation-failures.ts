import 'server-only';
import type {Pool,PoolClient} from 'pg';
import {creationStatus,type CreationFailure} from './creation-contracts';
import {diagnosticStages,taskReasonLabels,readTaskDiagnostic,legacyTaskDiagnostic} from '../imagegen/task-diagnostics';

type Reader=Pick<Pool|PoolClient,'query'>;
type Ref={root:string;table_name:string;id:string;email:string};
const tables=['app_image_jobs','app_canvas_image_tasks','app_video_tasks','app_video_workflow_runs'];
const sourceTable=(type:string)=>type.startsWith('image:')?'app_image_jobs':type==='canvas-image'?'app_canvas_image_tasks':type==='video'?'app_video_tasks':type==='video-workflow'?'app_video_workflow_runs':null;
export const hasCreationFailure=(status:unknown)=>['failed','partial','needs_review'].includes(creationStatus(status));
const transportLabels:Record<string,string>={ECONNRESET:'供应调用连接被重置',ETIMEDOUT:'供应调用超时',UND_ERR_CONNECT_TIMEOUT:'供应连接超时',UND_ERR_SOCKET:'供应响应连接异常终止',ERR_STREAM_PREMATURE_CLOSE:'供应响应流提前关闭',UND_ERR_HEADERS_TIMEOUT:'等待供应响应头超时',UND_ERR_BODY_TIMEOUT:'读取供应响应内容超时',ABORT_ERR:'供应响应读取被中止',ECONNREFUSED:'供应连接被拒绝',ENOTFOUND:'供应地址解析失败',EAI_AGAIN:'供应地址解析暂时失败',ENETUNREACH:'供应网络不可达',EHOSTUNREACH:'供应主机不可达',CERT_HAS_EXPIRED:'供应连接证书已过期',UNABLE_TO_VERIFY_LEAF_SIGNATURE:'供应连接证书校验失败'};
const categoryLabels:Record<string,string>={quota:'供应接口报告余额或额度不足',credential:'供应接口鉴权失败','model-permission':'供应接口模型权限不足','content-policy':'供应接口内容审核拒绝','rate-limit':'供应接口限流','authorization-or-edge':'供应接口访问被拒绝','upstream-unavailable':'供应接口服务异常','upstream-rejected':'供应接口拒绝请求','invalid-parameters':'供应接口参数校验未通过'};
const knownState=(value:unknown,allowed:string[])=>typeof value==='string'&&allowed.includes(value)?value:'unknown';
const credits=(value:unknown)=>value!==null&&value!==undefined&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;
const label=(value:unknown)=>typeof value==='string'&&value.length<=100&&!/^(sk-|Bearer|eyJ)/i.test(value)&&/^[\p{L}\p{N}_.:+ -]+$/u.test(value)?value:null;
const when=(value:unknown)=>value&&Number.isFinite(Date.parse(String(value)))?new Date(String(value)).toISOString():null;
const reference=(value:unknown)=>typeof value==='string'&&value.length<=180&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(value)&&!/^sk-|^Bearer|^eyJ/i.test(value)?value:null;
const taskStateNames:Record<string,string>={error:'失败',failed:'失败',partial:'部分成功',needs_attention:'待核查',needs_confirmation:'待确认',needs_review:'待核查',blocked:'已阻断',pending:'等待中',running:'执行中',done:'已完成',completed:'已完成'};
export function missingCreationFailure(incomplete=false):CreationFailure{return {
 title:incomplete?'诊断证据超过读取范围':'失败环节待核查',description:incomplete?'本次关联记录达到读取上限，尚未完成全部证据核对。':'没有找到可确认原因的执行证据；需按原任务标识核对记录。',
 stage:'未确认',code:null,evidence:'not_recorded',observedAt:null,incomplete,supplier:null,customerBilling:null,
 diagnosis:{certainty:'evidence_missing',facts:[],missing:[incomplete?'关联链未完整读取':'缺少关联执行任务或结构化错误记录'],nextChecks:[incomplete?'缩小查询到具体子任务，继续只读核对':'按原创作关联查找执行任务、供应回执和检查点','未确认供应结果前，不重新提交生成'],taskId:null,callId:null,requestId:null,taskState:'unknown',source:'none'},
};}

/** No free-form upstream message, URL, credential, request body or inferred charge. */
export function creationFailureFromRow(row:Record<string,any>):CreationFailure{
 const http=Number(row.http_status),httpStatus=Number.isInteger(http)&&http>=100&&http<=599?http:null;
 const transport=typeof row.transport_code==='string'&&Object.hasOwn(transportLabels,row.transport_code)?row.transport_code:null;
 const category=typeof row.failure_category==='string'&&Object.hasOwn(categoryLabels,row.failure_category)?row.failure_category:null;
 const hasCall=!!row.call_id;
 const nativeCode=typeof row.upstream_failure_code==='string'&&['IMAGE_PARAMETER_REJECTED','IMAGE_INPUT_REJECTED','IMAGE_CONTENT_REJECTED','IMAGE_ACCESS_DENIED','IMAGE_RATE_LIMITED','IMAGE_UPSTREAM_UNAVAILABLE','IMAGE_REQUEST_REJECTED'].includes(row.upstream_failure_code)?row.upstream_failure_code as keyof typeof taskReasonLabels:null;
 const postStages:Record<string,string>={'download-image':'原结果图片下载失败','decode-pixels':'原结果图片解码失败','parse-response':'供应响应解析失败','validate-envelope':'供应响应缺少有效图片','read-response':'供应响应读取失败','decode-base64':'原结果图片编码异常','validate-size':'原结果图片大小异常','serialize-response':'原结果转换失败','parse-image-url':'原结果图片地址异常'};
 const postStage=typeof row.post_stage==='string'&&Object.hasOwn(postStages,row.post_stage)?row.post_stage:null;
 const postCode=Array.isArray(row.post_causes)?row.post_causes.map((c:any)=>c?.code).find((c:unknown)=>typeof c==='string'&&Object.hasOwn(transportLabels,c)):null;
 const responseSucceeded=httpStatus!==null&&httpStatus<400&&['response-received','stream-completed','completed'].includes(row.call_state);
 const failure:CreationFailure={...missingCreationFailure(),evidence:'task_state',observedAt:when(row.call_updated_at||row.updated_at),
  supplier:hasCall?{provider:label(row.provider_id),model:label(row.actual_model||row.model),state:knownState(row.call_state,['started','unknown','rejected','submitted','accepted','response-received','stream-completed','completed','failed','cancelled']),costStatus:knownState(row.cost_status,['pending','estimated','reported','reconciled','not_charged']),httpStatus}:null,
  customerBilling:row.billing_state?{state:knownState(row.billing_state,['reserved','settled','released','hold','manual']),charged:credits(row.charged_credits),reserved:credits(row.reserved_credits)}:null};
 const state=knownState(row.status,Object.keys(taskStateNames));
 const facts=[...(state!=='unknown'?['原任务状态：'+taskStateNames[state]]:[]),...(httpStatus?['供应 HTTP 状态：'+httpStatus]:[]),...(hasCall&&Number(row.delivered)>0?['供应回执已记录输出；本地交付另行核对']:[])];
 const finish=(patch:Partial<CreationFailure>,certainty:NonNullable<CreationFailure['diagnosis']>['certainty'],source:NonNullable<CreationFailure['diagnosis']>['source'],missing:string[]=[],nextChecks:string[]=[]):CreationFailure=>({...failure,...patch,diagnosis:{certainty,source,facts,missing,nextChecks,taskId:reference(row.id),callId:reference(row.call_id),requestId:reference(row.request_id||row.task_id),taskState:state}});
 const persisted=readTaskDiagnostic(row.task_diagnostic);
 const delivery=row.delivery_failure&&typeof row.delivery_failure==='object'&&typeof row.delivery_failure.stage==='string'?row.delivery_failure:null;
 const local=persisted||legacyTaskDiagnostic(row.failure_code||delivery?.code,row.task_error,delivery?.stage||row.task_stage||'execute');
 const localStage=diagnosticStages[local.stage];
 const localPostStage=['storage','image-checkpoint','artworks','settlement','final-receipt','output-processing','parent-finalize'].includes(local.stage);
 // A precise local delivery checkpoint is more informative than a generic success
 // receipt, but an older rejected/unknown call must not override a successful child.
 if((persisted||delivery)&&localPostStage)return finish({title:local.reason?taskReasonLabels[local.reason]:localStage+'未完成',description:'任务在已记录的本地步骤发生异常；保留原产物、供应和账务状态分别核对。',stage:localStage,code:local.reason,observedAt:persisted?when(persisted.observedAt)||when(row.updated_at):when(row.updated_at)},local.reason?'confirmed':'unconfirmed',persisted?'task_diagnostic':'delivery_checkpoint',local.reason?[]:['该检查点没有更细的异常分类'],['核对该步骤的原始任务记录和本地日志','优先使用已有产物收尾，不重新生成']);
 if(hasCall&&postStage)return finish({title:postStage==='download-image'&&postCode==='ECONNRESET'?'原结果图片下载连接被重置':postStages[postStage],description:'供应响应已经返回；这是读取或处理原结果时的错误，不等于生成请求未被受理。',stage:postStage==='download-image'?'下载原结果图片':'结果处理 / 交付',code:postCode||null,evidence:'supplier_receipt'},'confirmed','supplier_receipt',[],['核对原输出下载或处理记录','保留原调用标识，不重新提交生成']);
 if(hasCall&&(transport||row.failure_category==='transport')&&!responseSucceeded)return finish({title:transport?transportLabels[transport]:'供应调用通信异常',description:'调用链路发生通信异常；具体断点及供应商是否受理，以原回执为准。',stage:'供应调用',code:transport,evidence:'supplier_receipt'},'unconfirmed','supplier_receipt',['供应商最终受理和费用结果尚未确认'],['按原供应任务标识查询最终回执','不要将连接中断当作未受理后重新生成']);
 if(hasCall&&nativeCode&&!responseSucceeded&&(!category||['upstream-rejected','invalid-parameters'].includes(category)))return finish({title:taskReasonLabels[nativeCode],description:'原因来自原供应响应中的结构化拒绝类型；没有复制上游自由文本。',stage:'供应调用',code:nativeCode,evidence:'supplier_receipt'},'confirmed','supplier_receipt',[],['核对原参考图片、冻结参数及对应供应商能力','费用仍按原账务回执核对']);
 if(hasCall&&(category||httpStatus!==null&&httpStatus>=400)&&!responseSucceeded)return finish({title:category?categoryLabels[category]:`供应接口返回 HTTP ${httpStatus}`,description:'原因来自该任务最近一次供应回执；拒绝原因与费用状态分别记录。',stage:'供应调用',code:httpStatus?`HTTP ${httpStatus}`:null,evidence:'supplier_receipt'},'confirmed','supplier_receipt',[],['按已确认的错误分类核对供应商和冻结参数','以原账务记录确认实扣及预占']);
 if(local.reason)return finish({title:taskReasonLabels[local.reason],description:persisted?'原因来自任务保存的结构化异常记录。':'原因来自原任务已有的有限错误码或本地错误特征，未回显原始错误正文。',stage:localStage,code:local.reason,observedAt:persisted?when(persisted.observedAt)||failure.observedAt:failure.observedAt},['SUBMISSION_UNKNOWN','CHILD_PENDING','legacy-unknown-submission','creation_unknown','workflow-blocked'].includes(local.reason)?'unconfirmed':'confirmed',persisted?'task_diagnostic':'legacy_task',local.reason==='workflow-blocked'?['节点阻断的底层错误尚未分类']:[],['核对原任务的冻结配置及对应执行步骤','处理方式以原供应受理和账务状态为准']);
 if(hasCall&&Number(row.delivered)>0)return finish({title:'供应响应已有输出，任务交付仍异常',description:'供应记录中的输出数量不等于本地图片已保存或交付。',stage:'结果处理 / 交付',code:null,evidence:'supplier_receipt'},'unconfirmed','supplier_receipt',['本地保存、产物检查或最终回执的具体失败点未记录'],['按原输出核对下载、媒体保存、作品写入及父任务收尾']);
 if(hasCall&&['unknown','started','submitted','accepted'].includes(row.call_state))return finish({title:'供应调用结果待确认',description:'原调用尚无明确最终回执，不能据此认定未受理或未扣费。',stage:'供应调用',code:null,evidence:'supplier_receipt'},'unconfirmed','supplier_receipt',['缺少原调用最终回执'],['使用原供应任务标识查询，不创建新的付费请求']);
 const code=knownState(row.failure_code,['image-result-unavailable','image-worker-failed','EXECUTION_FAILED']);
 const gaps=[...(hasCall?[]:['未找到该执行任务的供应调用回执']),...(persisted?['异常发生已记录，但原因暂未归类']:row.task_error?['旧错误文本没有可确认的结构化分类']:['任务没有保存具体异常分类']),...(row.recorded_output?['本地已有输出，需核对后续收尾']:[])];
 return finish({title:code==='image-result-unavailable'?'图片未交付，具体原因待核查':state==='needs_attention'||state==='needs_review'?'执行结果待核查':'任务失败，具体环节待核查',code:code==='unknown'?null:code,stage:localStage,description:'保留已确认的最后状态，同时列出缺失证据；未把未知结果解释成供应失败或未扣费。'},'evidence_missing',persisted?'task_diagnostic':'legacy_task',gaps,['根据原任务 ID 和更新时间核对本地日志','补查已有供应回执与保存检查点，不重新生成']);
}

async function readFailures(tx:Reader,refs:Ref[],roots:string[],incomplete=false):Promise<Map<string,CreationFailure>>{
 const result=new Map(roots.map(id=>[id,missingCreationFailure(incomplete)]));
 if(incomplete||!refs.length)return result;
 const kinds=new Set(refs.map(ref=>ref.table_name));
 const workflowSchema=kinds.has('app_video_workflow_runs')?(await tx.query("SELECT to_regclass('app_video_workflow_runs') AS runs,to_regclass('app_video_workflow_run_nodes') AS nodes")).rows[0]:null;
 const workflowPresent=!!workflowSchema?.runs&&!!workflowSchema?.nodes;
 // Only the requested page's exact IDs and owners. Parent-child expansion never
 // follows a child of another owner. Do not load payloads or paid result bytes.
 const diagnosticProjection=`jsonb_build_object(
 'failureDiagnostic',jsonb_build_object('version',j.snapshot#>'{failureDiagnostic,version}','reason',left(j.snapshot#>>'{failureDiagnostic,reason}',100),'stage',left(j.snapshot#>>'{failureDiagnostic,stage}',60),'observedAt',left(j.snapshot#>>'{failureDiagnostic,observedAt}',40)),
 'deliveryFailure',jsonb_build_object('stage',left(j.snapshot#>>'{deliveryFailure,stage}',60),'code',left(j.snapshot#>>'{deliveryFailure,code}',64)),
 'stage',left(COALESCE(j.snapshot#>>'{result,stage}',j.snapshot->>'stage'),60),
 'error',left(COALESCE(j.snapshot->>'error',j.snapshot#>>'{result,error,message}'),2048),
 'hasImages',jsonb_array_length(CASE WHEN jsonb_typeof(j.snapshot->'images')='array' THEN j.snapshot->'images' ELSE '[]'::jsonb END)>0)`;
 const imageSources=kinds.has('app_image_jobs');
 const images=imageSources?`images AS (
  SELECT r.root,j.id,j.email,j.snapshot->'children' AS children,COALESCE(j.snapshot#>>'{result,status}',j.snapshot->>'status') AS status,
  COALESCE(j.snapshot->>'failureCode',j.snapshot#>>'{result,error,code}') AS failure_code,${diagnosticProjection} AS task_snapshot,j.updated_at,0 AS depth,ARRAY[j.id] AS path FROM refs r
  JOIN app_image_jobs j ON r.table_name='app_image_jobs' AND j.id=r.id AND j.email=r.email
  UNION ALL SELECT p.root,j.id,j.email,j.snapshot->'children',COALESCE(j.snapshot#>>'{result,status}',j.snapshot->>'status'),
  COALESCE(j.snapshot->>'failureCode',j.snapshot#>>'{result,error,code}'),${diagnosticProjection},j.updated_at,p.depth+1,p.path||j.id FROM images p
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.children)='object' THEN p.children ELSE '{}'::jsonb END) child
  JOIN app_image_jobs j ON j.id=child.value->>'jobId' AND j.email=p.email WHERE p.depth<8 AND NOT j.id=ANY(p.path)),`:'';
 // SQL acquires relation locks even for a source type with no matching refs.
 // Keep the branch allowlist in the read model; caller refs are only bind data.
 const reads=[
  imageSources?`SELECT root,id,email,status,failure_code,updated_at,depth=8 AS clipped,
  task_snapshot->'failureDiagnostic' AS task_diagnostic,task_snapshot->'deliveryFailure' AS delivery_failure,
  COALESCE(task_snapshot#>>'{result,stage}',task_snapshot->>'stage') AS task_stage,
  left(COALESCE(task_snapshot->>'error',task_snapshot#>>'{result,error,message}'),2048) AS task_error,
  COALESCE((task_snapshot->>'hasImages')::boolean,false) AS recorded_output FROM images`:null,
  kinds.has('app_video_tasks')?`SELECT r.root,v.id,v.email,v.status,NULLIF(to_jsonb(v)->>'error_code',''),v.updated_at,false,NULL::jsonb,NULL::jsonb,'execute'::text,left(to_jsonb(v)->>'error',2048),false FROM refs r JOIN app_video_tasks v ON r.table_name='app_video_tasks' AND v.id=r.id AND v.email=r.email`:null,
  kinds.has('app_canvas_image_tasks')?`SELECT r.root,c.id,c.email,c.status,NULL::text,c.updated_at,false,NULL::jsonb,NULL::jsonb,'execute'::text,left(c.error,2048),false FROM refs r JOIN app_canvas_image_tasks c ON r.table_name='app_canvas_image_tasks' AND c.id=r.id AND c.email=r.email`:null,
  workflowPresent?`SELECT r.root,COALESCE(n.task_id,n.run_id::text||':'||n.node_id),w.email,CASE WHEN n.status='blocked' THEN 'failed' ELSE n.status END,CASE WHEN n.status='blocked' THEN 'workflow-blocked' ELSE NULL END,n.updated_at,false,NULL::jsonb,NULL::jsonb,'execute'::text,left(n.error,2048),false FROM refs r JOIN app_video_workflow_runs w ON r.table_name='app_video_workflow_runs' AND w.id::text=r.id AND w.email=r.email JOIN app_video_workflow_run_nodes n ON n.run_id=w.id`:null,
 ].filter(Boolean);
 if(!reads.length)return result;
 const supplierPresent=!!(await tx.query("SELECT to_regclass('app_supplier_calls') AS name")).rows[0]?.name;
 const sql=`WITH RECURSIVE refs AS (SELECT DISTINCT * FROM jsonb_to_recordset($1::jsonb) AS r(root text,table_name text,id text,email text)),
 ${images} task_rows(root,id,email,status,failure_code,updated_at,clipped,task_diagnostic,delivery_failure,task_stage,task_error,recorded_output) AS (${reads.join(' UNION ALL ')}),
 selected AS MATERIALIZED (SELECT DISTINCT * FROM task_rows ORDER BY root,updated_at DESC,id LIMIT 1001)
 SELECT t.*,b.state AS billing_state,b.charged_credits,b.reserved_credits${supplierPresent?',s.*':''} FROM selected t
 LEFT JOIN app_billing_operations b ON b.id=t.id AND b.email=t.email
 ${supplierPresent?`LEFT JOIN LATERAL (
  SELECT s.id AS call_id,s.provider_id,s.model,s.actual_model,s.state AS call_state,s.cost_status,s.delivered,s.request_id,s.task_id,s.updated_at AS call_updated_at,
  s.evidence#>>'{upstreamFailure,code}' AS upstream_failure_code,s.evidence->>'transportCode' AS transport_code,s.evidence->>'failureCategory' AS failure_category,s.evidence->>'httpStatus' AS http_status,
  s.evidence#>>'{postAcceptanceFailure,stage}' AS post_stage,s.evidence#>'{postAcceptanceFailure,causes}' AS post_causes
  FROM app_supplier_calls s WHERE s.operation_id=t.id AND s.user_email=t.email ORDER BY s.started_at DESC,s.id DESC LIMIT 1)s ON true`:''}
 ORDER BY t.root,t.updated_at DESC,t.id`;
 const rows=(await tx.query(sql,[JSON.stringify(refs)])).rows;
 if(rows.length>1000)return new Map(roots.map(id=>[id,missingCreationFailure(true)]));
 for(const root of roots){
  if(rows.some(r=>r.root===root&&r.clipped)){result.set(root,missingCreationFailure(true));continue;}
  const score=(f:CreationFailure)=>f.diagnosis?.source==='task_diagnostic'&&f.diagnosis.certainty==='confirmed'?6:f.evidence==='supplier_receipt'&&f.diagnosis?.certainty==='confirmed'?5:f.diagnosis?.source==='delivery_checkpoint'||f.diagnosis?.source==='task_diagnostic'?4:f.evidence==='supplier_receipt'?3:f.diagnosis?.certainty==='confirmed'?2:1;
  const candidates=rows.filter(r=>r.root===root&&hasCreationFailure(r.status)).map(creationFailureFromRow).sort((a,b)=>score(b)-score(a));
  result.set(root,candidates[0]||missingCreationFailure());
 }
 return result;
}

export async function legacyCreationFailuresInTransaction(tx:Reader,refs:Ref[]){
 if(refs.length>100)throw new Error('FAILURE_PAGE_LIMIT');
 return refs.length?readFailures(tx,refs.filter(r=>tables.includes(r.table_name)),refs.map(r=>r.root)):new Map<string,CreationFailure>();
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
 const result=await readFailures(tx,refs,roots.map(r=>r.id),rows.length>1000||rows.some(r=>r.depth===16));
 // Agent preflight failures do not have image-job rows: read their own immutable
 // turn events, never reinterpret a sibling's successful paid task as failed.
 const tools=(await tx.query(`SELECT DISTINCT ON (e.creation_id) e.creation_id,e.summary,e.occurred_at FROM app_creation_events e
  JOIN app_creation_records c ON c.id=e.creation_id
  JOIN jsonb_to_recordset($1::jsonb) r(id text,email text) ON r.id=c.id AND r.email=c.actor_email
  WHERE e.type='agent-tool' AND e.status='failed' ORDER BY e.creation_id,e.occurred_at DESC LIMIT 100`,[JSON.stringify(roots)])).rows;
 for(const event of tools){
  if(result.get(event.creation_id)?.evidence!=='not_recorded')continue;
  let detail;try{detail=JSON.parse(event.summary)}catch{continue}
  if(typeof detail.tool!=='string'||typeof detail.summary!=='string')continue;
  const f=missingCreationFailure();
  result.set(event.creation_id,{...f,title:detail.submissionState==='not_submitted'?'工具参数检查未通过，尚未提交':'Agent 工具执行未完成',description:detail.summary,stage:detail.tool,code:typeof detail.code==='string'?detail.code:null,evidence:'task_state',observedAt:new Date(event.occurred_at).toISOString(),diagnosis:{certainty:'confirmed',facts:[detail.summary],missing:[],nextChecks:['核对本轮工具调用与各子任务账务'],taskId:null,callId:typeof detail.callId==='string'?detail.callId:null,requestId:null,taskState:'failed',source:'task_diagnostic'}});
 }
 return result;
}
