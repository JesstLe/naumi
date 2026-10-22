"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Wallet } from 'lucide-react';
import { authHeader } from '@/lib/supabase';
import { balanceErrorMessages, type BalanceErrorCode, type BalanceMeasurement, type ProviderBalanceOverview } from '@/lib/model-config/provider-balance-contracts';
import styles from './provider-ops.module.css';

const amount = (value: number | null) => value === null ? '未记录' : value.toLocaleString('zh-CN', { maximumSignificantDigits: 15 });
const clock = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '尚未读取';
function Measurement({ value }: { value: BalanceMeasurement }) {
  return <><div className={styles.balanceRow}><strong className={styles.balanceValue}>{value.unlimited === true ? '密钥不限额' : amount(value.remaining)}</strong><span className={styles.balanceUnit}>{value.unit?.label || '单位待确认'}</span></div><dl className={styles.measurementFacts}><div><dt>累计已用</dt><dd>{amount(value.used)}</dd></div>{value.kind === 'api_key_quota' && <div><dt>总额度</dt><dd>{value.unlimited === true ? '不限额' : amount(value.total)}</dd></div>}</dl></>;
}
function MeasurementColumns({ value }: { value: BalanceMeasurement | null }) {
  return <div className={styles.balanceColumns}><section><h3>供应商余额</h3>{value?.kind === 'account_balance' ? <Measurement value={value} /> : <p className={styles.balanceUnknown}>账户资金余额未知</p>}</section><section><h3>API Key额度</h3>{value?.kind === 'api_key_quota' ? <Measurement value={value} /> : <p className={styles.balanceUnknown}>额度未记录</p>}</section></div>;
}
export function ProviderOps() {
  const [data, setData] = useState<ProviderBalanceOverview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null), sequence = useRef(0);
  const load = useCallback(async (refresh = false) => {
    const id = ++sequence.current; request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/bi/provider-ops${refresh ? '?refresh=1' : ''}`, { cache: 'no-store', headers: await authHeader(), signal: controller.signal });
      const payload = await response.json();
      if (controller.signal.aborted || sequence.current !== id) return;
      if (!response.ok) { setData(null); setError(Object.hasOwn(balanceErrorMessages, payload.code) ? balanceErrorMessages[payload.code as BalanceErrorCode] : balanceErrorMessages.PROVIDER_OPS_UNAVAILABLE); return; }
      setData(payload);
    } catch { if (!controller.signal.aborted && sequence.current === id) { setData(null); setError(balanceErrorMessages.PROVIDER_OPS_UNAVAILABLE); } }
    finally { if (!controller.signal.aborted && sequence.current === id) setBusy(false); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60_000); const focus = () => void load(); window.addEventListener('focus', focus); return () => { sequence.current++; request.current?.abort(); window.clearInterval(timer); window.removeEventListener('focus', focus); }; }, [load]);
  return <section className={styles.card} aria-label='供应商账户余额与额度' aria-busy={busy}>
    <header className={styles.header}><h2 className={styles.title}><Wallet size={17} aria-hidden />供应商账户余额与额度</h2><div className={styles.headerMeta}>{data && <span className={styles.meta}>发布版本 {data.configVersion} · 读取于 {clock(data.generatedAt)}</span>}<button className={styles.refresh} type='button' disabled={busy} onClick={() => void load(true)}><RefreshCw size={14} aria-hidden />{busy ? '刷新中…' : '刷新余额'}</button></div></header>
    <p className={styles.method}>按已发布凭据区分账户；同一密钥的供应商通道合并显示。额度不等于账户资金，单位未确认时不换算货币。</p>
    {error && <p className={styles.error} role='alert'>{error}<button className={styles.refresh} onClick={() => void load()}>重试</button></p>}
    {!data && busy && <p role='status' className={styles.empty}>正在读取供应商账户…</p>}
    {data && <div className={styles.grid}>{data.accounts.map(account => <article className={styles.providerCard} key={account.accountId} data-disabled={account.providers.every(provider => !provider.enabled)}>
      <header className={styles.providerHead}><strong className={styles.providerName}>{account.accountLabel}</strong><span className={styles.providerMeta}>{account.providers.map(provider => provider.name + (provider.enabled ? '' : '（停用）')).join('、')}</span><span className={styles.providerMeta}>{account.credentialAvailable ? '已发布凭据账户' : '当前发布凭据不可用'}</span></header>
      <MeasurementColumns value={account.status === 'ok' ? account.measurement : null} />
      {account.status !== 'ok' && <p className={styles.balanceUnknown}>{account.errorCode ? balanceErrorMessages[account.errorCode] : '余额未记录'}</p>}
      {account.status === 'error' && account.lastKnown && <div className={styles.lastKnown}><span>上次成功值（本次查询失败）</span><Measurement value={account.lastKnown.measurement} /><small>{clock(account.lastKnown.checkedAt)}</small></div>}
      <p className={styles.probeTime}>成功读取：{clock(account.checkedAt)}</p>{account.attemptedAt && account.status !== 'ok' && <p className={styles.probeTime}>本次尝试：{clock(account.attemptedAt)}</p>}
      <p className={styles.probeTime}>{account.cache.state === 'hit' ? account.cache.refreshLimited ? '使用最近缓存 · 刷新频率受限' : '缓存结果' : account.cache.state === 'fresh' ? account.cache.persisted ? '本次查询 · 缓存已保存' : '本次查询 · 缓存未保存' : '未查询上游'}{account.cache.expiresAt ? ` · 有效至 ${clock(account.cache.expiresAt)}` : ''}</p>
      {account.source && (account.source.documentationUrl ? <a className={styles.source} href={account.source.documentationUrl} target='_blank' rel='noreferrer'>{account.source.label} · 接口来源</a> : <span className={styles.probeTime}>{account.source.label} · 只读接口核验 {account.source.revision}</span>)}
    </article>)}</div>}
    {data && !data.accounts.length && <p className={styles.empty}>当前发布版本没有供应商</p>}
  </section>;
}
