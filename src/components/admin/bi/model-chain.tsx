"use client";
import type { BiRow } from "@/lib/bi/contracts";
import type { ModelAttempt } from "@/lib/bi/model-chain";
import styles from "./model-chain.module.css";
export function ModelChain({ row }: { row: BiRow }) {
  let attempts: ModelAttempt[] = [];
  try { const parsed: unknown = JSON.parse(String(row.model_attempts || "[]")); if (Array.isArray(parsed)) attempts = parsed.slice(0, 100); } catch { /* Historical absent evidence. */ }
  return <section className={styles.root} aria-label="模型请求与执行">
    <div className={styles.chain}>
      <div><span>前端显示模型</span><strong>{String(row.frontend_model_label || "未记录")}</strong>{row.frontend_model_id && <code>{String(row.frontend_model_id)}</code>}</div>
      <b aria-hidden="true">→</b>
      <div><span>实际请求模型</span><strong>{String(row.actual_request_model || "未记录")}</strong></div>
      <b aria-hidden="true">→</b>
      <div><span>上游确认模型</span><strong>{String(row.actual_executed_model || "未确认")}</strong></div>
    </div>
    <p className={styles.evidence}>{String(row.model_evidence || "缺少实际调用证据")}{row.model_evidence_scope && ` · ${row.model_evidence_scope}`}</p>
    {attempts.length > 0 && <div className={styles.tableWrap}><table><thead><tr><th>尝试</th><th>执行通道</th><th>实际请求模型</th><th>上游确认模型</th><th>状态</th></tr></thead><tbody>
      {attempts.map((attempt, i) => <tr key={i}><td>{i + 1}</td><td>{attempt.provider}</td><td>{attempt.requestModel || "未记录"}</td><td>{attempt.responseModel || "未确认"}</td><td>{attempt.state}</td></tr>)}
    </tbody></table></div>}
  </section>;
}
