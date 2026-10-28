'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import {useSiteProfile} from '@/lib/site-control/client';
import { authHeader } from '@/lib/supabase';
import type { TenantUsage } from '@/lib/saas/tenant-usage-contracts';
import styles from './tenant-usage-panel.module.css';

const number = (value: number | null | undefined) => value == null ? '未记录' : value.toLocaleString('zh-CN');
const currentPeriod = () => {
  const to = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  return { from: new Date(Date.parse(to) - 6 * 86400_000).toISOString().slice(0, 10), to };
};
export function TenantUsagePanel({ tenantId, enterprise = false, refreshRevision = 0, selectedPeriod }: { tenantId: string; enterprise?: boolean; refreshRevision?: number; selectedPeriod?: { from: string; to: string } }) {
  const dedicated=useSiteProfile().mode==='enterprise';
  const [localPeriod, setPeriod] = useState(currentPeriod), [retry, setRetry] = useState(0);
  const period = selectedPeriod || localPeriod;
  const [result, setResult] = useState<{ key: string; data?: TenantUsage; error?: string } | null>(null);
  const key = `${enterprise}:${tenantId}:${period.from}:${period.to}`;
  const current = result?.key === key ? result : null;
  const valid = !!period.from && !!period.to && period.from <= period.to && Date.parse(period.to) - Date.parse(period.from) <= 366 * 86400_000;
  useEffect(() => {
    const controller = new AbortController(); setResult(null);
    if (!valid) return () => controller.abort();
    void (async () => {
      try {
        const query = new URLSearchParams({ tenantId, ...period });
        const response = await fetch(`/api/${enterprise ? 'enterprise' : 'admin'}/tenant-usage?${query}`, { headers: await authHeader(), cache: 'no-store', signal: controller.signal });
        const payload = await response.json();
        if (!controller.signal.aborted) setResult(response.ok ? { key, data: payload } : { key, error: '企业用量读取失败，请重试' });
      } catch { if (!controller.signal.aborted) setResult({ key, error: '企业用量读取失败，请重试' }); }
    })();
    return () => controller.abort();
  }, [tenantId, enterprise, key, period, retry, valid, refreshRevision]);
  const data = current?.data;
  const records = enterprise ? `${dedicated?'/admin':'/enterprise'}?${new URLSearchParams({ ...(dedicated?{}:{enterpriseId:tenantId}), view:'records',recordView:'confirmed', ...period })}` : `/admin/creations?${new URLSearchParams({ tenantId, ...period })}`;
  return <section className={styles.card} aria-label='企业创作用量' aria-busy={valid && !current}>
    <header className={styles.header}><div><h2>{dedicated?'创作用量':'企业创作用量'}</h2><span>{data?.scope === 'current_subordinates' ? '当前可见下级范围' : dedicated?'全部成员':'当前企业'} · 按创作受理日期</span></div><div className={styles.filters}>
      {selectedPeriod ? <span>{period.from} — {period.to}</span> : <><label>开始日期<input aria-label='用量开始日期' type='date' value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} /></label>
      <label>结束日期<input aria-label='用量结束日期' type='date' value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} /></label></>}
      <button type='button' aria-label='刷新企业用量' disabled={valid && !current} onClick={() => setRetry(n => n + 1)}><RefreshCw size={15} /></button>
    </div></header>
    {!dedicated&&<p className={styles.note}>积分从实际付款成员账户结算，企业没有独立钱包。</p>}
    {!valid ? <p className={styles.error} role='alert'>请选择一年内的有效日期范围</p> : current?.error ? <p className={styles.error} role='alert'>{current.error}<button onClick={() => setRetry(n => n + 1)}>重试</button></p> : !data ? <p role='status'>正在读取企业用量…</p> : <>
      <div className={styles.metrics}>{[['已确认归属创作', data.creations, '次'], ['已结算消费', data.chargedCredits, '积分'], ['处理中冻结', data.reservedCredits, '积分'], ['未完成结算', data.pendingOperations, '笔']].map(([label, value, unit]) => <div key={String(label)}><span>{label}</span><strong>{number(value as number | null)}<small>{unit}</small></strong></div>)}</div>
      {data.availability === 'not_recorded' && <p className={styles.note}>企业创作证据尚未记录。</p>}
      {!!data.unrecordedCreations && <p className={styles.note}>{number(data.unrecordedCreations)} 次创作计费依据不完整，当前仅展示已记录消费。</p>}
      <p className={styles.note}>消费为已记录结算扣款，后续退款请查看积分流水。</p>
      <footer className={styles.footer}><span>更新于 {new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span><a href={records}>查看创作与结算记录<ArrowUpRight size={14} /></a></footer>
    </>}
  </section>;
}
