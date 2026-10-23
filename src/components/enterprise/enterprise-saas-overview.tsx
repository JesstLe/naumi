"use client";

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDollarSign, Clock3, Crown, FileText, ImageIcon, RefreshCw, Users } from 'lucide-react';
import { authHeader } from '@/lib/supabase';
import type { EnterpriseSnapshot } from '@/lib/enterprise/contracts';
import type { EnterpriseCreationSummary, EnterpriseOverviewMeta } from './saas-overview-contracts';
import styles from './enterprise.module.css';

export type SaasSnapshot = EnterpriseSnapshot & { entitlement?: { name: string | null; seatLimit: number | null; featurePolicy: Record<string, boolean> }; actor: EnterpriseSnapshot['actor'] & { scopeLabel?: string } };
const number = (n: number | null | undefined) => n == null ? '未记录' : n.toLocaleString('zh-CN');
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '永久';
const statusLabel: Record<string, string> = { queued: '排队中', running: '处理中', succeeded: '已完成', partial: '部分成功', failed: '失败', cancel_requested: '申请取消', cancelled: '已取消', needs_review: '待核查' };
const stateClass = (status: string) => status === 'succeeded' ? styles.successState : status === 'failed' ? styles.failureState : status === 'needs_review' || status === 'partial' ? styles.reviewState : styles.pendingState;
const effectiveMemberCount = (snapshot: SaasSnapshot) => snapshot.members.filter(member => member.membership_status === 'active' && (!member.membership_expires_at || Date.parse(member.membership_expires_at) > Date.now()) && !member.banned && (!member.account_expires_at || Date.parse(member.account_expires_at) > Date.now())).length + (snapshot.actor.owner ? 1 : 0);

function Thumbnail({ tenantId, row }: { tenantId: string; row: EnterpriseCreationSummary['items'][number] }) {
  const [image, setImage] = useState<string | null>(null), [failed, setFailed] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    setImage(null); setFailed(false);
    if (!row.thumbnailAssetId) return;
    const controller = new AbortController(); let objectUrl = '';
    void (async () => {
      try {
        const response = await fetch(`/api/enterprise/creations/${encodeURIComponent(row.id)}/assets/${encodeURIComponent(row.thumbnailAssetId!)}?${new URLSearchParams({ tenantId })}`, { signal: controller.signal, cache: 'no-store', headers: await authHeader() });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error();
        const blob = await response.blob();
        if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setImage(objectUrl); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [tenantId, row.id, row.thumbnailAssetId, revision]);
  if (image) return <img className={styles.creationThumb} src={image} alt={row.title} loading='lazy' />;
  return <span className={styles.creationMedia}>{failed ? <button aria-label='重新读取缩略图' onClick={() => setRevision(n => n + 1)}><RefreshCw size={17} /></button> : <ImageIcon size={24} />}<small>{failed ? '读取失败' : row.thumbnailAssetId ? '加载中' : '未记录'}</small></span>;
}

export function EnterpriseEntitlement({ snapshot, onView }: { snapshot: SaasSnapshot; onView?: () => void }) {
  const entitlement = snapshot.entitlement;
  const effective = effectiveMemberCount(snapshot);
  return <article className={styles.overviewCard}>
    <header><h2>企业授权</h2>{onView && <button className={styles.textButton} onClick={onView}>查看权益<ArrowRight size={14} /></button>}</header>
    <div className={styles.entitlementRow}><span className={`${styles.metricIcon} ${styles.iconOrange}`}><Crown size={23} /></span><strong>{entitlement?.name || '未配置'}</strong><div><small>{snapshot.actor.owner ? '有效成员席位' : '当前范围成员'}</small><span>{effective} / {entitlement?.seatLimit == null ? '未限制' : entitlement.seatLimit}</span></div><div><small>有效期至</small><span>{date(snapshot.enterprise.authorized_until)}</span></div></div>
  </article>;
}

export function EnterpriseSaasOverview({ snapshot, from, to, meta, metaError, onRetryMeta, onView, onCreation, refreshRevision = 0 }: {
  refreshRevision?: number; snapshot: SaasSnapshot; from: string; to: string; meta: EnterpriseOverviewMeta | null; metaError: string; onRetryMeta: () => void;
  onView: (view: 'members' | 'roles' | 'records' | 'usage' | 'settings', filter?: { status?: string; email?: string }) => void;
  onCreation: (id: string) => void;
}) {
  const tenantId = snapshot.enterprise.id;
  const [data, setData] = useState<EnterpriseCreationSummary | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  const [email, setEmail] = useState(''), [tab, setTab] = useState('');
  const [filteredRows, setFilteredRows] = useState<EnterpriseCreationSummary['items'] | null>(null), [tabError, setTabError] = useState(''), [tabLoading, setTabLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(''); setLoading(true);
    void (async () => {
      try {
        const query = new URLSearchParams({ tenantId, from, to, user: email, page: '1', size: '20' });
        const response = await fetch(`/api/enterprise/creations?${query}`, { signal: controller.signal, cache: 'no-store', headers: await authHeader() });
        const body = await response.json(); if (!response.ok) throw new Error(body.error || '创作记录读取失败');
        if (!controller.signal.aborted) setData(body);
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '创作记录读取失败'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [tenantId, from, to, email, reload, refreshRevision]);
  useEffect(() => {
    setFilteredRows(null); setTabError(''); setTabLoading(false); if (!tab) return;
    const controller = new AbortController(); setTabLoading(true);
    // Fetch each exact state in a bounded page; do not filter only the first page
    // and claim that older matching records do not exist.
    const states = tab === 'pending' ? ['queued', 'running', 'cancel_requested'] : [tab];
    void Promise.all(states.map(async status => {
      const query = new URLSearchParams({ tenantId, from, to, user: email, status, page: '1', size: '5' });
      const response = await fetch(`/api/enterprise/creations?${query}`, { signal: controller.signal, cache: 'no-store', headers: await authHeader() });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || '创作记录读取失败'); return (body as EnterpriseCreationSummary).items;
    })).then(groups => { if (!controller.signal.aborted) setFilteredRows(groups.flat().sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt) || b.id.localeCompare(a.id)).slice(0, 5)); })
      .catch(reason => { if (!controller.signal.aborted) setTabError(reason.message); }).finally(() => { if (!controller.signal.aborted) setTabLoading(false); });
    return () => controller.abort();
  }, [tenantId, from, to, email, tab, reload, refreshRevision]);
  const rows = (tab ? filteredRows : data?.items)?.slice(0, 5) || [];
  const summary = data?.summary;
  const effective = meta?.members.effective ?? effectiveMemberCount(snapshot);
  const usages = data?.memberUsage.slice(0, 4) || [], maxUsage = Math.max(1, ...usages.map(row => row.settledCredits));
  return <div className={styles.saasOverview}>
    <div className={styles.overviewMetrics}>
      {[{ label: '成员', value: effective, icon: Users, tone: styles.iconBlue, sub: snapshot.actor.owner ? '本企业有效身份' : '当前有效下级及本人' }, { label: '期间活跃', value: summary?.activeMembers, icon: Users, tone: styles.iconGreen, sub: '已接受企业创作的成员' }, { label: '期间创作', value: summary?.total, icon: FileText, tone: styles.iconPurple, sub: '已确认企业归属' }, { label: '期间已结算', value: summary?.settledCredits, icon: CircleDollarSign, tone: styles.iconOrange, sub: '实际扣款账户结算积分' }].map(item => <article className={styles.overviewMetric} key={item.label}><span className={`${styles.metricIcon} ${item.tone}`}><item.icon size={25} /></span><div><span>{item.label}</span><strong>{loading && item.label !== '成员' ? '—' : number(item.value)}</strong><small>{item.sub}</small></div></article>)}
    </div>
    <div className={styles.overviewColumns}>
      <article className={`${styles.overviewCard} ${styles.recentCard}`}>
        <header><h2>最近创作</h2><div><select aria-label='近期创作成员' value={email} onChange={e => setEmail(e.target.value)}><option value=''>全部可见成员</option>{snapshot.actor.owner && <option value={snapshot.enterprise.owner_email}>企业所有者</option>}{snapshot.members.map(m => <option key={m.email} value={m.email}>{m.name || m.email}</option>)}</select><button className={styles.textButton} onClick={() => onView('records', { email })}>查看全部<ArrowRight size={14} /></button></div></header>
        <div className={styles.overviewTabs} role='tablist' aria-label='近期创作状态'>{[['', `全部${summary ? ` (${summary.total})` : ''}`], ['pending', `处理中${summary ? ` (${summary.pending})` : ''}`], ['failed', `失败${summary ? ` (${summary.failed})` : ''}`]].map(([value, label]) => <button key={value} role='tab' aria-selected={tab === value} className={tab === value ? styles.selectedTab : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
        {error || tabError ? <div className={styles.sectionError} role='alert'><span>{error || tabError}</span><button onClick={() => setReload(n => n + 1)}>重试</button></div> : loading || tabLoading ? <div className={styles.overviewEmpty} role='status'>正在读取企业创作…</div> : <><div className={styles.recentTableWrap}><table className={styles.recentTable}><thead><tr><th>作品</th><th>创作信息</th><th>状态</th><th>结算积分</th><th>时间</th><th>操作</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><Thumbnail tenantId={tenantId} row={row} /></td><td><strong title={row.title}>{row.title}</strong><small title={row.actorEmail}>{row.actorName || row.actorEmail}</small></td><td><span className={`${styles.creationState} ${stateClass(row.status)}`}>{statusLabel[row.status] || '待核查'}</span></td><td>{row.settledCredits == null ? ['queued', 'running'].includes(row.status) ? '待结算' : '未记录' : `${number(row.settledCredits)} 积分`}</td><td>{new Date(row.acceptedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td><button onClick={() => onCreation(row.id)}>查看</button></td></tr>)}</tbody></table></div>{!rows.length && <div className={styles.overviewEmpty}>此范围暂无{tab === 'failed' ? '失败' : tab === 'pending' ? '处理中的' : '已确认企业归属的'}创作</div>}</>}
      </article>
      <aside className={styles.overviewAside}>
        <article className={styles.overviewCard}><header><h2>成员用量</h2><span className={styles.cardPeriod}>期间实扣积分</span></header>{error ? <p className={styles.hint}>用量暂不可读取</p> : usages.length ? <div className={styles.memberUsage}>{usages.map(row => <button key={row.email} onClick={() => onView('records', { email: row.email })}><span className={styles.avatar}><Users size={15} /></span><span title={row.email}>{row.name || row.email}</span><meter min={0} max={maxUsage} value={row.settledCredits} aria-label={`${row.name || row.email} 已结算积分`} /><strong>{number(row.settledCredits)}</strong></button>)}</div> : <div className={styles.smallEmpty}>{loading ? '读取中…' : '暂无已结算记录'}</div>}</article>
        <EnterpriseEntitlement snapshot={snapshot} onView={() => onView('usage')} />
        <article className={styles.overviewCard}><header><h2>待处理</h2></header><div className={styles.todoList}><div><span className={`${styles.smallIcon} ${styles.iconRed}`}><AlertTriangle size={19} /></span><span>失败创作</span><strong>{summary?.failed ?? '—'}</strong><button onClick={() => onView('records', { status: 'failed' })}>查看</button></div><div><span className={`${styles.smallIcon} ${styles.iconOrange}`}><Clock3 size={19} /></span><span>创作待核查</span><strong>{summary?.needsReview ?? '—'}</strong><button onClick={() => onView('records', { status: 'needs_review' })}>查看</button></div></div></article>
      </aside>
    </div>
    <article className={styles.overviewCard}><header><h2>管理动态</h2>{meta && <small className={styles.cardPeriod}>更新于 {new Date(meta.generatedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })}</small>}</header>{metaError ? <div className={styles.sectionError} role='alert'><span>{metaError}</span><button onClick={onRetryMeta}>重试</button></div> : meta?.activities.length ? <div className={styles.activityList}>{meta.activities.slice(0, 4).map(item => <div key={item.id}><time>{new Date(item.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time><span className={styles.avatar}><CheckCircle2 size={16} /></span><strong title={item.actor}>{snapshot.members.find(m => m.email === item.actor)?.name || '企业管理者'}</strong><span>{item.action}</span>{item.target && <small title={item.target}>{snapshot.members.find(m => m.email === item.target)?.name || (item.target === tenantId ? snapshot.enterprise.name : '企业成员')}</small>}</div>)}</div> : <div className={styles.smallEmpty}>{meta ? '暂无管理动态' : '读取中…'}</div>}</article>
  </div>;
}
