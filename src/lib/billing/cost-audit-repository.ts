import "server-only";
import {getPool,dbEnabled} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import type {QualityCostAudit} from "@/lib/mock-data";

// ---------------------------------------------------------------------------
// 内部成本审计(质量档回退):只记不改,用户侧 app_ledger 账单不受影响。

/** 写入一条成本审计。绝不让审计影响出图主流程:任何错误只打日志。 */
export async function recordImageCostAudit(
  input: Omit<QualityCostAudit,"costCredits"|"marginCredits"> & {costCredits:number|null;marginCredits:number|null} & Partial<import("@/lib/billing/audit").CostAuditFields> & { jobId: string; email: string; imageId: string }
): Promise<void> {
  if (!dbEnabled) return;
  try {
    await ensureSchema();
    await getPool().query(
      `INSERT INTO app_image_cost_audit
         (id, job_id, email, requested_quality, executed_quality, upstream,
          images, billed_credits, cost_credits, margin_credits, reason,billing_config_version,cost_currency,cost_amount_micros,cost_source,cost_actual)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT(id) DO UPDATE SET billed_credits=EXCLUDED.billed_credits,
         cost_credits=EXCLUDED.cost_credits,margin_credits=EXCLUDED.margin_credits,billing_config_version=EXCLUDED.billing_config_version,cost_currency=EXCLUDED.cost_currency,cost_amount_micros=EXCLUDED.cost_amount_micros,cost_source=EXCLUDED.cost_source,cost_actual=EXCLUDED.cost_actual`,
      [
        `cst-${input.jobId}-${input.imageId}`,
        input.jobId,
        input.email.toLowerCase(),
        input.requestedQuality,
        input.executedQuality,
        input.upstream,
        input.images,
        input.billedCredits,
        input.costCredits,
        input.marginCredits,
        input.reason,
        input.billingConfigVersion??null,
        input.costCurrency===undefined?"credits":input.costCurrency,
        input.costAmountMicros===undefined?(input.costCredits===null?null:String(Math.round(input.costCredits*1000000))):input.costAmountMicros,
        input.costSource===undefined?"legacy-credit-estimate":input.costSource,
        input.costActual===undefined?false:input.costActual,
      ]
    );
  } catch (error) {
    console.error(
      "[cost-audit] 写入失败(不影响生成/计费):",
      error instanceof Error ? error.message : error
    );
  }
}

/** Read the committed charge, including BYOK and disabled metering (zero). */
export async function getImageJobChargedCredits(jobId: string): Promise<number> {
  if (!dbEnabled) return 0;
  const { rows } = await getPool().query("SELECT COALESCE(-sum(delta),0) AS charged FROM app_ledger WHERE id=$1 AND kind='consume'", [`led-image-${jobId}`]);
  return Number(rows[0].charged);
}

export async function getCanvasImageTaskChargedCredits(taskId: string): Promise<number> {
  if (!dbEnabled) return 0;
  const { rows } = await getPool().query("SELECT COALESCE(-sum(delta),0) AS charged FROM app_ledger WHERE id=$1 AND kind='consume'", [`led-canvas-image-${taskId}`]);
  return Number(rows[0].charged);
}

export type ImageCostAuditRow = Omit<QualityCostAudit,"costCredits"|"marginCredits"> & import("@/lib/billing/audit").CostAuditFields & {
  id: string;
  jobId: string;
  email: string;
  createdAt: string;
};

/** 内部成本审计查询:按时间倒序,供成本利润核算。 */
export async function listImageCostAudit(
  limit = 200
): Promise<ImageCostAuditRow[]> {
  if (!dbEnabled) return [];
  await ensureSchema();
  const { rows } = await getPool().query<{
    id: string;
    job_id: string;
    email: string;
    requested_quality: string;
    executed_quality: string;
    upstream: string;
    images: number;
    billed_credits: string;
    cost_credits: string|null;
    margin_credits: string|null;
    billing_config_version:string|null;cost_currency:string|null;cost_amount_micros:string|null;cost_source:string|null;cost_actual:boolean|null;
    reason: string;
    created_at: string;
  }>(
    `SELECT id, job_id, email, requested_quality, executed_quality, upstream,
            images, billed_credits, cost_credits, margin_credits, reason, created_at,billing_config_version,cost_currency,cost_amount_micros,cost_source,cost_actual
       FROM app_image_cost_audit ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    jobId: r.job_id,
    email: r.email,
    requestedQuality: r.requested_quality,
    executedQuality: r.executed_quality,
    upstream: r.upstream,
    images: r.images,
    billedCredits: Number(r.billed_credits),
    costCredits: r.cost_credits===null?null:Number(r.cost_credits),
    marginCredits: r.margin_credits===null?null:Number(r.margin_credits),
    billingConfigVersion:r.billing_config_version===null?null:Number(r.billing_config_version),costCurrency:r.cost_currency,costAmountMicros:r.cost_amount_micros,costSource:r.cost_source,costActual:r.cost_actual,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}
