"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import { ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown, Copy, Download, FileText, FolderOpen, LoaderCircle, Palette, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { authHeader } from "@/lib/supabase";
import { BRIEF_STEPS, EXAMPLE_BRIEF, PACKAGING_LIMITS, completedFields, draftStorageKey, emptyBrief, exportFilename, parseLocalDraft, parseProject, sameBrief, type PackagingBrief, type PackagingProject, type ProjectSummary } from "./model";
import "./packaging-strategy.css";

const ENDPOINT = "/api/packaging-strategy";

class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly project?: unknown) { super(message); }
}

async function request(path: string, signal: AbortSignal, body?: unknown) {
  const headers = await authHeader();
  signal.throwIfAborted();
  const response = await fetch(path, {
    method: body ? "POST" : "GET", cache: "no-store", signal,
    headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(response.status === 409 ? "这个项目已有新版本。请先恢复云端版本，再继续编辑。当前本机内容仍保留。" : typeof data.error === "string" ? data.error : `请求失败（${response.status}）`, response.status, data.project);
  return data;
}

function Gate({ loading, denied, onLogin }: { loading?: boolean; denied?: boolean; onLogin?: () => void }) {
  return <main className="packaging-workspace"><div className="ps-gate">
    <div className="ps-logo"><Palette size={25} /></div>
    <h1>品牌包装策略</h1>
    <p>{loading ? "正在加载…" : denied ? "当前账号尚未开通此功能" : "登录后创建简报，保存和管理你的包装策略"}</p>
    {loading ? <LoaderCircle className="ps-spin" size={22} /> : !denied && <button className="ps-button ps-primary" onClick={onLogin}>登录并开始</button>}
    <Link href="/tools" className="ps-back"><ArrowLeft size={14} /> 返回创作</Link>
  </div></main>;
}

export function PackagingStrategyClient() {
  const { user, ready, signOut } = useAuth();
  const { openAuth } = useAuthModal();
  const access = useFeatureAccess();
  if (!ready || (user && !access.ready)) return <Gate loading />;
  if (!user) return <Gate onLogin={() => openAuth()} />;
  if (!access.canPage("/tools/packaging-strategy")) return <Gate denied />;
  // Keying the entire private workspace prevents even a single render of the
  // previous account's brief/results during sign-out or account switching.
  return <StrategyWorkspace key={user.email.toLowerCase()} email={user.email.toLowerCase()} onLogin={() => { signOut(); openAuth(); }} />;
}

function StrategyWorkspace({ email, onLogin }: { email: string; onLogin: () => void }) {
  const [hydrated, setHydrated] = useState(false);
  const [brief, setBrief] = useState<PackagingBrief>(emptyBrief);
  const [project, setProject] = useState<PackagingProject | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState("");
  const [feedback, setFeedback] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [storageState, setStorageState] = useState("本机草稿已保存");
  const [confirm, setConfirm] = useState<{ title: string; description: string; action: () => void } | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const alive = useRef(true);
  const operation = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const guard = useRef(false);
  const latestDraft = useRef<string | null>(null);
  const localWriteAllowed = useRef(true);
  const count = completedFields(brief);
  const current = BRIEF_STEPS[step];
  const result = project?.result;
  const dirty = project ? !sameBrief(brief, project.brief) : count > 0;
  const hasChanges = dirty || !!answers.trim() || !!feedback.trim();
  const staleResult = !!result && !!project && !sameBrief(brief, project.brief);
  if (hydrated) latestDraft.current = JSON.stringify({ brief, project, step, answers, feedback });

  useEffect(() => {
    alive.current = true;
    const raw = localStorageRead(draftStorageKey(email));
    const saved = parseLocalDraft(raw);
    if (saved) { setBrief(saved.brief); setProject(saved.project); setStep(saved.step); setAnswers(saved.answers); setFeedback(saved.feedback); }
    else if (raw) {
      // Preserve invalid/older over-limit storage verbatim until an explicit
      // new/save/restore action replaces it. Never silently truncate it.
      localWriteAllowed.current = false;
      setError("本机旧草稿格式或长度不符合当前要求，原始内容仍保留。请新建简报或恢复云端项目。");
      setStorageState("旧草稿已保留，尚未载入");
    }
    setHydrated(true);
    const flushDraft = () => { try { if (localWriteAllowed.current && latestDraft.current) localStorage.setItem(draftStorageKey(email), latestDraft.current); } catch { /* UI already shows storage failures. */ } };
    window.addEventListener("pagehide", flushDraft);
    return () => { alive.current = false; operation.current?.abort(); flushDraft(); window.removeEventListener("pagehide", flushDraft); };
  }, [email]);

  useEffect(() => {
    if (!hydrated || !localWriteAllowed.current) return;
    setStorageState("正在保存草稿…");
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftStorageKey(email), JSON.stringify({ brief, project, step, answers, feedback }));
        setStorageState("本机草稿已保存");
      } catch { setStorageState("本机存储不可用，请保存到云端"); }
    }, 300);
    return () => clearTimeout(timer);
  }, [email, hydrated, brief, project, step, answers, feedback]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    setListLoading(true); setListError("");
    void request(ENDPOINT, controller.signal).then((data) => {
      if (controller.signal.aborted || !alive.current) return;
      if (!Array.isArray(data.projects) || !data.projects.every((p: ProjectSummary) => p && typeof p.id === "string" && typeof p.title === "string" && typeof p.revision === "number" && typeof p.updatedAt === "string")) throw new Error("云端项目列表格式错误");
      setProjects((previous) => {
        const merged = new Map<string, ProjectSummary>((data.projects as ProjectSummary[]).map((p) => [p.id, p]));
        for (const p of previous) if (!merged.has(p.id) || merged.get(p.id)!.revision <= p.revision) merged.set(p.id, p);
        return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    }).catch((e: unknown) => {
      if (controller.signal.aborted || !alive.current) return;
      if (e instanceof RequestError && e.status === 403) setDenied(true);
      if (e instanceof RequestError && e.status === 401) { setAuthRequired(true); onLogin(); }
      setListError(e instanceof Error ? e.message : "读取云端项目失败");
    }).finally(() => { if (!controller.signal.aborted && alive.current) setListLoading(false); });
    return () => controller.abort();
  // onLogin is intentionally excluded: modal-provider renders must not refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, listVersion]);

  function report(e: unknown) {
    // Failed generation can still advance the persisted revision while releasing
    // its lease. Accept that authoritative revision without claiming success.
    if (e instanceof RequestError && e.status !== 409) {
      const updated = parseProject(e.project);
      if (updated) accept(updated);
    }
    if (e instanceof RequestError && e.status === 403) setDenied(true);
    if (e instanceof RequestError && e.status === 401) { setAuthRequired(true); onLogin(); }
    setError(e instanceof Error ? e.message : "请求失败，请稍后重试");
  }

  function accept(next: PackagingProject) {
    localWriteAllowed.current = true;
    setProject(next); setBrief(next.brief);
    setProjects((all) => [{ id: next.id, title: next.title, revision: next.revision, updatedAt: next.updatedAt }, ...all.filter((p) => p.id !== next.id)]);
  }

  async function perform(action: "save" | "generate" | "refine", allowDraft = false) {
    if (guard.current || !hydrated || denied || authRequired) return;
    if (!count) { setError("先填写品牌、产品或项目需求，再开始。"); return; }
    if (action === "refine" && (!feedback.trim() || result?.kind !== "strategy")) return;
    guard.current = true;
    const controller = new AbortController(); operation.current = controller;
    setBusy(action); setError(""); setNotice("");
    try {
      let active = project;
      // Bind a persisted identity before any model submission. The same mutex
      // covers both calls, and failures retain the saved project for retry.
      if (action !== "save" && !active) {
        const saved = await request(ENDPOINT, controller.signal, { action: "save", brief });
        if (!alive.current || controller.signal.aborted) return;
        active = parseProject(saved.project);
        if (!active) throw new Error("项目保存失败，请恢复云端项目后重试。");
        accept(active);
      }
      const data = await request(ENDPOINT, controller.signal, {
        action, brief,
        ...(active ? { projectId: active.id, expectedRevision: active.revision } : {}),
        ...(answers.trim() ? { answers: answers.trim() } : {}),
        ...(action === "refine" ? { feedback: feedback.trim() } : {}),
        ...(allowDraft ? { allowDraft: true } : {}),
      });
      if (!alive.current || controller.signal.aborted) return;
      const next = parseProject(data.project);
      if (!next) throw new Error("接口未返回完整项目，请恢复云端项目后重试。");
      accept(next);
      if (action === "refine") setFeedback("");
      if (next.result?.kind === "strategy") setAnswers("");
      setNotice(action === "save" ? "已保存到云端" : next.result?.kind === "questions" ? "补充以下问题后继续" : "策略已生成并保存");
      if (action !== "save") requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) { if (alive.current && !controller.signal.aborted) report(e); }
    finally { if (alive.current && !controller.signal.aborted) { guard.current = false; setBusy(""); } }
  }

  async function restore(id: string) {
    if (!id || guard.current) return;
    guard.current = true;
    const controller = new AbortController(); operation.current = controller;
    setBusy("restore"); setError(""); setNotice("");
    try {
      const data = await request(`${ENDPOINT}?id=${encodeURIComponent(id)}`, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      const next = parseProject(data.project);
      if (!next) throw new Error("云端项目格式错误");
      accept(next); setStep(0); setAnswers(""); setFeedback(""); setNotice("已恢复云端版本");
    } catch (e) { if (alive.current && !controller.signal.aborted) report(e); }
    finally { if (alive.current && !controller.signal.aborted) { guard.current = false; setBusy(""); } }
  }

  function startFresh(example: boolean) {
    localWriteAllowed.current = true;
    setBrief(example ? { ...EXAMPLE_BRIEF } : emptyBrief()); setProject(null); setStep(0); setAnswers(""); setFeedback(""); setError("");
    setNotice(example ? "已载入示例简报，尚未生成策略" : "已新建简报；云端项目仍保留");
  }

  function confirmReplace(title: string, action: () => void, force = false) {
    if (busy) return;
    if (force || count || result || hasChanges) setConfirm({ title, description: "此操作会替换当前本机草稿。已保存的云端项目不会删除。", action });
    else action();
  }

  async function copyResult() {
    if (result?.kind !== "strategy") return;
    try { await navigator.clipboard.writeText(result.content); if (alive.current) setNotice("策略已复制"); }
    catch { if (alive.current) setError("复制失败，请选择结果文字手动复制。"); }
  }

  function downloadResult() {
    if (result?.kind !== "strategy") return;
    const url = URL.createObjectURL(new Blob([result.content], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = exportFilename(project?.title || "品牌包装策略");
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (denied) return <Gate denied />;
  if (authRequired) return <Gate onLogin={onLogin} />;
  if (!hydrated) return <Gate loading />;

  return <main className="packaging-workspace" aria-busy={!!busy}>
    <header className="ps-header">
      <div className="ps-heading"><Link href="/tools" aria-label="返回创作" className="ps-icon-button"><ArrowLeft size={19} /></Link><div className="ps-logo"><Palette size={23} /></div><div><h1>品牌包装策略</h1><span className="ps-subtitle">项目简报 <span aria-hidden="true">/</span> 创意策略</span></div></div>
      <div className="ps-header-actions"><span className="ps-save-state"><CheckCheck size={14} /> {storageState}</span><button className="ps-button" disabled={!!busy} onClick={() => confirmReplace("载入示例简报？", () => startFresh(true))}><FileText size={15} /> 载入示例</button><button className="ps-icon-button" disabled={!!busy} aria-label="清空当前简报" onClick={() => confirmReplace("清空当前简报？", () => startFresh(false), true)}><Trash2 size={16} /></button></div>
    </header>

    <div className="ps-project-bar"><div className="ps-project-title"><span className="ps-label">当前项目</span><strong>{project?.title || "未命名简报"}</strong>{project && <span className="ps-revision">v{project.revision}</span>}</div><div className="ps-project-actions"><div className="ps-history"><FolderOpen size={15} /><select aria-label="恢复云端项目" value="" disabled={!!busy || listLoading || !projects.length} onChange={(e) => { const id = e.target.value; confirmReplace("恢复云端项目？", () => void restore(id)); }}><option value="">{listLoading ? "正在加载项目…" : projects.length ? "云端项目" : "暂无云端项目"}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title} · v{p.revision}</option>)}</select><ChevronDown size={13} /></div><button className="ps-button ps-compact" disabled={!!busy} onClick={() => confirmReplace("新建简报？", () => startFresh(false))}><Plus size={14} /> 新建</button></div></div>
    {listError && <div className="ps-banner ps-banner-error" role="alert">{listError}<button onClick={() => setListVersion((v) => v + 1)} disabled={listLoading}>重试列表</button></div>}
    {error && <div className="ps-banner ps-banner-error" role="alert"><span>{error}</span>{project && <button disabled={!!busy} onClick={() => confirmReplace("恢复云端版本？", () => void restore(project.id), true)}>恢复云端版本</button>}<button aria-label="关闭错误提示" onClick={() => setError("")}><X size={15} /></button></div>}
    {notice && <div className="ps-banner ps-banner-success" role="status"><Check size={15} /><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice("")}><X size={15} /></button></div>}

    <div className="ps-layout">
      <aside className="ps-steps-panel"><div className="ps-section-label">项目简报 <span>8 项</span></div><nav aria-label="简报步骤" className="ps-steps">{BRIEF_STEPS.map((item, i) => <button key={item.key} className={`ps-step ${step === i ? "is-active" : ""}`} onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}><span className={`ps-step-number ${brief[item.key].trim() ? "is-filled" : ""}`}>{brief[item.key].trim() ? <Check size={13} /> : String(i + 1).padStart(2, "0")}</span><span className="ps-step-title">{item.title}</span>{step === i && <ArrowRight size={14} className="ps-step-arrow" />}</button>)}</nav><div className="ps-progress"><div><span>填写完整度</span><strong>{count} / 8</strong></div><progress aria-label="已填写字段" max={8} value={count} /><p>按已填写项计数，不代表策略质量</p></div></aside>

      <div className="ps-main-column"><section className="ps-editor"><div className="ps-editor-topline"><span className="ps-eyebrow">STEP {String(step + 1).padStart(2, "0")}</span><span>{step + 1} / 8</span></div><h2>{current.title}</h2><p className="ps-question">{current.prompt}</p><label htmlFor={`brief-${current.key}`} className="ps-field-label">{current.hint}</label><textarea key={current.key} id={`brief-${current.key}`} value={brief[current.key]} maxLength={PACKAGING_LIMITS.brief} placeholder={current.placeholder} disabled={!!busy} onChange={(e) => { setBrief((all) => ({ ...all, [current.key]: e.target.value })); setNotice(""); }} className="ps-brief-input" /><div className="ps-field-footer"><span>不确定的信息可以留空</span><span>{brief[current.key].length.toLocaleString()} / {PACKAGING_LIMITS.brief.toLocaleString()}</span></div><div className="ps-editor-footer"><button className="ps-button" disabled={step === 0 || !!busy} onClick={() => setStep((v) => v - 1)}><ArrowLeft size={15} /> 上一步</button>{step < 7 ? <button className="ps-button ps-primary" disabled={!!busy} onClick={() => setStep((v) => v + 1)}>下一步 <ArrowRight size={15} /></button> : <button className="ps-button ps-primary" disabled={!!busy || !count} onClick={() => void perform("generate")}><Sparkles size={15} /> 生成策略</button>}</div></section>

      <section className="ps-result" ref={resultRef} aria-label="策略结果"><div className="ps-result-heading"><div><span className="ps-eyebrow">STRATEGY</span><h2>{result?.kind === "questions" ? "需要你补充" : "包装创意策略"}</h2></div>{result?.kind === "strategy" && <div className="ps-result-tools"><button className="ps-icon-button" aria-label="复制策略" title="复制策略" onClick={() => void copyResult()}><Copy size={17} /></button><button className="ps-icon-button" aria-label="下载 Markdown" title="下载 Markdown" onClick={downloadResult}><Download size={17} /></button></div>}</div>
        {busy && busy !== "save" && busy !== "restore" && <div className="ps-generating" role="status"><LoaderCircle size={18} className="ps-spin" /><span>{busy === "refine" ? "正在优化策略，原内容保留" : "正在分析简报并制定策略…"}</span></div>}
        {staleResult && <div className="ps-stale" role="status">简报已更新。以下为上次结果，重新生成后才会同步。</div>}
        {!result && !busy && <div className="ps-empty"><span><FileText size={25} /></span><h3>你的策略会出现在这里</h3><p>填写简报后生成，也可以先出一版带待确认项的初稿。</p></div>}
        {result?.kind === "questions" && <div className="ps-questions"><ol>{result.questions.map((q, i) => <li key={`${i}-${q}`}>{q}</li>)}</ol><label htmlFor="ps-answers">补充回答</label><textarea id="ps-answers" value={answers} maxLength={PACKAGING_LIMITS.answers} disabled={!!busy} onChange={(e) => setAnswers(e.target.value)} placeholder="按问题补充即可，不确定的内容可以说明。" /><div className="ps-answer-actions"><button className="ps-button ps-primary" disabled={!!busy || !answers.trim()} onClick={() => void perform("generate")}><Sparkles size={15} /> 补充并生成</button><button className="ps-text-button" disabled={!!busy} onClick={() => void perform("generate", true)}>先出初稿</button></div></div>}
        {result?.kind === "strategy" && <><article className="ps-markdown"><Markdown skipHtml components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{result.content}</Markdown></article><div className="ps-refine"><label htmlFor="ps-feedback">继续调整</label><textarea id="ps-feedback" value={feedback} disabled={!!busy} maxLength={PACKAGING_LIMITS.feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="例如：让三个方向更有差异，保留现有价格定位。" /><button className="ps-button ps-primary" disabled={!!busy || !feedback.trim() || staleResult} onClick={() => void perform("refine")}><Sparkles size={15} /> 优化策略</button>{staleResult && <p>先根据更新后的简报重新生成，再继续优化。</p>}</div></>}
      </section></div>

      <aside className="ps-summary"><div className="ps-summary-header"><h2>简报摘要</h2><span>{count} 项已填</span></div><div className="ps-summary-list">{BRIEF_STEPS.map((item, i) => <button key={item.key} className="ps-summary-item" onClick={() => setStep(i)}><span>{item.short}<ArrowRight size={12} /></span><p className={brief[item.key].trim() ? "" : "is-empty"}>{brief[item.key].trim() || "待填写"}</p></button>)}</div><div className="ps-summary-actions"><button className="ps-button ps-primary ps-full" disabled={!!busy || !count} onClick={() => void perform("generate")}>{busy === "generate" ? <LoaderCircle className="ps-spin" size={16} /> : <Sparkles size={16} />}{busy === "generate" ? "正在生成…" : result ? "重新生成策略" : "生成包装策略"}</button><div className="ps-secondary-actions"><button className="ps-button" disabled={!!busy || !count} onClick={() => void perform("save")}>{busy === "save" ? <LoaderCircle size={14} className="ps-spin" /> : <Save size={14} />} 保存云端</button><button className="ps-text-button" disabled={!!busy || !count} onClick={() => void perform("generate", true)}>先出初稿</button></div><p className="ps-generation-note">仅生成文字策略，不调用图片工具</p></div></aside>
    </div>

    {confirm && <ConfirmDialog title={confirm.title} description={confirm.description} onClose={() => setConfirm(null)} onConfirm={() => { const action = confirm.action; setConfirm(null); action(); }} />}
  </main>;
}

function localStorageRead(key: string) { try { return localStorage.getItem(key); } catch { return null; } }

function ConfirmDialog({ title, description, onClose, onConfirm }: { title: string; description: string; onClose: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancel.current?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); }
      if (e.key !== "Tab") return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, []);
  return <div className="ps-modal-backdrop" onMouseDown={onClose}><div ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby="ps-confirm-title" aria-describedby="ps-confirm-description" className="ps-modal" onMouseDown={(e) => e.stopPropagation()}><h2 id="ps-confirm-title">{title}</h2><p id="ps-confirm-description">{description}</p><div><button ref={cancel} className="ps-button" onClick={onClose}>取消</button><button className="ps-button ps-primary" onClick={onConfirm}>确认继续</button></div></div></div>;
}
