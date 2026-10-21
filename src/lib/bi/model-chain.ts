export type ModelAttempt = { requestModel: string; responseModel: string; state: string; provider: string; phase: string; source: string };
export type ModelCallEvidence = {
  id: string; email: string; operation_id: string; root_id?: string; frontend_model_id?: string; frontend_model_label?: string;
  wire_model?: string; response_model?: string; model_attempts?: ModelAttempt[];
};
const unique = (values: (string | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))].join(" / ");
/** Preserve retries as separate pairs. A submitted alias is never evidence of a reported model. */
export function modelChainPresentation(calls: ModelCallEvidence[]) {
  const attempts = calls.flatMap(call => call.model_attempts || []);
  return {
    frontend_model_id: unique(calls.map(call => call.frontend_model_id)),
    frontend_model_label: unique(calls.map(call => call.frontend_model_label)) || "未记录",
    actual_request_model: unique(attempts.map(attempt => attempt.requestModel)) || "未记录",
    actual_executed_model: unique(attempts.map(attempt => attempt.responseModel)) || "未确认",
    model_evidence: attempts.length ? attempts.some(a => a.responseModel) ? attempts.some(a => !a.responseModel) ? "部分尝试已确认；其余未确认" : "上游响应 / 执行回执" : "已记录实际请求；执行模型未确认" : calls.some(c => c.response_model) ? "仅接口响应；底层执行未确认" : "缺少实际调用证据",
    model_attempts: JSON.stringify(attempts),
  };
}

/** Projection excludes URLs, credentials, request bodies and supplier receipt payloads. */
export const MODEL_CALL_EVIDENCE_SQL = `WITH wanted AS MATERIALIZED (
    SELECT * FROM unnest($1::text[],$2::text[]) AS w(id,email)
  ), operation_ids AS MATERIALIZED (
    SELECT id AS root_id,email,id AS operation_id FROM wanted WHERE NOT $3::boolean
    UNION
    SELECT w.id,w.email,k.operation_id FROM wanted w
    JOIN app_image_jobs j ON j.id=w.id AND j.email=w.email
    CROSS JOIN LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(j.snapshot->'paidOperations')='object' THEN j.snapshot->'paidOperations' ELSE '{}'::jsonb END) k(operation_id)
    WHERE NOT $3::boolean
  ), matched AS MATERIALIZED (
    SELECT w.id AS root_id,c.* FROM wanted w JOIN app_bi_model_calls c ON c.id=w.id AND c.email=w.email WHERE $3::boolean
    UNION ALL
    SELECT o.root_id,c.* FROM operation_ids o JOIN app_bi_model_calls c ON c.email=o.email AND c.operation_id=o.operation_id WHERE NOT $3::boolean
  ) SELECT c.root_id,c.id,c.email,c.operation_id,c.frontend_model_id,c.frontend_model_label,c.wire_model,c.response_model,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('requestModel',s.model,'responseModel',COALESCE(s.actual_model,''),
    'state',s.state,'provider',s.provider_id,'phase',s.phase,'source',COALESCE(s.evidence->>'source','')) ORDER BY s.started_at,s.id)
    FROM (SELECT model,actual_model,state,provider_id,phase,evidence,started_at,id FROM app_supplier_calls
      WHERE bi_call_id=c.id AND user_email=c.email ORDER BY started_at,id LIMIT 100) s),'[]'::jsonb) AS model_attempts
  FROM matched c`;
