import type { BiRow } from '@/lib/bi/contracts';
import type { IntegratedRecord, RecordKind } from './contracts';
const text=(v:unknown)=>typeof v==='string'&&v.length?v:null;
const number=(v:unknown)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;

/** Explicit allowlist: no raw URLs, upstream responses, hidden user fields, credentials or raw errors. */
export function normalizeRecord(instanceId:string,enterpriseId:string,kind:RecordKind,row:BiRow):IntegratedRecord {
  const email=String(row.email??'');
  const namespaces:Record<string,string>={app_image_jobs:'image-job',app_canvas_image_tasks:'canvas-task',app_video_tasks:'video-task'};
  const sourceKind=kind==='generations'?(namespaces[String(row.source_table)]??'legacy-generation'):kind==='artworks'?'artwork':'ledger';
  const id=String(row.id);
  const job=sourceKind==='image-job'?id:text(row.job_id),canvas=sourceKind==='canvas-task'?id:text(row.canvas_task_id),video=sourceKind==='video-task'?id:text(row.video_task_id);
  return { ref:{instanceId,enterpriseId,kind:sourceKind,id},account:{sourceKey:JSON.stringify([instanceId,email]),email,name:text(row.name)},
    createdAt:text(row.created_at??row.createdAt),title:text(row.title),prompt:kind==='artworks'?text(row.prompt_display??row.prompt):kind==='generations'?text(row.content):null,
    status:text(row.status),operation:text(row.operation_label??row.kind),sourceLabel:text(row.source_label??row.source),provenance:text(row.provenance_status),
    taskRefs:{imageJobId:job,canvasTaskId:canvas,videoTaskId:video,billingOperationId:text(row.operationId)},
    credits:{quoted:kind==='generations'?number(row.quoted_credits):null,charged:kind==='generations'&&row.has_ledger_charge===true?number(row.billed_credits):null,
      reserved:kind==='generations'?number(row.reserved_credits):null,delta:kind==='ledger'?number(row.delta):null,settled:typeof row.settled==='boolean'?row.settled:null,
      evidence:kind==='ledger'?'ledger-entry':row.has_ledger_charge===true?'linked-ledger':'unrecorded'},
    ledgerKind:kind==='ledger'?text(row.kind):null,
    media:{available:kind==='artworks'&&row.has_image===true,href:kind==='artworks'&&row.has_image===true?`/api/enterprise/media?${new URLSearchParams({enterpriseId,email,id})}`:null},
    attribution:{visibility:'current-enterprise-scope',businessOwnership:'unconfirmed',workflowTaskId:null} };
}
