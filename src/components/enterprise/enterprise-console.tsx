"use client";

import {WORKFLOW_PERMISSIONS,DEFAULT_WORKFLOW_PERMISSIONS,WORKFLOW_PERMISSION_LABELS,type WorkflowPermission} from '@/lib/enterprise/workflow-permissions';
import { useSiteProfile } from '@/lib/site-control/client';
import { EnterpriseHealthPanel } from './enterprise-health';
import { TenantUsagePanel } from '@/components/saas/tenant-usage-panel';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, Building2, ChevronDown, CircleUserRound, Eye, FileText, HeartPulse, LayoutDashboard, Menu, Plus, RefreshCw, Settings, ShieldCheck, Users, X } from 'lucide-react';
import {ACCESS_FEATURES} from '@/lib/feature-access/catalog';
import { useAuth } from '@/lib/auth-context';
import { authHeader } from '@/lib/supabase';
import { USERNAME_DOMAIN } from '@/lib/account-identity';
import type { EnterpriseIdentity, EnterpriseMember, EnterpriseRole, EnterpriseSnapshot } from '@/lib/enterprise/contracts';
import { presetDates } from '@/lib/enterprise/analytics-contracts';
import { CreationBrowser } from '@/components/saas/creation-browser';
import { EnterpriseArtworks } from './enterprise-artworks';
import { EnterpriseAnalyticsPanel } from './enterprise-analytics';
import { EnterpriseEntitlement, EnterpriseSaasOverview, type SaasSnapshot } from './enterprise-saas-overview';
import type { EnterpriseOverviewMeta } from './saas-overview-contracts';
import styles from './enterprise.module.css';

type View = 'overview' | 'members' | 'roles' | 'records' | 'usage' | 'settings' | 'health';
type LegacySection = 'confirmed' | 'artworks' | 'tasks';
type Member = EnterpriseMember & { membership_status?: 'active' | 'suspended'; membership_expires_at?: string | null };
type Editor = { kind: 'organization' | 'expiry'; member: Member } | { kind: 'role'; role: EnterpriseRole | null } | null;
type InitialQuery = { recordView?:string; creationId?:string; tenantId?: string; enterpriseId?: string; view?: string; from?: string; to?: string; email?: string; user?: string };
const identity = (email: string) => email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, email.lastIndexOf('@')) : email;
const datetime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '永久';
const inputDate = (value: string | null | undefined) => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const validView = (value?: string): View => ['overview', 'members', 'roles', 'records', 'usage', 'settings', 'health'].includes(value || '') ? value as View : 'overview';
const validDate = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init, headers: { ...(await authHeader()), ...init?.headers } });
  const body = await response.json(); if (!response.ok) throw new Error(body.error || '读取失败'); return body;
}

export function EnterpriseConsole({ initialQuery = {} }: { initialQuery?: InitialQuery }) {
  const site=useSiteProfile(), dedicated=site.mode==='enterprise';
  const { user, ready } = useAuth(), email = user?.email || 'console';
  const [entry, setEntry] = useState<{ email: string; enterprises: EnterpriseIdentity[] } | null>(null), [error, setError] = useState('');
  useEffect(() => {
    setEntry(null); setError(''); if (!ready) return;
    const controller = new AbortController(); let sequence = 0;
    const check = async () => {
      const n = ++sequence;
      try { const result = await json<{ enterprises: EnterpriseIdentity[] }>('/api/enterprise', { signal: controller.signal }); if (!controller.signal.aborted && n === sequence) setEntry({ email, enterprises: result.enterprises }); }
      catch (reason) { if (!controller.signal.aborted && n === sequence) { setEntry({ email, enterprises: [] }); setError((reason as Error).message); } }
    };
    void check(); const timer = window.setInterval(check, 30_000); window.addEventListener('focus', check);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', check); };
  }, [email, ready]);
  if (!entry || entry.email !== email) return <main className={styles.page}><div className={styles.empty} role='status'>{dedicated?'正在加载…':'加载企业身份…'}</div></main>;
  if (!entry.enterprises.length) return <main className={styles.page}><section className={styles.empty}><Building2 size={28} /><p>{error || (dedicated?'当前账号没有管理权限':'当前账号没有企业管理权限')}</p>{!user?.email&&<a href={`/sign-in?redirect=${encodeURIComponent(typeof window==='undefined'?'/enterprise':window.location.pathname+window.location.search+window.location.hash)}`}>登录</a>}<a href='/dashboard'>返回创作工作台</a></section></main>;
  const requested = initialQuery.tenantId || initialQuery.enterpriseId;
  if (requested && !entry.enterprises.some(enterprise => enterprise.id === requested)) return <main className={styles.page}><section className={styles.empty}><Building2 size={28} /><p>没有此管理范围的访问权限</p><a href={dedicated?'/admin':'/enterprise'}>返回管理后台</a></section></main>;
  return <Workspace key={email} enterprises={entry.enterprises} initialQuery={initialQuery} email={email} />;
}

function Workspace({ enterprises, initialQuery, email }: { enterprises: EnterpriseIdentity[]; initialQuery: InitialQuery; email: string }) {
  const site = useSiteProfile(), dedicated = site.mode === 'enterprise';
  const {user:sessionUser}=useAuth();
  const requestedId = initialQuery.tenantId || initialQuery.enterpriseId;
  const [enterpriseId, setEnterpriseId] = useState(enterprises.some(t => t.id === requestedId) ? requestedId! : enterprises[0].id);
  const [data, setData] = useState<SaasSnapshot | null>(null), [view, setView] = useState<View>(validView(initialQuery.view));
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [mobileOpen, setMobileOpen] = useState(false);
  const [selected, setSelected] = useState(initialQuery.user || initialQuery.email || ''), [section, setSection] = useState<LegacySection>(()=>['confirmed','artworks','tasks'].includes(initialQuery.recordView||'')?initialQuery.recordView as LegacySection:initialQuery.creationId?.startsWith('cr-')?'confirmed':dedicated?'tasks':'confirmed');
  const dates = presetDates('last7');
  const [range, setRange] = useState({ from: validDate(initialQuery.from) ? initialQuery.from! : dates.from, to: validDate(initialQuery.to) ? initialQuery.to! : dates.to });
  const [dateOpen, setDateOpen] = useState(false), [draftRange, setDraftRange] = useState(range);
  const [meta, setMeta] = useState<EnterpriseOverviewMeta | null>(null), [metaError, setMetaError] = useState(''), [metaRevision, setMetaRevision] = useState(0);
  const [editor, setEditor] = useState<Editor>(null), [expiry, setExpiry] = useState('');
  const [roleId, setRoleId] = useState(''), [supervisor, setSupervisor] = useState(''), [employment, setEmployment] = useState<'permanent' | 'intern'>('permanent');
  const [workflowPermissions,setWorkflowPermissions]=useState<WorkflowPermission[]>(DEFAULT_WORKFLOW_PERMISSIONS);
  const [roleName, setRoleName] = useState(''), [level, setLevel] = useState(100), [manageMembers, setManageMembers] = useState(false), [viewRecords, setViewRecords] = useState(false);
  const command = useRef<{ payload: string; id: string } | null>(null), newRoleId = useRef(''), sequence = useRef(0), scopeAbort = useRef<AbortController | null>(null), mutationAbort = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLElement | null>(null), activeEnterprise = useRef(enterpriseId), initialLoad = useRef(true);
  activeEnterprise.current = enterpriseId;
  const updateUrl = useCallback((updates: Record<string, string | undefined>, push = false) => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(updates)) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    window.history[push ? 'pushState' : 'replaceState']({}, '', url.pathname + url.search);
  }, []);
  const navigate = (next: View, filters?: { status?: string; email?: string }) => {
    if (editor && !window.confirm('放弃尚未保存的修改？')) return;
    setEditor(null); setView(next); setMobileOpen(false); setNotice('');
    if (next === 'records') { setSection(dedicated?'tasks':'confirmed'); setSelected(filters?.email || ''); }
    updateUrl({ view: next, status: filters?.status, email: undefined, user: filters?.email, creationId: undefined, page: '1',recordView:next==='records'?(dedicated?'tasks':'confirmed'):undefined,...(next==='records'?{from:undefined,to:undefined,period:undefined,source:undefined}:{}) }, true);
  };
  const changeEnterprise = (id: string) => {
    if (!enterprises.some(t => t.id === id) || pending || (editor && !window.confirm('放弃尚未保存的修改并切换企业？'))) return;
    setData(null); setMeta(null); setEditor(null); setSelected(''); setNotice(''); setError(''); setSection('confirmed'); setView('overview'); setEnterpriseId(id); setMobileOpen(false);
    updateUrl({ tenantId: id, enterpriseId: undefined, view: 'overview', email: undefined, user: undefined, creationId: undefined, status: undefined, page: undefined }, true);
  };
  useEffect(() => { updateUrl({ tenantId:dedicated?undefined:enterpriseId,enterpriseId:undefined,view,...(['overview','usage'].includes(view)?{from:range.from,to:range.to}:{}) }); }, [dedicated,enterpriseId,view,range,updateUrl]);
  useEffect(() => {
    const back = () => {
      const query = new URLSearchParams(window.location.search), id = query.get('tenantId');
      if (id && enterprises.some(t => t.id === id) && id !== activeEnterprise.current) { setData(null); setMeta(null); setEditor(null); setEnterpriseId(id); }
      setView(validView(query.get('view') || undefined)); setSelected(query.get('user')||query.get('email')||''); setSection(['confirmed','artworks','tasks'].includes(query.get('recordView')||'')?query.get('recordView') as LegacySection:dedicated?'tasks':'confirmed');
      if (validDate(query.get('from') || undefined) && validDate(query.get('to') || undefined)) setRange({ from: query.get('from')!, to: query.get('to')! });
    };
    window.addEventListener('popstate', back); return () => window.removeEventListener('popstate', back);
  }, [enterprises,dedicated]);
  useEffect(() => { if (!editor) return; const previous = document.activeElement as HTMLElement | null; dialog.current?.querySelector<HTMLElement>('input,select,button')?.focus(); return () => previous?.focus(); }, [editor]);
  const load = useCallback(async () => {
    const n = ++sequence.current; scopeAbort.current?.abort(); const controller = new AbortController(); scopeAbort.current = controller; setLoading(true); setError('');
    try {
      const result = await json<EnterpriseSnapshot>(`/api/enterprise?${new URLSearchParams({ enterpriseId })}`, { signal: controller.signal });
      if (n !== sequence.current || controller.signal.aborted || activeEnterprise.current !== enterpriseId) return;
      setData(result); setSelected(old => result.actor.owner && old === result.enterprise.owner_email || result.members.some(m => m.email === old) ? old : '');
    } catch (reason) { if (n === sequence.current && !controller.signal.aborted) { setError((reason as Error).message); setData(null); setMeta(null); setEditor(null); } }
    finally { if (n === sequence.current && !controller.signal.aborted) setLoading(false); }
  }, [enterpriseId]);
  useEffect(() => {
    setData(null); setMeta(null); setEditor(null); setPending(false); command.current = null; mutationAbort.current?.abort();
    if (!initialLoad.current) { setSelected(''); } initialLoad.current = false;
    void load(); return () => { sequence.current++; scopeAbort.current?.abort(); mutationAbort.current?.abort(); };
  }, [load]);
  useEffect(() => { const check = () => void load(); const timer = window.setInterval(check, 30_000); window.addEventListener('focus', check); return () => { window.clearInterval(timer); window.removeEventListener('focus', check); }; }, [load]);
  useEffect(() => { if (!enterprises.some(t => t.id === enterpriseId)) { setData(null); setMeta(null); setEnterpriseId(enterprises[0].id); setView('overview'); } }, [enterprises, enterpriseId]);
  const scopeKey = data ? JSON.stringify([data.enterprise, data.actor, data.members.map(m => [m.email, m.version, m.membership_status, m.membership_expires_at, m.banned, m.account_expires_at]), data.roles]) : '';
  useEffect(() => {
    setMeta(null); setMetaError(''); if (!data?.actor.viewRecords) return;
    const controller = new AbortController();
    void json<EnterpriseOverviewMeta>(`/api/enterprise/saas-overview?${new URLSearchParams({ tenantId: enterpriseId })}`, { signal: controller.signal }).then(result => { if (!controller.signal.aborted && activeEnterprise.current === enterpriseId) setMeta(result); }).catch(reason => { if (!controller.signal.aborted) setMetaError(reason.message); });
    return () => controller.abort();
  }, [enterpriseId, scopeKey, metaRevision, data?.actor.viewRecords]);
  async function mutate(body: Record<string, unknown>) {
    if (pending) return; const payload = JSON.stringify(body); if (command.current?.payload !== payload) command.current = { payload, id: crypto.randomUUID() };
    const id = enterpriseId, controller = new AbortController(); mutationAbort.current = controller; setPending(true); setError(''); setNotice('');
    try {
      await json('/api/enterprise', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ ...body, id: command.current!.id }) });
      if (controller.signal.aborted || activeEnterprise.current !== id) return;
      command.current = null; setEditor(null); setNotice('已保存'); await load();
    } catch (reason) { if (!controller.signal.aborted && activeEnterprise.current === id) setError((reason as Error).message); }
    finally { if (!controller.signal.aborted && activeEnterprise.current === id) setPending(false); }
  }
  const body = (member: EnterpriseMember) => ({ enterpriseId, email: member.email, expectedVersion: member.version, expectedUserVersion: member.management_version });
  const editorDirty=useRef(false);
  const closeEditor=()=>{if(!pending&&(!editorDirty.current||window.confirm('有未保存的修改，确定放弃并关闭？')))setEditor(null);};
  const edit = (kind: 'organization' | 'expiry', member: Member) => { editorDirty.current=false;setEditor({ kind, member }); setExpiry(inputDate(member.membership_expires_at)); setEmployment(member.employment); setRoleId(member.role_id || ''); setSupervisor(member.supervisor_email); setError(''); };
  const editRole = (role: EnterpriseRole | null) => { editorDirty.current=false;newRoleId.current = role?.id || crypto.randomUUID(); setEditor({ kind: 'role', role }); setRoleName(role?.name || ''); setLevel(role?.level || 100); setManageMembers(role?.manage_members || false); setViewRecords(role?.view_records || false);setWorkflowPermissions(role?.workflow_permissions??DEFAULT_WORKFLOW_PERMISSIONS); setError(''); };
  const label = (value: string) => data?.members.find(member => member.email === value)?.name || identity(value);
  const status = (member: Member) => member.membership_status === 'suspended' ? '已暂停' : member.membership_expires_at && Date.parse(member.membership_expires_at) <= Date.now() ? '身份到期' : '正常';
  const nav = [{ id: 'overview' as View, label: dedicated?'管理概览':'企业概览', icon: LayoutDashboard }, { id: 'members' as View, label: '组织与成员', icon: Users }, ...(data?.actor.owner ? [{ id: 'roles' as View, label: '岗位与权限', icon: ShieldCheck }] : []), ...(data?.actor.viewRecords ? [{ id: 'records' as View, label: '创作记录', icon: FileText }, { id: 'usage' as View, label: '额度与用量', icon: BarChart3 }] : []), ...(data?.actor.manageMembers?[{id:'health' as View,label:'运行健康',icon:HeartPulse}]:[]), { id: 'settings' as View, label:dedicated?'系统设置':'企业设置', icon: Settings }];
  const title = nav.find(item => item.id === view)?.label || '企业概览', currentEnterprise = enterprises.find(t => t.id === enterpriseId) || enterprises[0];
  return <main className={styles.page} data-testid='enterprise-console'>
    <header className={styles.mobileHeader}><strong>{site.mode === 'enterprise' ? site.policy.brand : 'Naumi'} · 企业管理</strong><button type='button' aria-controls='enterprise-navigation' aria-expanded={mobileOpen} aria-label={mobileOpen ? '收起企业导航' : '展开企业导航'} onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={23} /> : <Menu size={23} />}</button></header>
    <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`} id='enterprise-navigation'>
      <div className={styles.brand}><span>{site.mode === 'enterprise' ? site.policy.brand : 'Naumi'}<small>{dedicated?'管理后台':'企业管理'}</small></span></div>
      {!dedicated && <label className={styles.tenantPicker}><Building2 size={20} /><select aria-label='当前企业' value={enterpriseId} disabled={pending} onChange={e => changeEnterprise(e.target.value)}>{enterprises.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select><ChevronDown size={15} /></label>}
      <nav aria-label='企业管理导航'>{nav.map(item => <button key={item.id} className={view === item.id ? styles.active : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={20} />{item.label}</button>)}</nav>
      <div className={styles.sideFoot}><a href='/dashboard'><ArrowLeft size={17} />返回创作工作台</a><a href={dedicated ? '/enterprise' : `/enterprise/workflow?${new URLSearchParams({ enterpriseId })}`}><Building2 size={17} />{dedicated?'协作工作台':'企业协作工作台'}</a><div className={styles.sideIdentity}><CircleUserRound size={33} /><span><strong title={email}>{sessionUser?.name||identity(email)}</strong><small>{data?.actor.owner ? '超级管理员' : (dedicated?'管理岗位':'企业管理岗位')}</small></span></div></div>
    </aside>
    <section className={styles.workspace}><div className={styles.topbar}><span>{currentEnterprise.name}<span aria-hidden='true'> / </span>{title}</span><span className={styles.topbarIdentity}><CircleUserRound size={26} />{data?.actor.owner ? '超级管理员' : '管理者'}</span></div><div className={styles.main}>
      <header className={styles.header}><div><div className={styles.titleRow}><h1>{title}</h1>{['overview', 'usage'].includes(view) && <button className={styles.dateButton} aria-expanded={dateOpen} onClick={() => { setDraftRange(range); setDateOpen(!dateOpen); }}>{range.from.replaceAll('-', '.')} — {range.to.replaceAll('-', '.')}<ChevronDown size={15} /></button>}</div><span className={styles.context}>{dedicated?(data?.actor.owner?'':'下属成员'):('当前范围：'+(data?.actor.scopeLabel||(data?.actor.owner?'本企业':'当前下级')))}{!dedicated&&<span>{data?.entitlement?.name || '权益未配置'}</span>}</span></div><div className={styles.actions}>{view === 'overview' && data?.actor.manageMembers && <button className={styles.primary} onClick={() => navigate('members')}><Users size={16} />管理成员</button>}<button aria-label='刷新数据' disabled={loading || pending} onClick={() => { setMetaRevision(n => n + 1); void load(); }}><RefreshCw size={16} /></button></div></header>
      {dateOpen && <form className={styles.dateFilter} onSubmit={event => { event.preventDefault(); if (draftRange.from <= draftRange.to && Date.parse(draftRange.to) - Date.parse(draftRange.from) <= 365 * 86400000) { setRange(draftRange); setDateOpen(false); } else setError('请选择不超过一年的有效日期范围'); }}><label>开始日期<input type='date' required value={draftRange.from} onChange={e => setDraftRange(old => ({ ...old, from: e.target.value }))} /></label><label>结束日期<input type='date' required min={draftRange.from} value={draftRange.to} onChange={e => setDraftRange(old => ({ ...old, to: e.target.value }))} /></label><button type='submit' className={styles.primary}>应用</button><button type='button' onClick={() => setDateOpen(false)}>取消</button></form>}
      {error && <p className={styles.error} role='alert'>{error}</p>}{notice && <p className={styles.notice} role='status'>{notice}</p>}
      {loading && !data ? <div className={styles.empty} role='status'>加载企业数据…</div> : !data ? <div className={styles.empty}>企业数据暂不可读取<button onClick={() => void load()}>重试</button></div> : <>
        {view === 'overview' && (data.actor.viewRecords ? <EnterpriseSaasOverview dedicated={dedicated} key={scopeKey} refreshRevision={metaRevision} snapshot={data} from={range.from} to={range.to} meta={meta} metaError={metaError} onRetryMeta={() => setMetaRevision(n => n + 1)} onView={navigate} onCreation={id => { navigate('records');setSection('confirmed');updateUrl({ creationId:id,recordView:'confirmed' }); }} /> : <div className={styles.empty}>当前岗位未开放创作数据查看权限<button onClick={() => navigate('members')}>查看组织成员</button></div>)}
        {view === 'members' && <div className={styles.pane}><div className={styles.tableWrap}><table><thead><tr><th>成员 / 账号</th><th>岗位 / 级别</th><th>直属上级</th><th>用工 / 访问期限</th><th>成员状态 / 账号</th><th>操作</th></tr></thead><tbody>{data.members.map((member: Member) => <tr key={member.email}><td><strong>{member.name || identity(member.email)}</strong><small title={member.email}>{identity(member.email)}</small></td><td>{member.role_name}<small>{member.level === 999 ? '基础成员' : `L${member.level}`}</small></td><td>{label(member.supervisor_email)}</td><td>{member.employment === 'permanent' ? '正式员工' : '实习生'}<small>{datetime(member.membership_expires_at)}</small></td><td><span className={`${styles.badge} ${status(member) !== '正常' ? styles.inactive : ''}`}>{status(member)}</span><small>{member.banned ? '账号已封禁' : member.account_expires_at && Date.parse(member.account_expires_at) <= Date.now() ? '账号已到期' : '账号正常'}</small></td><td><div className={styles.rowActions}>{data.actor.viewRecords && <button onClick={() => navigate('records', { email: member.email })}><Eye size={14} />创作</button>}{member.canManage && <>{data.actor.owner && <button disabled={pending} onClick={() => edit('organization', member)}>岗位与上级</button>}<button disabled={pending} onClick={() => edit('expiry', member)}>身份期限</button><button disabled={pending} onClick={() => { if (window.confirm(`${member.membership_status === 'suspended' ? '恢复' : '暂停'} ${member.name || identity(member.email)} 的管理与创作访问权限？`)) void mutate({ ...body(member), action: 'status', banned: member.membership_status !== 'suspended' }); }}>{member.membership_status === 'suspended' ? '恢复身份' : '暂停身份'}</button></>}</div></td></tr>)}</tbody></table>{!data.members.length && <div className={styles.empty}>当前范围暂无成员</div>}</div></div>}
        {view === 'roles' && (data.actor.owner ? <div className={styles.pane}><div className={styles.sectionHead}><h2>岗位与权限</h2><button className={styles.primary} onClick={() => editRole(null)}><Plus size={15} />新增岗位</button></div><div className={styles.roleGrid}>{data.roles.map(role => <article className={styles.roleCard} key={role.id}><header><ShieldCheck size={18} /><h3>{role.name}</h3><span>L{role.level}</span></header><div className={styles.capabilities}><span>{role.manage_members ? '管理下属成员' : '无成员管理权限'}</span><span>{role.view_records ? '查看下属成员的创作记录' : '无创作查看权限'}</span></div><footer><span>{data.members.filter(member => member.role_id === role.id).length} 位成员</span><button disabled={pending} onClick={() => editRole(role)}>编辑</button></footer></article>)}</div>{!data.roles.length && <div className={styles.empty}>尚未配置管理岗位</div>}</div> : <div className={styles.empty}>岗位与权限由超级管理员管理</div>)}
        {view === 'records' && data.actor.viewRecords && <div className={styles.pane}><div className={styles.recordViewTabs}>{([['tasks','生成记录'],['artworks','图片作品'],['confirmed','创作详情']] as const).map(([id,label])=><button key={id} className={section===id?styles.selectedTab:''} onClick={()=>{setSection(id);updateUrl({recordView:id,creationId:undefined,page:'1',source:undefined,period:undefined,from:undefined,to:undefined});}}>{label}</button>)}</div>{section==='artworks'?<EnterpriseArtworks key={scopeKey+selected} snapshot={data} initialEmail={selected} dedicated={dedicated}/>:<CreationBrowser key={scopeKey+section} tenantId={enterpriseId} enterprise historySource={section==='tasks'?'legacy':''}/>}</div>}
        {view==='health'&&data.actor.manageMembers&&<EnterpriseHealthPanel enterpriseId={enterpriseId}/>}
        {view === 'usage' && data.actor.viewRecords && <div className={styles.pane}>{!dedicated && <EnterpriseEntitlement snapshot={data} />}<TenantUsagePanel key={scopeKey} tenantId={enterpriseId} enterprise refreshRevision={metaRevision} selectedPeriod={range} />{!dedicated&&<section className={styles.overviewCard}><h2>功能权益</h2>{data.entitlement && Object.keys(data.entitlement.featurePolicy).length ? <dl className={styles.settingsList}>{Object.entries(data.entitlement.featurePolicy).map(([feature, allowed]) => <div key={feature}><dt>{ACCESS_FEATURES.find(item=>item.id===feature)?.label||'历史权益配置'}</dt><dd>{allowed ? '已开放' : '已关闭'}</dd></div>)}</dl> : <p className={styles.hint}>尚未配置独立功能权益，按现有账户权限执行。</p>}</section>}<details className={styles.legacyUsage}><summary>成员历史用量</summary>{!dedicated&&<p className={styles.legacyNotice}>以下为当前可见成员的个人账户历史，企业归属未确认；可用积分来自成员账户，不是企业钱包。</p>}<EnterpriseAnalyticsPanel key={scopeKey} snapshot={data} onMember={memberEmail => navigate('records', { email: memberEmail })} /></details></div>}
        {view === 'settings' && <EnterpriseSettings dedicated={dedicated} key={enterpriseId} snapshot={data} meta={meta} metaError={metaError} onSaved={() => { setMetaRevision(n => n + 1); void load(); }} />}
      </>}
    </div></section>
    {editor && data && <div className={styles.overlay} onKeyDown={event => {
      if (event.key === 'Escape' && !pending) closeEditor();
      if (event.key === 'Tab') { const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)') || []), first = items[0], last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    }}><section ref={dialog} className={styles.dialog} role='dialog' aria-modal='true' aria-labelledby='enterprise-editor-title'><div className={styles.dialogHead}><h2 id='enterprise-editor-title'>{editor.kind === 'role' ? '岗位设置' : editor.kind === 'organization' ? '岗位与直属上级' : '访问期限'}</h2><button aria-label='关闭编辑' disabled={pending} onClick={closeEditor}><X size={18} /></button></div><form onChangeCapture={()=>{editorDirty.current=true;}} onSubmit={event => {
      event.preventDefault();
      if (editor.kind === 'role') void mutate({ enterpriseId, action: 'role', roleId: editor.role?.id || newRoleId.current, expectedVersion: editor.role?.version ?? null, name: roleName, level, manageMembers, viewRecords, workflowPermissions });
      else if (editor.kind === 'expiry') void mutate({ ...body(editor.member), action: 'expiry', expiresAt: expiry ? new Date(expiry).toISOString() : null });
      else void mutate({ ...body(editor.member), action: 'organization', roleId: roleId || null, supervisorEmail: supervisor, employment, expiresAt: employment==='permanent'?null:expiry ? new Date(expiry).toISOString() : null });
    }}>{editor.kind === 'role' ? <><label>岗位名称<input required maxLength={60} value={roleName} onChange={e => setRoleName(e.target.value)} /></label><label>权限级别<input type='number' required min={1} max={998} value={level} onChange={e => setLevel(Number(e.target.value))} /><small>数字越小级别越高；超级管理员为最高级</small></label><label className={styles.check}><input type='checkbox' checked={manageMembers} onChange={e => setManageMembers(e.target.checked)} />管理下属成员</label><label className={styles.check}><input type='checkbox' checked={viewRecords} onChange={e => setViewRecords(e.target.checked)} />查看下属成员的创作记录</label><fieldset><legend>协作权限</legend>{WORKFLOW_PERMISSIONS.map(permission=><label key={permission} className={styles.check}><input type='checkbox' checked={workflowPermissions.includes(permission)} onChange={e=>setWorkflowPermissions(e.target.checked?[...workflowPermissions,permission]:workflowPermissions.filter(p=>p!==permission))}/>{WORKFLOW_PERMISSION_LABELS[permission]}</label>)}</fieldset><p className={styles.hint}>影响 {editor.role ? data.members.filter(member => member.role_id === editor.role!.id).length : 0} 位当前成员；保存后新请求立即按新权限核验。</p></> : <><p>{editor.member.name || identity(editor.member.email)}</p>{editor.kind === 'organization' && <><label>岗位<select value={roleId} onChange={e => setRoleId(e.target.value)}><option value=''>基础成员</option>{data.roles.map(role => <option key={role.id} value={role.id}>{role.name} · L{role.level}</option>)}</select></label><label>直属上级<select value={supervisor} onChange={e => setSupervisor(e.target.value)}><option value={data.enterprise.owner_email}>{identity(data.enterprise.owner_email)}（超级管理员）</option>{data.members.filter(member => member.email !== editor.member.email && data.roles.some(role => role.id === member.role_id && role.manage_members)).map(member => <option key={member.email} value={member.email}>{member.name} · {member.role_name}</option>)}</select></label><label>用工类型<select value={employment} onChange={e => setEmployment(e.target.value as typeof employment)}><option value='permanent'>正式员工</option><option value='intern'>实习生</option></select></label></>}<label>访问截止时间<input type='datetime-local' value={expiry} onChange={e => setExpiry(e.target.value)} /><small>留空表示永久。</small></label></>}{error && <p role='alert' className={styles.error}>{error}</p>}<div className={styles.dialogActions}><button type='button' disabled={pending} onClick={closeEditor}>取消</button><button type='submit' className={styles.primary} disabled={pending}>{pending ? '保存中…' : '保存'}</button></div></form></section></div>}
  </main>;
}

function EnterpriseSettings({ snapshot, meta, metaError, onSaved, dedicated }: { dedicated: boolean; snapshot: SaasSnapshot; meta: EnterpriseOverviewMeta | null; metaError: string; onSaved: () => void }) {
  const [name, setName] = useState(snapshot.enterprise.name), [preview, setPreview] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const command = useRef<{ payload: string; id: string } | null>(null), abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const save = async () => {
    if (!meta || pending) return;
    const payload = JSON.stringify({ tenantId: snapshot.enterprise.id, expectedVersion: meta.version, name: name.trim() });
    if (command.current?.payload !== payload) command.current = { payload, id: crypto.randomUUID() };
    const controller = new AbortController(); abort.current = controller; setPending(true); setError(''); setNotice('');
    try { await json('/api/enterprise/saas-overview', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ ...JSON.parse(payload), commandId: command.current.id }) }); if (!controller.signal.aborted) { command.current = null; setPreview(false); setNotice('企业名称已保存'); onSaved(); } }
    catch (reason) { if (!controller.signal.aborted) setError((reason as Error).message); }
    finally { if (!controller.signal.aborted) setPending(false); }
  };
  return <section className={`${styles.overviewCard} ${styles.settingsCard}`}><header><h2>{dedicated?'公司资料':'企业资料'}</h2></header><dl className={styles.settingsList}>{!dedicated && <div><dt>企业编号</dt><dd><code>{snapshot.enterprise.id}</code></dd></div>}<div><dt>超级管理员</dt><dd>{identity(snapshot.enterprise.owner_email)}</dd></div>{!dedicated && <div><dt>授权期限</dt><dd>{datetime(snapshot.enterprise.authorized_until)}</dd></div>}{!dedicated&&<div><dt>当前管理范围</dt><dd>{snapshot.actor.owner?'本企业':'当前有效下级'}</dd></div>}</dl>{snapshot.actor.owner && <form className={styles.profileForm} onSubmit={event => { event.preventDefault(); setPreview(true); setError(''); }}><label>{dedicated?'公司名称':'企业名称'}<input required minLength={2} maxLength={80} value={name} disabled={pending} onChange={e => { setName(e.target.value); setPreview(false); }} /></label>{preview ? <div className={styles.changePreview}><p>将企业名称从“{snapshot.enterprise.name}”改为“{name.trim()}”。</p><button type='button' className={styles.primary} disabled={pending || !meta} onClick={() => void save()}>{pending ? '保存中…' : '确认保存'}</button><button type='button' disabled={pending} onClick={() => setPreview(false)}>返回编辑</button></div> : <button type='submit' disabled={name.trim() === snapshot.enterprise.name || !meta || pending}>预览变更</button>}</form>}{(error || metaError) && <p className={styles.error} role='alert'>{error || metaError}</p>}{notice && <p className={styles.notice} role='status'>{notice}</p>}<a className={styles.workflowLink} href={dedicated ? '/enterprise' : `/enterprise/workflow?${new URLSearchParams({ enterpriseId: snapshot.enterprise.id })}`}><Building2 size={16} />打开{dedicated?'协作工作台':'企业协作工作台'}</a></section>;
}
