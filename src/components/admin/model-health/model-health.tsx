"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, HeartPulse, Loader2, RefreshCw, Save, Zap } from "lucide-react";
import type { HealthOverview, HealthState } from "@/lib/model-health/contracts";
import styles from "./model-health.module.css";
import { ProviderOps } from "./provider-ops";

type ProviderView = HealthOverview["providers"][number];
type ModelView = ProviderView["models"][number];

const MODEL_STATE_TEXT: Record<HealthState, string> = {
  healthy: "正常",
  unhealthy: "异常",
  stale: "待巡检",
  unknown: "未知",
  checking: "巡检中",
  unsupported: "不支持巡检",
};

const PROVIDER_STATE_TEXT: Record<ProviderView["state"], string> = {
  healthy: "正常",
  degraded: "部分异常",
  unhealthy: "异常",
  unknown: "未知",
};

const REASON_TEXT: Record<string, string> = {
  authentication: "上游鉴权失败，请检查该供应商凭据",
  quota: "上游额度或余额不足",
  "rate-limited": "上游限流",
  network: "网络错误",
  timeout: "上游超时",
  "invalid-output": "上游返回内容无效",
  "image-download": "巡检图片下载失败",
  "upstream-error": "上游服务错误",
  configuration: "供应商配置异常",
  "acceptance-unknown": "巡检结果未能确认",
  interrupted: "巡检被中断",
  "local-busy": "业务通道繁忙，已跳过，不计巡检次数",
  reconciled: "原任务已核查，等待下一次到期巡检",
};

const RECENT_STATE_TEXT: Record<string, string> = {
  ...MODEL_STATE_TEXT,
  success: "成功",
  ok: "成功",
  failed: "失败",
  error: "失败",
  running: "进行中",
  pending: "等待中",
  skipped: "已跳过",
};

const MODALITY_TEXT: Record<string, string> = { image: "图片", video: "视频", text: "文本", audio: "音频" };

const TIME_ZONE = "Asia/Shanghai";
const clockFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: TIME_ZONE, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

/** 上游错误只显示归类后的中文说明，不原样透出可能含密钥或地址的原始报文。 */
function describeReason(reason: string | null): string | null {
  if (!reason) return null;
  const direct = REASON_TEXT[reason.trim()];
  if (direct) return direct;
  const text = reason.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/(api[- ]?key|token|secret|password|credential|unauthor|forbidden|鉴权|凭据|401|403)/.test(lower)) return REASON_TEXT.authentication;
  if (/(rate.?limit|429|限流)/.test(lower)) return REASON_TEXT["rate-limited"];
  if (/(quota|balance|insufficient|余额|额度|欠费)/.test(lower)) return REASON_TEXT.quota;
  if (/(timeout|timed out|超时)/.test(lower)) return REASON_TEXT.timeout;
  if (/(invalid|malformed|格式|输出)/.test(lower)) return REASON_TEXT["invalid-output"];
  if (/(network|dns|econn|socket|网络)/.test(lower)) return REASON_TEXT.network;
  if (/(5[0-9]{2}|internal|server|gateway|unavailable|服务)/.test(lower)) return REASON_TEXT["upstream-error"];
  if (/https?:\/\//i.test(text) || /[A-Za-z0-9_\-./+=]{24,}/.test(text) || text.length > 60) return "上游调用异常";
  return text;
}

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : clockFormat.format(date);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "—";
  const offset = time - Date.now();
  if (Math.abs(offset) < 45_000) return "刚刚";
  const suffix = offset > 0 ? "后" : "前";
  const minutes = Math.round(Math.abs(offset) / 60_000);
  if (minutes < 60) return `${minutes} 分钟${suffix}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 小时${suffix}`;
  return `${Math.round(hours / 24)} 天${suffix}`;
}

function describeMoment(iso: string | null): string {
  return iso ? `${relativeTime(iso)} · ${formatClock(iso)}` : "—";
}

function formatLatency(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} 秒` : `${Math.round(ms)} 毫秒`;
}

function formatDuration(startedAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const seconds = (end - start) / 1000;
  return seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${Math.round(seconds % 60)} 秒` : `${seconds.toFixed(1)} 秒`;
}

function summarizeStates(counts: Record<string, number>, labels: Record<string, string>): string {
  const parts = Object.entries(counts).filter(([, count]) => count > 0).map(([state, count]) => `${labels[state] ?? state} ${count}`);
  return parts.length ? parts.join(" · ") : "暂无";
}

function countModelStates(models: ModelView[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const model of models) counts[model.state] = (counts[model.state] ?? 0) + 1;
  return counts;
}

function recentBadgeState(state: string): string {
  if (state === "success" || state === "healthy" || state === "ok") return "healthy";
  if (state === "failed" || state === "unhealthy" || state === "error") return "unhealthy";
  if (state === "running" || state === "checking") return "checking";
  if (state === "stale") return "stale";
  return "unknown";
}

function recentStateText(state: string): string {
  return RECENT_STATE_TEXT[state] ?? "未知";
}

function ModelRow({ model,onReconcile }: { model: ModelView;onReconcile:(model:ModelView)=>void }) {
  const reason = describeReason(model.reason);
  return <div className={styles.modelItem}>
    <div className={styles.modelHead}>
      <div className={styles.modelIdentity}>
        <h3 className={styles.modelName}>{model.label || model.key}</h3>
        <p className={styles.modelKey}>{model.model || model.key}</p>
      </div>
      <span className={styles.stateBadge} data-state={model.state}>{MODEL_STATE_TEXT[model.state] ?? model.state}</span>
    </div>
    <div className={styles.chipRow}>
      {model.modality && <span className={styles.chip}>{MODALITY_TEXT[model.modality] ?? model.modality}</span>}
      {model.upstreamIds.length > 0 && <span className={styles.chip}>{model.upstreamIds.length} 个配置项</span>}
      {model.latencyMs !== null && <span className={styles.chip}>延迟 {formatLatency(model.latencyMs)}</span>}
      {model.lastStatus !== null && <span className={styles.chip}>HTTP {model.lastStatus}</span>}
    </div>
    {reason && <p className={`${styles.reason} ${model.state === "unhealthy" ? styles.reasonBad : styles.reasonWarn}`}>{reason}</p>}
    <dl className={styles.metaGrid}>
      <div className={styles.metaItem}><dt>最近业务成功</dt><dd>{describeMoment(model.lastBusinessSuccessAt)}</dd></div>
      <div className={styles.metaItem}><dt>最近巡检</dt><dd>{describeMoment(model.lastProbeAt)}</dd></div>
      <div className={styles.metaItem}><dt>最近验证成功</dt><dd>{describeMoment(model.lastSuccessAt)}</dd></div>
      <div className={styles.metaItem}><dt>下次可巡检</dt><dd>{describeMoment(model.nextEligibleAt)}</dd></div>
    </dl>
    {model.state==="unknown"&&model.lastObservedAt&&["acceptance-unknown","interrupted","network","timeout","upstream-error"].includes(model.reason||"")&&<button type="button" className={styles.button} onClick={()=>onReconcile(model)}>核查原任务后解除暂停</button>}
  </div>;
}

type PolicyForm = { enabled: boolean; staleHours: string; dailyMaxCalls: string };

export function ModelHealthPanel() {
  const [overview, setOverview] = useState<HealthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [authStale, setAuthStale] = useState(false);
  const [form, setForm] = useState<PolicyForm>({ enabled: true, staleHours: "6", dailyMaxCalls: "12" });
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const revisionRef = useRef<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveConflict, setSaveConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeNote, setProbeNote] = useState("");
  const [probeFailed, setProbeFailed] = useState(false);
  const readAbort = useRef<AbortController | null>(null), writes = useRef(0), latestRevision = useRef<number | null>(null);

  const applyOverview = useCallback((next: HealthOverview) => {
    if (typeof next.revision === "number") {
      if (latestRevision.current !== null && next.revision < latestRevision.current) return;
      latestRevision.current = next.revision;
    }
    setOverview(next);
    if(!dirtyRef.current)revisionRef.current = typeof next.revision === "number" ? next.revision : null;
    if (!dirtyRef.current) setForm({ enabled: next.policy.enabled, staleHours: String(next.policy.staleHours), dailyMaxCalls: String(next.policy.dailyMaxCalls) });
  }, []);

  function beginWrite() {
    writes.current++;readAbort.current?.abort();readAbort.current=null;
    setLoading(false);setRefreshing(false);
    return () => { writes.current--; };
  }
  const load = useCallback(async (mode: "initial" | "refresh" | "silent") => {
    if (writes.current) return;
    if (mode === "silent" && readAbort.current) return;
    readAbort.current?.abort();
    const abort = new AbortController(); readAbort.current = abort;
    let accessDenied=false;
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    try {
      const response = await fetch("/api/admin/model-health", { cache: "no-store", signal: abort.signal });
      if (abort.signal.aborted) return;
      if ([401,403,404].includes(response.status)) {
        // 本接口仅管理员可达：biAuthorize 对未登录一律返回 404「页面不存在」。
        accessDenied=true;setAuthStale(true);setOverview(null);
        throw new Error(response.status===403?"没有权限查看模型健康巡检":"登录状态已失效，请重新登录");
      }
      const data = await response.json().catch(() => null) as (HealthOverview & { error?: string }) | null;
      if (abort.signal.aborted) return;
      if (!response.ok || !data) throw new Error(data?.error || "加载失败，请稍后重试");
      applyOverview(data);
      setAuthStale(false);
      setLoadError("");
    } catch (error) {
      if (!abort.signal.aborted && (mode !== "silent" || accessDenied)) setLoadError(error instanceof Error ? error.message : "加载失败，请稍后重试");
    } finally {
      if (!abort.signal.aborted) { setLoading(false); setRefreshing(false); }
      if (readAbort.current === abort) readAbort.current = null;
    }
  }, [applyOverview]);

  useEffect(() => { void load("initial"); return () => readAbort.current?.abort(); }, [load]);

  const hasChecking = overview?.providers.some(provider => provider.models.some(model => model.state === "checking")) ?? false;
  useEffect(() => {
    if (!hasChecking || authStale) return;
    let active=true,timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try { if(!document.hidden)await load("silent"); }
      finally { if(active)timer=setTimeout(()=>void poll(),5000); }
    };
    timer=setTimeout(()=>void poll(),5000);
    return()=>{active=false;clearTimeout(timer);};
  }, [hasChecking, authStale, load]);

  function editForm(patch: Partial<PolicyForm>) {
    setForm(current => ({ ...current, ...patch }));
    dirtyRef.current = true;
    setDirty(true);
    setSaved(false);
    setSaveError("");
    setSaveConflict(false);
  }

  async function savePolicy() {
    if (saving || !overview) return;
    const staleHours = Number(form.staleHours);
    const dailyMaxCalls = Number(form.dailyMaxCalls);
    if (!Number.isInteger(staleHours) || staleHours < 6 || staleHours > 168) { setSaveError("数据过期阈值需为 6–168 之间的小时数"); setSaveConflict(false); return; }
    if (!Number.isInteger(dailyMaxCalls) || dailyMaxCalls < 0 || dailyMaxCalls > 12) { setSaveError("每日巡检上限需为 0–12 之间的整数"); setSaveConflict(false); return; }
    if (revisionRef.current === null) { setSaveError("配置版本缺失，请刷新后重试"); setSaveConflict(false); return; }
    setSaving(true);
    setSaveError("");
    setSaveConflict(false);
    setSaved(false);
    const finishWrite=beginWrite();
    try {
      const response = await fetch("/api/admin/model-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "policy", revision: revisionRef.current, policy: { enabled: form.enabled, staleHours, dailyMaxCalls } }),
      });
      if (response.status === 401 || response.status === 404) {
        setAuthStale(true);
        throw new Error("登录状态已失效，请重新登录");
      }
      const data = await response.json().catch(() => null) as (HealthOverview & { error?: string }) | null;
      if (response.status === 409) {
        setSaveConflict(true);
        throw new Error(data?.error || "巡检设置已被其他管理员更新，请刷新后重试");
      }
      if (response.status === 403) throw new Error(data?.error || "没有权限修改巡检设置");
      if (!response.ok || !data) throw new Error(data?.error || "保存未确认，请重试");
      dirtyRef.current = false;
      setDirty(false);
      setSaved(true);
      applyOverview(data);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存未确认，请重试");
    } finally {
      finishWrite();
      setSaving(false);
    }
  }

  async function discardAndReload() {
    dirtyRef.current = false;
    setDirty(false);
    setSaveError("");
    setSaveConflict(false);
    await load("refresh");
  }

  async function probeDueModels() {
    if (probing) return;
    setProbing(true);
    setProbeFailed(false);
    setProbeNote("");
    const finishWrite=beginWrite();
    try {
      const response = await fetch("/api/admin/model-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tick" }),
      });
      if (response.status === 401 || response.status === 404) {
        setAuthStale(true);
        throw new Error("登录状态已失效，请重新登录");
      }
      const data = await response.json().catch(() => null) as (HealthOverview & { error?: string }) | null;
      if (response.status === 403) throw new Error(data?.error || "没有权限触发巡检");
      if (!response.ok || !data) throw new Error(data?.error || "触发未确认，请重试");
      setProbeNote("已唤醒巡检，到期模型将在每日预算内执行");
      applyOverview(data);
    } catch (error) {
      setProbeFailed(true);
      setProbeNote(error instanceof Error ? error.message : "触发未确认，请重试");
    } finally {
      finishWrite();
      setProbing(false);
    }
  }
  async function reconcile(model:ModelView){
    if(!model.lastObservedAt||!window.confirm("请先在供应商侧确认原任务已结束且不再运行。此操作只解除后续巡检暂停，不重发原任务；至少等待当前巡检间隔后才能再次检查。确认已完成核查？"))return;
    const finishWrite=beginWrite();
    try{
      const response=await fetch("/api/admin/model-health",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"reconcile",key:model.key,observedAt:model.lastObservedAt,confirmed:true})});
      const data=await response.json();if(!response.ok)throw Error(data.error||"状态未确认，请刷新后核查");applyOverview(data);
    }catch(error){setLoadError(error instanceof Error?error.message:"状态未确认，请刷新后核查");}
    finally{finishWrite();}
  }

  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 };
    overview?.providers.forEach(provider => { counts[provider.state] = (counts[provider.state] ?? 0) + 1; });
    return counts;
  }, [overview]);

  const modelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    overview?.providers.forEach(provider => provider.models.forEach(model => { counts[model.state] = (counts[model.state] ?? 0) + 1; }));
    return counts;
  }, [overview]);

  const totalModels = useMemo(() => overview?.providers.reduce((total, provider) => total + provider.models.length, 0) ?? 0, [overview]);

  const budgetRatio = overview && overview.budget.limit > 0 ? overview.budget.used / overview.budget.limit : 0;
  const budgetTone = budgetRatio >= 1 ? styles.progressFull : budgetRatio >= 0.8 ? styles.progressWarn : "";

  return <div className={styles.panel}>
    <header className={styles.header}>
      <div className={styles.titleBox}>
        <span className={styles.iconBadge}><HeartPulse size={22} /></span>
        <div>
          <h1>模型健康巡检</h1>
          <p className={styles.subtitle}>仅检查已配置模型</p>
        </div>
      </div>
      <div className={styles.actions}>
        <div className={styles.actionColumn}>
          <button type="button" className={styles.button} onClick={() => void load("refresh")} disabled={refreshing || loading}>
            {refreshing ? <Loader2 size={16} className={styles.spin} /> : <RefreshCw size={16} />}刷新
          </button>
        </div>
        <div className={styles.actionColumn}>
          <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => void probeDueModels()} disabled={probing || loading || !overview}>
            {probing ? <Loader2 size={16} className={styles.spin} /> : <Zap size={16} />}检查到期模型
          </button>
          <span className={`${styles.actionNote} ${probeFailed ? styles.error : ""}`} role="status">{probeNote || "仅巡检到期模型，仍在每日预算内"}</span>
        </div>
      </div>
    </header>

    {loadError && <div role="alert" className={styles.errorBanner}>
      <span>{loadError}</span>
      {authStale
        ? <a className={styles.linkButton} href={`/admin?next=${encodeURIComponent("/admin/model-health")}`}>前往登录</a>
        : <button type="button" className={styles.linkButton} onClick={() => void load("refresh")}>重试</button>}
    </div>}

    {overview && <>
      <section className={styles.grid} aria-label="巡检概览">
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>今日巡检次数</p>
          <p className={styles.kpiValue}>{overview.budget.used} / {overview.budget.limit}</p>
          <div className={`${styles.progress} ${budgetTone}`} role="progressbar" aria-label="今日巡检次数进度" aria-valuemin={0} aria-valuemax={overview.budget.limit} aria-valuenow={overview.budget.used}>
            <span className={styles.progressFill} style={{ width: `${Math.min(100, budgetRatio * 100)}%` }} />
          </div>
          <p className={styles.kpiHint}>全部配置模型合计 · 上海自然日（{overview.budget.day}）</p>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Worker 心跳</p>
          <p className={styles.kpiValue}>{overview.worker.lastTickAt ? relativeTime(overview.worker.lastTickAt) : "尚未心跳"}</p>
          <p className={styles.kpiHint}>{overview.worker.lastTickAt ? `${formatClock(overview.worker.lastTickAt)} · Asia/Shanghai` : "巡检 Worker 尚未上报"}</p>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>供应商状态</p>
          <p className={styles.kpiValue}>{providerCounts.healthy ?? 0} / {overview.providers.length} 正常</p>
          <p className={styles.kpiHint}>{summarizeStates(providerCounts, PROVIDER_STATE_TEXT)}</p>
        </article>
        <article className={styles.kpiCard}>
          <p className={styles.kpiLabel}>配置模型</p>
          <p className={styles.kpiValue}>{totalModels} 个</p>
          <p className={styles.kpiHint}>{summarizeStates(modelCounts, MODEL_STATE_TEXT)}</p>
        </article>
      </section>

      <div className={styles.stack}>
        <section className={styles.card} aria-label="巡检设置">
          <div className={styles.cardHead}>
            <h2 className={styles.cardTitle}>巡检设置</h2>
            <span className={`${styles.liveTag} ${overview.policy.enabled ? "" : styles.liveTagOff}`}>{overview.policy.enabled ? "巡检策略已启用" : "巡检策略已停用"}</span>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.switchRow}>
              <div>
                <p className={styles.fieldLabel}>启用自动巡检</p>
                <p className={styles.fieldHint}>关闭后，自动与手动巡检均暂停</p>
              </div>
              <input type="checkbox" className={styles.switch} role="switch" aria-label="启用自动巡检" checked={form.enabled} disabled={saving || refreshing} onChange={event => editForm({ enabled: event.target.checked })} />
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>数据过期阈值（小时）</span>
              <input type="number" min={6} max={168} step={1} inputMode="numeric" value={form.staleHours} disabled={saving || refreshing} onChange={event => editForm({ staleHours: event.target.value })} />
              <span className={styles.fieldHint}>无成功记录超过该时长即视为待巡检，范围 6–168 小时，默认 6</span>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>每日巡检上限（次）</span>
              <input type="number" min={0} max={12} step={1} inputMode="numeric" value={form.dailyMaxCalls} disabled={saving || refreshing} onChange={event => editForm({ dailyMaxCalls: event.target.value })} />
              <span className={styles.fieldHint}>全部配置模型合计，上海自然日，每次巡检 1 张图片；0 表示暂停巡检调用</span>
            </label>
          </div>
          <footer className={styles.formFooter}>
            <div className={styles.formStatus} role="status">
              {saved && !dirty && <span className={styles.saved}><CheckCircle2 size={15} />已保存</span>}
              {saveError && <span className={styles.formError} role="alert">{saveError}{saveConflict && <button type="button" className={styles.linkButton} onClick={() => void discardAndReload()}>拉取最新配置</button>}</span>}
            </div>
            <button type="button" className={`${styles.button} ${styles.primary}`} onClick={() => void savePolicy()} disabled={saving || refreshing || !dirty}>
              {saving ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}保存设置
            </button>
          </footer>
        </section>

        <section aria-label="供应商与模型健康" className={styles.stack}>
          {overview.providers.length === 0
            ? <div className={`${styles.card} ${styles.empty}`}>暂无参与巡检的供应商模型</div>
            : overview.providers.map(provider => <article key={provider.id} className={styles.providerCard}>
              <header className={styles.providerHead}>
                <div className={styles.providerTitle}>
                  <h2>{provider.name || provider.id}</h2>
                  <p className={styles.providerMeta}>{provider.models.length} 个模型 · {summarizeStates(countModelStates(provider.models), MODEL_STATE_TEXT)}</p>
                </div>
                <span className={styles.stateBadge} data-state={provider.state}>{PROVIDER_STATE_TEXT[provider.state]}</span>
              </header>
              <div>{provider.models.map(model => <ModelRow key={model.key} model={model} onReconcile={model=>void reconcile(model)} />)}</div>
            </article>)}
        </section>

        <section className={styles.card} aria-label="最近巡检记录">
          <h2 className={styles.cardTitle}>最近巡检记录</h2>
          {overview.recent.length === 0
            ? <p className={styles.empty}>暂无巡检记录</p>
            : <div>
              {overview.recent.slice(0, 20).map(run => {
                const provider = overview.providers.find(item => item.id === run.providerId);
                const duration = formatDuration(run.startedAt, run.finishedAt);
                const reason = describeReason(run.reason);
                const badge = recentBadgeState(run.state);
                return <div key={run.id} className={styles.recentItem}>
                  <span className={styles.recentTime}>{formatClock(run.startedAt)}{duration ? ` · ${duration}` : ""}</span>
                  <span className={styles.recentTarget}>{provider?.name ?? run.providerId} / {run.model}</span>
                  <span className={styles.stateBadge} data-state={badge}>{recentStateText(run.state)}</span>
                  {run.status !== null && <span className={styles.chip}>HTTP {run.status}</span>}
                  {reason && <span className={`${styles.recentReason} ${badge === "unhealthy" ? styles.reasonBad : styles.reasonWarn}`}>{reason}</span>}
                </div>;
              })}
              {overview.recent.length > 20 && <p className={styles.kpiHint}>仅显示最近 20 条，共 {overview.recent.length} 条</p>}
            </div>}
        </section>

      </div>
    </>}
    {loading&&!overview&&<div className={styles.grid} aria-busy="true" aria-label="读取模型巡检">{[0,1,2,3].map(index=><div key={index} className={`${styles.kpiCard} ${styles.skeleton}`}/>)}</div>}
    <ProviderOps />
  </div>;
}
