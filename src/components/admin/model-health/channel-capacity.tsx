"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { authHeader } from '@/lib/supabase';
import { scheduleVisibleRefresh } from '@/lib/visible-refresh';
import styles from './model-health.module.css';

type Lease = { token: string; expiresAt: string };
type ProviderDetail = {
  id: string; name: string; enabled: boolean; merged: boolean;
  configuredMaxConcurrent: number; budgetMaxConcurrent: number | null;
  inFlight: number; leases: Lease[];
};
type ChannelRow = {
  upstreamId: string; providerId: string; providerName: string; wireModel: string; enabled: boolean;
  state: string; failures: number; retryAt: string | null; lastStatus: number | null; failureKind: string | null;
};
type Overview = { configVersion: number; generatedAt: string; providers: ProviderDetail[]; channels: ChannelRow[] };

const CHANNEL_BADGE: Record<string, string> = { available: 'healthy', recovering: 'checking', cooldown: 'unhealthy', failed: 'unhealthy', unobserved: 'stale' };
const CHANNEL_LABELS: Record<string, string> = { available: '可用', recovering: '恢复探测中', cooldown: '熔断冷却', failed: '失败', unobserved: '未观察' };

function clock(value: string) { return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); }
function remaining(expiresAt: string) {
  const seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  if (seconds <= 0) return '即将到期';
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))} 分钟`;
  return `${Math.floor(seconds / 3600)} 小时`;
}

export function ChannelCapacityPanel() {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null), [reason, setReason] = useState(''), [notice, setNotice] = useState('');
  const request = useRef<AbortController | null>(null), sequence = useRef(0);
  const load = useCallback(async () => {
    const id = ++sequence.current; request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      const response = await fetch('/api/admin/bi/channel-capacity', { cache: 'no-store', headers: await authHeader(), signal: controller.signal });
      const payload = await response.json();
      if (controller.signal.aborted || sequence.current !== id) return;
      if (!response.ok) { setData(null); setError(payload.error || '通道与容量数据暂不可用'); return; }
      setData(payload); setError('');
    } catch { if (!controller.signal.aborted && sequence.current === id) setError('通道与容量数据暂不可用'); }
    finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted && sequence.current === id) setBusy(false);
    }
  }, []);
  useEffect(() => {
    const stop = scheduleVisibleRefresh(async () => { if (!request.current) await load(); }, 60_000, true);
    return () => { sequence.current++; request.current?.abort(); request.current = null; stop(); };
  }, [load]);
  async function submitReset(providerId: string) {
    if (reason.trim().length < 3) { setNotice('请填写至少 3 个字符的操作原因'); return; }
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/admin/bi/channel-capacity', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ action: 'reset-budget', providerId, reason: reason.trim() }) });
      const payload = await response.json();
      if (!response.ok) { setNotice(payload.error || '预算重置失败'); return; }
      setNotice(payload.changed ? `已恢复 ${payload.providerId} 预算：${payload.previous} → ${payload.restored}` : `${payload.providerId} 预算与发布值一致，未修改`);
      setResetting(null); setReason(''); await load();
    } catch { setNotice('预算重置失败，请重试'); }
    finally { setBusy(false); }
  }
  async function submitProbe(providerId: string, upstreamId: string) {
    if (reason.trim().length < 3) { setNotice('请填写至少 3 个字符的操作原因'); return; }
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/admin/bi/channel-capacity', { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ action: 'clear-channel-probe', providerId, upstreamId, reason: reason.trim() }) });
      const payload = await response.json();
      if (!response.ok) { setNotice(payload.error || '恢复操作失败'); return; }
      setNotice(payload.cleared ? `已恢复 ${payload.providerId} · ${payload.wireModel} 通道：失败计数与冷却已清除` : '该通道当前没有需要清除的冷却记录');
      setResetting(null); setReason(''); await load();
    } catch { setNotice('恢复操作失败，请重试'); }
    finally { setBusy(false); }
  }
  return <section className={styles.stack} aria-label="通道与容量" aria-busy={busy}>
    <header className={styles.header}>
      <div className={styles.titleBox}>
        <h2>通道健康与供应商容量</h2>
        <p className={styles.subtitle}>{data ? `发布版本 ${data.configVersion} · 读取于 ${clock(data.generatedAt)}` : '按已发布配置读取通道状态、预算与在途租约'}<button className={styles.linkButton} type="button" disabled={busy} onClick={() => void load()}>{busy ? '刷新中…' : '刷新'}</button></p>
      </div>
    </header>
    {error && <p className={styles.errorBanner} role="alert">{error}<button className={styles.linkButton} onClick={() => void load()}>重试</button></p>}
    {notice && <p role="status" className={styles.actionNote}>{notice}</p>}
    {data && <div className={styles.grid}>
      {data.providers.map(provider => {
        const drift = provider.budgetMaxConcurrent !== null && provider.budgetMaxConcurrent < provider.configuredMaxConcurrent;
        return <article className={styles.providerCard} key={provider.id}>
          <header className={styles.providerHead}>
            <div className={styles.providerTitle}>
              <h2>{provider.name || provider.id}{provider.enabled ? '' : '（停用）'}</h2>
              <p className={styles.providerMeta}>{provider.id}{provider.merged ? ' · 共享凭据账户（与其他供应商合并预算）' : ''}</p>
            </div>
            <span className={styles.stateBadge} data-state={drift ? 'degraded' : 'healthy'}>{drift ? '预算低于发布值' : '预算正常'}</span>
          </header>
          <div className={styles.modelItem}>
            <dl className={styles.kpiGrid}><div><dt className={styles.kpiLabel}>在途 / 预算</dt><dd className={styles.kpiValue}>{provider.inFlight} / {provider.budgetMaxConcurrent ?? '未记录'}</dd><dd className={styles.kpiHint}>发布并发 {provider.configuredMaxConcurrent}</dd></div><div><dt className={styles.kpiLabel}>在途租约</dt><dd className={styles.kpiValue}>{provider.leases.length}</dd></div></dl>
            {provider.leases.length > 0 && <ul className={styles.leaseList}>{provider.leases.map(lease => <li key={lease.token} className={styles.providerMeta}><code>{lease.token.slice(0, 8)}…</code> · 到期 {clock(lease.expiresAt)}（{remaining(lease.expiresAt)}）</li>)}</ul>}
            {drift && <div className={styles.actionColumn}>
              {resetting === provider.id
                ? <div className={styles.stack}>
                    <input className={styles.reasonInput} value={reason} onChange={event => setReason(event.target.value)} placeholder="操作原因（必填，至少 3 个字），例如：发布并发已恢复" aria-label="重置原因" />
                    <div className={styles.actions}><button className={styles.primary} type="button" disabled={busy} onClick={() => void submitReset(provider.id)}>确认恢复预算</button><button className={styles.button} type="button" onClick={() => { setResetting(null); setReason(''); }}>取消</button></div>
                  </div>
                : <button className={styles.button} type="button" onClick={() => { setResetting(provider.id); setNotice(''); setReason(''); }}>恢复发布预算</button>}
            </div>}
          </div>
        </article>;
      })}
      {!data.providers.length && <p className={styles.kpiHint}>当前发布版本没有供应商。</p>}
    </div>}
    {data && data.channels.length > 0 && <div className={styles.providerCard}>
      <header className={styles.providerHead}><div className={styles.providerTitle}><h2>供应通道状态</h2><p className={styles.providerMeta}>连续失败 3 次进入 60 秒冷却；恢复通道会被单独探测，也可在供应商修复后手动标记已恢复。</p></div></header>
      {data.channels.map(channel => {
        const probeable = channel.state === 'cooldown' || channel.state === 'recovering' || channel.state === 'failed';
        const formKey = `channel:${channel.upstreamId}`;
        return <div className={styles.modelItem} key={channel.upstreamId}>
          <div className={styles.channelRow}>
            <span className={styles.stateBadge} data-state={CHANNEL_BADGE[channel.state] || 'stale'}>{CHANNEL_LABELS[channel.state] || channel.state}</span>
            <div className={styles.providerTitle}>
              <p className={styles.providerMeta}><strong>{channel.providerName}</strong> · <code>{channel.wireModel}</code></p>
              <p className={styles.providerMeta}>连续失败 {channel.failures}{channel.lastStatus ? ` · 最近 HTTP ${channel.lastStatus}` : ''}{channel.failureKind ? ` · ${channel.failureKind}` : ''}{channel.retryAt ? ` · 重试 ${clock(channel.retryAt)}` : ''}</p>
            </div>
            {probeable && resetting !== formKey && <button className={styles.button} type="button" onClick={() => { setResetting(formKey); setNotice(''); setReason(''); }}>标记已恢复</button>}
          </div>
          {probeable && resetting === formKey && <div className={styles.stack}>
            <input className={styles.reasonInput} value={reason} onChange={event => setReason(event.target.value)} placeholder="恢复原因（必填，至少 3 个字），例如：供应商已修复并确认恢复" aria-label="恢复原因" />
            <div className={styles.actions}><button className={styles.primary} type="button" disabled={busy} onClick={() => void submitProbe(channel.providerId, channel.upstreamId)}>确认恢复</button><button className={styles.button} type="button" onClick={() => { setResetting(null); setReason(''); }}>取消</button></div>
          </div>}
        </div>;
      })}
    </div>}
  </section>;
}
