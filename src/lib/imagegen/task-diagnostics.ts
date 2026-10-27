import {imageFailureEvidence} from './failure-evidence';

/** Bounded, non-secret execution evidence. This is never a retry or billing decision. */
export const diagnosticStages = {
  execute:'任务执行', 'supplier-result':'获取供应结果', 'output-processing':'图片后处理',
  storage:'保存图片文件', 'image-checkpoint':'保存图片检查点', artworks:'写入作品记录',
  settlement:'积分结算', 'final-receipt':'保存最终回执', 'parent-finalize':'父任务汇总',
  recovery:'任务恢复', 'download-image':'下载原结果图片', 'decode-pixels':'解码原结果图片',
  'parse-response':'解析供应响应', 'read-response':'读取供应响应', unknown:'未确认',
} as const;
export type DiagnosticStage = keyof typeof diagnosticStages;
export const taskReasonLabels = {
  CHANNEL_DISABLED:'执行通道已停用', CONFIG_UNAVAILABLE:'冻结模型配置暂不可读取',
  CONFIG_NOT_READY:'模型配置尚未就绪', CREDENTIAL_UNAVAILABLE:'执行凭据不可读取',
  INVALID_CREDENTIAL:'执行凭据配置无效', MODEL_UNAVAILABLE:'所选模型不可用',
  MODEL_INCOMPATIBLE:'模型与请求参数不兼容', INVALID_REQUEST:'请求参数校验未通过',
  INVALID_CONFIG:'执行配置校验未通过', FEATURE_DISABLED:'该功能当前未启用',
  PROVIDER_BUSY:'供应通道执行容量已满', EXECUTION_MISMATCH:'执行配置与冻结身份不一致',
  ROUTE_EXHAUSTED:'没有可用的执行路由', ROUTE_BUDGET:'已达到本次执行路由预算',
  UNSUPPORTED_PROTOCOL:'该供应协议尚不支持此操作',
  SUBMISSION_UNKNOWN:'步骤提交结果尚未确认', CHILD_MISSING:'关联子任务缺失或归属不匹配',
  CHILD_PENDING:'子任务结果需要核查', NOT_ACCEPTED:'执行步骤未被接受',
  PARTIAL_EXECUTION_REJECTED:'部分步骤被拒绝，已有结果保留',
  IMAGE_PARAMETER_REJECTED:'供应接口拒绝了生成参数', IMAGE_INPUT_REJECTED:'供应接口拒绝了参考图片',
  IMAGE_CONTENT_REJECTED:'供应接口内容审核未通过', IMAGE_ACCESS_DENIED:'供应接口访问被拒绝',
  IMAGE_RATE_LIMITED:'供应接口触发限流', IMAGE_UPSTREAM_UNAVAILABLE:'供应接口暂时不可用',
  IMAGE_REQUEST_REJECTED:'供应接口拒绝了本次请求',
  'legacy-unknown-submission':'历史任务缺少供应受理检查点',
  creation_unknown:'视频创建受理结果尚未确认', poll_timeout:'查询供应结果超时',
  'workflow-blocked':'工作流节点被阻断',
  'input-unavailable':'输入素材不存在或不可访问', 'output-unavailable':'已记录的任务产物不可读取',
  'lease-lost':'任务执行租约已失效', 'image-missing':'供应响应没有有效图片',
  'image-download':'原结果图片下载失败', 'image-decode':'原结果图片解码失败',
  'image-size':'原结果图片尺寸或大小无效', 'json':'响应内容解析失败',
  'body-state':'响应流已被消费或锁定', 'body-size':'响应内容超过读取上限',
  'stack-limit':'执行过程超过递归深度', 'timeout':'当前步骤执行超时',
  ETIMEDOUT:'当前步骤连接超时', ECONNRESET:'当前步骤连接被重置',
  ECONNREFUSED:'当前步骤连接被拒绝', ENOTFOUND:'当前步骤地址解析失败',
  EAI_AGAIN:'当前步骤地址解析暂时失败', ENETUNREACH:'当前步骤网络不可达',
  EHOSTUNREACH:'当前步骤主机不可达', UND_ERR_CONNECT_TIMEOUT:'当前步骤连接超时',
  UND_ERR_SOCKET:'当前步骤连接异常终止', ERR_STREAM_PREMATURE_CLOSE:'响应流提前关闭',
  ABORT_ERR:'当前步骤已中止', '23505':'写入记录发生唯一键冲突',
  '40001':'数据库事务并发冲突', '40P01':'数据库事务发生死锁', '53300':'数据库连接数已满',
  '57P01':'数据库连接被终止', ENOSPC:'文件存储空间不足', EACCES:'文件读写权限不足',
} as const;
export type TaskReasonCode = keyof typeof taskReasonLabels;
export type TaskFailureDiagnostic = {
  version:1;stage:DiagnosticStage;reason:TaskReasonCode|null;observedAt:string;
  causes:{name:string;code?:string;kind:string}[];
};
const own=(o:object,key:unknown):key is string=>typeof key==='string'&&Object.hasOwn(o,key);
const safeStage=(stage:unknown):DiagnosticStage=>own(diagnosticStages,stage)?stage as DiagnosticStage:'unknown';
function exactLocalReason(message:unknown):TaskReasonCode|null {
  if(typeof message!=='string')return null;
  const value=message.slice(0,2048);
  if(/^(任务执行权已过期|任务执行租约已失效)$/.test(value))return 'lease-lost';
  if(/^(任务产物不存在或无权访问|任务产物不存在)$/.test(value))return 'output-unavailable';
  if(/^(输入素材不存在或无权访问|输入图片不存在|素材不存在或无权访问)$/.test(value))return 'input-unavailable';
  if(/^(模型未返回有效图片|supplier-image-missing)$/.test(value))return 'image-missing';
  if(value==='supplier-image-invalid-output')return 'image-decode';
  if(value==='supplier-image-size-invalid')return 'image-size';
  if(value==='supplier-image-download-failed')return 'image-download';
  return null;
}
export function taskFailureDiagnostic(error:unknown,stage:unknown='execute'):TaskFailureDiagnostic {
  const causes=imageFailureEvidence(error).causes;
  let code:unknown,message:unknown;
  try {
    let current=error;const seen=new Set<object>();
    while(current&&typeof current==='object'&&!seen.has(current)&&seen.size<4){
      seen.add(current);const value=current as {code?:unknown;message?:unknown;cause?:unknown};
      if(message===undefined)message=value.message;
      if(own(taskReasonLabels,value.code)){code=value.code;break;}
      current=value.cause;
    }
  } catch { /* hostile diagnostic getters */ }
  // Free-form errors can echo prompts. A word match alone is not a confirmed
  // cause; require a finite code, exact local signature, or typed native error.
  const reason=own(taskReasonLabels,code)?code as TaskReasonCode:exactLocalReason(message)||
    causes.map(c=>own(taskReasonLabels,c.code)?c.code as TaskReasonCode:
      c.name==='RangeError'&&c.kind==='stack-limit'?'stack-limit':
      c.name==='SyntaxError'&&c.kind==='json'?'json':
      c.name==='TimeoutError'||c.name==='APIConnectionTimeoutError'?'timeout':null).find(Boolean)||null;
  return {version:1,stage:safeStage(stage),reason,observedAt:new Date().toISOString(),causes};
}
/** Read only known scalars from persisted evidence; never trust arbitrary stored keys. */
export function readTaskDiagnostic(value:unknown):TaskFailureDiagnostic|null {
  if(!value||typeof value!=='object'||(value as {version?:unknown}).version!==1)return null;
  const v=value as Record<string,unknown>;
  const time=typeof v.observedAt==='string'&&Number.isFinite(Date.parse(v.observedAt))?new Date(v.observedAt).toISOString():'';
  return {version:1,stage:safeStage(v.stage),reason:own(taskReasonLabels,v.reason)?v.reason as TaskReasonCode:null,observedAt:time,causes:[]};
}
/** Legacy text is classified locally against finite signatures, not sent to the UI. */
export function legacyTaskDiagnostic(code:unknown,message:unknown,stage:unknown):TaskFailureDiagnostic {
  const value=taskFailureDiagnostic({code,message},stage);
  // Old arbitrary message bodies can contain echoed prompts. Only exact known
  // local signatures or an explicit finite error code establish a legacy cause.
  return {...value,reason:own(taskReasonLabels,code)?code as TaskReasonCode:exactLocalReason(message),causes:[]};
}
