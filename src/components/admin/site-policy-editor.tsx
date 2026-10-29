'use client';
import { useEffect, useState } from 'react';
import { ACCESS_FEATURES, ALL_FEATURE_IDS } from '@/lib/feature-access/catalog';
import { WORKSPACE_MODULES, type SitePolicy, type SitePolicyInput } from '@/lib/site-control/contracts';

type Props = { policy: SitePolicy | null | undefined; busy: boolean; writable: boolean; read: () => void; publish: (policy: SitePolicyInput, expectedRevision: number) => void };
const button = 'rounded-xl border border-slate-200 px-4 py-2 text-sm disabled:opacity-50';
const input = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm';
export function SitePolicyEditor({ policy, busy, writable, read, publish }: Props) {
  const [draft, setDraft] = useState<SitePolicyInput | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!draft || !policy || policy.revision <= revision) return;
    const same = policy.enterpriseId === draft.enterpriseId && policy.sourceInstanceId === draft.sourceInstanceId && policy.brand === draft.brand
      && JSON.stringify([...policy.enabledFeatures].sort()) === JSON.stringify([...draft.enabledFeatures].sort())
      && JSON.stringify([...policy.workspaceModules].sort()) === JSON.stringify([...draft.workspaceModules].sort());
    if (same) setDraft(null);
  }, [policy, revision, draft]);
  function edit() {
    setRevision(policy?.revision ?? 0);
    setDraft(policy ? { enterpriseId: policy.enterpriseId, sourceInstanceId: policy.sourceInstanceId, brand: policy.brand, enabledFeatures: [...policy.enabledFeatures], workspaceModules: [...policy.workspaceModules] } : { enterpriseId: '', sourceInstanceId: '', brand: '', enabledFeatures: [...ALL_FEATURE_IDS], workspaceModules: WORKSPACE_MODULES.map(m => m.id) });
  }
  return <section className="mb-5 rounded-xl border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">企业站功能开放</h3><div className="flex gap-2"><button className={button} disabled={busy} onClick={read}>读取站点配置</button>{policy !== undefined && <button className={button} disabled={busy || !writable} onClick={edit}>编辑</button>}</div></div>
    {policy && <p className="mt-2 text-sm text-slate-500">{policy.brand} · 已生效 v{policy.revision} · {new Date(policy.updatedAt).toLocaleString()}</p>}
    {policy === null && <p className="mt-2 text-sm text-slate-500">尚未发布站点配置</p>}
    {draft && <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">企业名称<input className={input} maxLength={80} value={draft.brand} onChange={e => setDraft({ ...draft, brand: e.target.value })}/></label><label className="text-sm">企业绑定 ID<input className={input} readOnly={!!policy} value={draft.enterpriseId} onChange={e => setDraft({ ...draft, enterpriseId: e.target.value })}/></label><label className="text-sm">来源实例<input className={input} readOnly={!!policy} value={draft.sourceInstanceId} onChange={e => setDraft({ ...draft, sourceInstanceId: e.target.value })}/></label></div>
      <fieldset><legend className="mb-2 text-sm font-medium">页面与创作工具</legend><div className="grid gap-2 sm:grid-cols-3">{ACCESS_FEATURES.map(f => <label key={f.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabledFeatures.includes(f.id)} onChange={e => setDraft({ ...draft, enabledFeatures: e.target.checked ? [...draft.enabledFeatures, f.id] : draft.enabledFeatures.filter(id => id !== f.id) })}/>{f.label}</label>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-medium">协作交付模块</legend><div className="grid gap-2 sm:grid-cols-3">{WORKSPACE_MODULES.map(m => <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.workspaceModules.includes(m.id)} onChange={e => setDraft({ ...draft, workspaceModules: e.target.checked ? [...draft.workspaceModules, m.id] : draft.workspaceModules.filter(id => id !== m.id) })}/>{m.label}</label>)}</div></fieldset>
      {policy && policy.revision !== revision && <p role="alert" className="text-sm text-amber-700">配置已变更，请重新读取后编辑。</p>}
      <div className="flex gap-2"><button className={`${button} bg-indigo-600 text-white`} disabled={busy || !writable || !draft.enterpriseId || !draft.sourceInstanceId || !draft.brand.trim() || !!policy && policy.revision !== revision} onClick={() => publish(draft, revision)}>发布配置</button><button className={button} onClick={() => setDraft(null)}>取消</button></div>
    </div>}
  </section>;
}
