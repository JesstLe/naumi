import { biAuthorize, biJson } from "@/lib/bi/access";
import { getPool } from "@/platform/db/pool";
import {ensureExecutionAuditSchema} from "@/lib/model-config/execution-audit-schema";

import {ensurePostprocessSchema} from "@/lib/media-postprocess-schema";
import {reportOperationVisibleSql} from "@/lib/accounts/creation-policy";

export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request:Request) {
  const auth=await biAuthorize(request);if(auth instanceof Response)return auth;
  const id=new URL(request.url).searchParams.get("operationId");
  if(!id||id.length>200)return biJson({error:"请提供有效任务编号"},400);
  const pool=getPool();await ensureExecutionAuditSchema(pool);await ensurePostprocessSchema(pool);
  if(!(await pool.query(`SELECT ${reportOperationVisibleSql('$1',true)} AS visible`,[id])).rows[0].visible)return biJson({error:"任务不存在"},404);
  const stages=(await pool.query("SELECT operation_id,feature,public_model_id,model_version,billing_version,provider_id,wire_model,matched_rule_id,phase,state,attempt,status,estimated_cost_cny_micros,cost_cny_micros,cost_status,cost_source,usage,created_at FROM app_model_execution_stages WHERE operation_id=$1 OR left(operation_id,length($1)+1)=$1||':' ORDER BY created_at LIMIT 100",[id])).rows;
  const postprocess=(await pool.query("SELECT operation_id,parent_operation_id,model_version,policy,width,height,state,attempts,processing_kind,cost_cny_micros,error FROM app_media_postprocess WHERE parent_operation_id=$1 ORDER BY created_at LIMIT 100",[id])).rows;
  const billing=(await pool.query("SELECT id,feature,state,quote,settlement_result,charged_credits FROM app_billing_operations WHERE id=$1",[id])).rows;
  return biJson({stages,postprocess,billing,costNotice:"预算为预留估计；price-estimate 为包价估算，usage-calculated 为真实用量乘冻结成本单价，均非供应商账单。unknown 不代表零。明确未收费单独记录为 0。"});
}
