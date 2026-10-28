import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {supplierFailureEvidence} from './failure-evidence';
import {imageSupplierFailure} from '../model-config/supplier-failure';

/** Keep a finite diagnosis, never the provider's echoed text, URLs or secrets. */
export class SupplierAdapterResponseError extends Error {
  readonly notCharged: boolean;
  readonly evidence: Record<string, unknown>;
  constructor(readonly status: number, raw: string, body: unknown, invalidJson = false) {
    super(`Supplier HTTP ${status}${invalidJson ? ' invalid JSON' : ''}`);
    const b=body && typeof body==='object' ? body as Record<string,any> : {};
    this.notCharged=b.billing_status==='not_charged'||b.error?.billing_status==='not_charged';
    const formatRejected=typeof b.error?.message==='string' && /^unsupported response format for [\w.-]+: [\w-]+; only `url` is supported$/i.test(b.error.message);
    this.evidence={httpStatus:status,responseSha256:createHash('sha256').update(raw).digest('hex'),
      ...supplierFailureEvidence(status,body),
      ...(invalidJson?{failureCategory:'invalid-response',adapterReason:'invalid-json'}:
        {upstreamFailure:formatRejected?{code:'IMAGE_PARAMETER_REJECTED',status,parameter:'output_format'}:imageSupplierFailure(status,body)}),
      ...(formatRejected?{failureCategory:'invalid-parameters',adapterReason:'response-format-unsupported'}:{})};
  }
}

export function adapterFailureEvidence(error:unknown,stage:string){
  return {adapterStage:stage,observedAt:new Date().toISOString(),
    ...(error instanceof SupplierAdapterResponseError?error.evidence:
      stage==='submit-receipt'?{failureCategory:'invalid-response',adapterReason:'invalid-task-receipt'}:
      error instanceof SyntaxError?{failureCategory:'invalid-response',adapterReason:'invalid-json'}:
        {...supplierFailureEvidence(0,undefined,error),...(error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?{adapterReason:'request-aborted'}:{})})};
}

/** Diagnostic writes do not authorize a new POST or replace task/cost receipts. */
export async function recordSupplierAdapterFailure(pool:Pick<Pool,'query'>,id:string,evidence:Record<string,unknown>,unknownSubmission:boolean){
  await pool.query(`UPDATE app_supplier_calls SET evidence=COALESCE(evidence,'{}'::jsonb)||$2::jsonb,
    state=CASE WHEN $3 AND task_id IS NULL AND state='submitting' THEN 'unknown' ELSE state END,
    updated_at=now() WHERE id=$1`,[id,JSON.stringify(evidence),unknownSubmission]);
}
