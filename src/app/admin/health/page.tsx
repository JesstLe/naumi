import {AdminCenterShell} from "@/components/admin/center-shell";
import { requireAdminPage } from "@/lib/admin-page";
import { dbEnabled, getPool } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "运行健康 — Naumi", robots: { index: false, follow: false } };

type Row = Record<string, string | number | null>;

async function q(sql: string): Promise<Row[]> {
  if (!dbEnabled) return [];
  const res = await getPool().query(sql);
  return res.rows as Row[];
}

const num = (v: unknown) => Number(v ?? 0);

export default async function AdminHealthPage() {
  await requireAdminPage("/admin/health");
  const hasNegative = num((await q(`SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('app_worker_tick_receipts') AND attname='nonacceptance_at' AND NOT attisdropped)::int has_negative`))[0]?.has_negative) === 1;
  const [queue, parents, unknown, ticks, scans, supplier, config] = await Promise.all([
    q(`SELECT count(*)::int n, round(extract(epoch FROM (now()-min(created_at)))/60)::int oldest_min
       FROM app_image_jobs WHERE kind='generate' AND snapshot->>'status'='pending' AND snapshot->>'queueState'='execution'`),
    q(`SELECT count(*)::int n, round(extract(epoch FROM (now()-min(created_at)))/60)::int oldest_min
       FROM app_image_jobs WHERE kind='imagegen' AND snapshot->>'status'='pending'`),
    q(`SELECT count(*) FILTER(WHERE state='unknown')::int unknown_n, count(*) FILTER(WHERE state='active' AND heartbeat_at<now()-interval '10 minutes')::int stale_n
       FROM app_release_activities WHERE work_scope='durable-image' AND activity_kind='accepted-work' AND state IN('active','unknown')`),
    q(`SELECT count(*)::int n, max(accepted_at) last_at FROM app_worker_tick_receipts WHERE accepted_at>now()-interval '5 minutes'${hasNegative ? ' AND nonacceptance_at IS NULL' : ''}`),
    q(`SELECT count(*)::int n FROM app_release_activities WHERE admission_key LIKE 'recovery-dispatch-scan%' AND started_at>now()-interval '5 minutes'`),
    q(`SELECT provider_id, state, count(*)::int n FROM app_supplier_calls WHERE started_at>now()-interval '1 hour' GROUP BY 1,2 ORDER BY 1,2`),
    q(`SELECT version, config->'providers' providers FROM app_model_config_versions ORDER BY version DESC LIMIT 1`),
  ]);
  const queueRow = queue[0] ?? { n: 0, oldest_min: null };
  const parentRow = parents[0] ?? { n: 0, oldest_min: null };
  const unknownRow = unknown[0] ?? { unknown_n: 0, stale_n: 0 };
  const tickRow = ticks[0] ?? { n: 0, last_at: null };
  const scanRow = scans[0] ?? { n: 0 };
  const providers = Array.isArray(config[0]?.providers) ? (config[0]!.providers as Array<Record<string, unknown>>) : [];
  const gates = providers.filter(p => p.enabled).map(p => `${String(p.id)} ≤${num(p.maxConcurrent)}`);

  const level = (bad: boolean, warn: boolean) => (bad ? "🔴" : warn ? "🟡" : "🟢");
  const queueOld = num(queueRow.oldest_min);
  const tickOk = num(tickRow.n) > 0;
  const supplierErrors = supplier.filter(r => !["completed", "stream-completed", "response-received", "submitting"].includes(String(r.state)));

  return (
    <AdminCenterShell active="health"><div className="container py-8 text-sm">
      <h1 className="mb-4 text-lg font-semibold">运行健康</h1>
      <p className="mb-6 text-muted-foreground">队列、Worker、恢复扫描与供应商通道的实时状态。红灯项需要立即处理；黄灯项需要关注。</p>

      <div className="mb-8 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
        <div className="rounded border p-3">
          <div>{level(queueOld > 10, queueOld > 2 || num(queueRow.n) > 20)} 执行队列</div>
          <strong className="text-xl">{num(queueRow.n)} 笔</strong>
          <div className="text-muted-foreground">最老 {queueOld} 分钟前提交</div>
        </div>
        <div className="rounded border p-3">
          <div>{level(num(parentRow.n) > 10, num(parentRow.n) > 0)} 未定局生图父任务</div>
          <strong className="text-xl">{num(parentRow.n)} 笔</strong>
          <div className="text-muted-foreground">最老 {num(parentRow.oldest_min)} 分钟</div>
        </div>
        <div className="rounded border p-3">
          <div>{level(num(unknownRow.unknown_n) > 0, num(unknownRow.stale_n) > 0)} 卡死活动（unknown/死 active）</div>
          <strong className="text-xl">{num(unknownRow.unknown_n) + num(unknownRow.stale_n)}</strong>
          <div className="text-muted-foreground">unknown {num(unknownRow.unknown_n)} · 死active {num(unknownRow.stale_n)}</div>
        </div>
        <div className="rounded border p-3">
          <div>{level(!tickOk, num(tickRow.n) < 10)} Worker tick（近5分钟）</div>
          <strong className="text-xl">{num(tickRow.n)} 次</strong>
          <div className="text-muted-foreground">恢复扫描 {num(scanRow.n)} 轮</div>
        </div>
      </div>

      <h2 className="mb-2 font-semibold">供应商通道（近 1 小时）</h2>
      {supplier.length === 0 ? (
        <p className="mb-8 text-muted-foreground">近 1 小时无调用。</p>
      ) : (
        <table className="mb-8 w-full border-collapse text-left">
          <thead><tr className="border-b"><th className="py-1">通道</th><th>状态</th><th>笔数</th></tr></thead>
          <tbody>
            {supplier.map((r, i) => (
              <tr key={i} className="border-b">
                <td className="py-1">{String(r.provider_id)}</td>
                <td className={supplierErrors.includes(r) ? "text-red-600" : ""}>{String(r.state)}</td>
                <td>{num(r.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {supplierErrors.length > 0 && (
        <p className="mb-8 text-red-600">近 1 小时存在异常供应商结果 {supplierErrors.reduce((s, r) => s + num(r.n), 0)} 笔，点击「模型与供应商」核对通道健康。</p>
      )}

      <h2 className="mb-2 font-semibold">并发闸门（当前配置 v{config[0] ? num(config[0].version) : "-"}，仅启用通道）</h2>
      <p className="text-muted-foreground">{gates.length ? gates.join(" · ") : "无启用通道"}</p>
    </div></AdminCenterShell>
  );
}
