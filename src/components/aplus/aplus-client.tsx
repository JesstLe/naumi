"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadImage } from "@/lib/download";
import { useAuth } from "@/lib/auth-context";
import { usePaymentConfig } from "@/lib/payment-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";
import { useImageJobResume } from "@/components/use-image-job-resume";
import { POINTS_PER_IMAGE } from "@/lib/mock-data";
import { PromptAssistPopup } from "@/components/tools/prompt-assist-popup";
import { ImageLightbox } from "@/components/image-lightbox";
import { TextModelSelect } from "@/components/ui/text-model-select";

// ---------------------------------------------------------------------------
// A+ 详情页工作台(对标竞品 a-plus 详情页):
// 左 = 商品原图(1-3) + 上架平台/语言/图片比例 + 卖点&要求 + 快捷优化项多选卡;
// 右 = 生成结果(模块卡片流) + 进度;积分按模块数 × 单张计,CTA 前置预估。
// ---------------------------------------------------------------------------

const MAX_IMAGES = 3;
const MAX_UPLOAD = 12 * 1024 * 1024;

const PLATFORMS = [
  { id: "amazon", label: "亚马逊" },
  { id: "taobao", label: "淘宝 / 天猫" },
  { id: "pdd", label: "拼多多" },
  { id: "independent", label: "独立站" },
];

const LANGS = [
  { id: "auto", label: "跟随平台" },
  { id: "zh", label: "中文" },
  { id: "en", label: "英文" },
];

const FORMATS = [
  { id: "aplus-web", label: "高级A+（Web端）" },
  { id: "aplus-mobile", label: "高级A+（移动端）" },
  { id: "aplus-basic", label: "普通A+" },
  { id: "1:1", label: "1:1" },
  { id: "4:3", label: "4:3" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
];

// 比例档 → 结果卡片宽高比(与后端 sizeFor 映射一致)
function aspectFor(format: string) {
  if (format === "aplus-mobile" || format === "9:16") return "aspect-[2/3]";
  if (format === "1:1") return "aspect-square";
  return "aspect-[3/2]";
}

const MODULE_CARDS = [
  { id: "hero", label: "首屏主视觉", hint: "传递核心价值", def: true },
  { id: "selling", label: "核心卖点图", hint: "突出差异化优势", def: true },
  { id: "scene", label: "使用场景图", hint: "呈现真实使用场景", def: true },
  { id: "angles", label: "多角度图", hint: "多角度呈现外观", def: true },
  { id: "story", label: "品牌故事图", hint: "传递品牌理念", def: false },
  { id: "compare", label: "效果对比图", hint: "使用前后对比", def: false },
  { id: "craft", label: "工艺制作图", hint: "展示工艺制作过程", def: false },
  { id: "size", label: "尺寸尺码图", hint: "展示规格信息", def: false },
  { id: "specs", label: "规格/参数表", hint: "展示详细商品数据", def: false },
  { id: "accessories", label: "配件/赠品图", hint: "明确收货所有物品", def: false },
  { id: "series", label: "系列展示图", hint: "多色或多 SKU 展示", def: false },
  { id: "ingredients", label: "商品成分图", hint: "展示配方/材质/成分", def: false },
  { id: "assurance", label: "售后保障图", hint: "说明质保退换政策", def: false },
  { id: "usage", label: "使用建议图", hint: "说明使用方法建议", def: false },
];

type Shot = {
  id: string;
  role: string;
  label: string;
  ratio: string;
  status: "pending" | "done" | "error";
  url?: string | null;
  gradient: string;
};
type SourceImage = {
  id: string;
  label: string;
  status: "preparing" | "review" | "approved" | "redoing" | "error";
  url?: string;
  version: number;
  feedback?: string;
  error?: string;
  history?: { version: number; feedback: string; url: string; createdAt: number }[];
};


export function AplusClient() {
  const L = (z: string, e: string) =>
    typeof window !== "undefined" && document.documentElement.lang === "en" ? e : z;
  const { user, ready, applyServerUser } = useAuth();
  const { openAuth } = useAuthModal();
  const { pro } = usePaymentConfig();

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [platform, setPlatform] = useState("amazon");
  const [lang, setLang] = useState("auto");
  const [format, setFormat] = useState("aplus-web");
  const [text, setText] = useState("");
  const [modules, setModules] = useState<string[]>(
    MODULE_CARDS.filter((m) => m.def).map((m) => m.id)
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [sources, setSources] = useState<SourceImage[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [stage, setStage] = useState<"preparing" | "reviewing" | "generating">("preparing");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(4);
  const [finished, setFinished] = useState(false);
  const [viewing, setViewing] = useState<{ url: string; label: string } | null>(null);
  const [sourceFeedback, setSourceFeedback] = useState<Record<string, string>>({});
  const [zipping, setZipping] = useState(false);
  const [demoLayout, setDemoLayout] = useState<"two-column" | "single-column">(
    "two-column"
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const assistBtnRef = useRef<HTMLButtonElement>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistRun, setAssistRun] = useState<{ mode: "write" | "optimize"; nonce: number } | null>(null);

  const cost = Math.max(modules.length, 1) * POINTS_PER_IMAGE;
  const hasResult = shots.some((s) => s.status === "done");
  const allSourcesApproved =
    sources.length > 0 && sources.every((source) => source.status === "approved");
  const formLocked = !!jobId && !finished;

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      previews.forEach((p) => URL.revokeObjectURL(p));
    };
  }, [previews]);

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const next: File[] = [...files];
    const nextPrev: string[] = [...previews];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_IMAGES) break;
      if (f.size > MAX_UPLOAD) continue;
      next.push(f);
      nextPrev.push(URL.createObjectURL(f));
    }
    setFiles(next);
    setPreviews(nextPrev);
  }
  function removeFile(i: number) {
    URL.revokeObjectURL(previews[i]);
    setFiles(files.filter((_, j) => j !== i));
    setPreviews(previews.filter((_, j) => j !== i));
  }
  function toggleModule(id: string) {
    setModules((cur) =>
      cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]
    );
  }
  function openAssist(mode: "write" | "optimize") {
    if (!files[0]) {
      setError(L("请先上传商品图", "Upload a product image first"));
      return;
    }
    setError(null);
    setAssistOpen(true);
    setAssistRun({ mode, nonce: Date.now() });
  }

  const rememberJob=useImageJobResume("aplus",user?.email,id=> { setJobId(id); setLoading(true); startPolling(id); void refreshJob(id).catch(error=>{setLoading(false);setError(error.message);}); });

  function applyJobState(s: any) {
    if (s.parameters) {
      setPlatform(s.parameters.platform);
      setLang(s.parameters.lang);
      setFormat(s.parameters.format);
      setText(s.parameters.text);
      setModules(s.parameters.modules);
    }
    if (["preparing", "reviewing", "generating"].includes(s.stage)) {
      setStage(s.stage);
    }
    if (Array.isArray(s.sources)) setSources(s.sources);
    if (Array.isArray(s.shots)) setShots(s.shots);
    if (typeof s.done === "number") setDone(s.done);
    if (typeof s.total === "number") setTotal(s.total);
    if (s.status === "pending" || s.status === "awaiting_review") setError(s.error || "");
    if (s.status === "awaiting_review") {
      setLoading(false);
      const sourceWorkPending = Array.isArray(s.sources) && s.sources.some(
        (source: SourceImage) => source.status === "preparing" || source.status === "redoing"
      );
      if (!sourceWorkPending && pollRef.current) clearInterval(pollRef.current);
    }
    if (s.status === "done") {
      setError("");
      rememberJob(null);
      if (pollRef.current) clearInterval(pollRef.current);
      if (s.user) applyServerUser(s.user);
      setFinished(true);
      setLoading(false);
    } else if (s.status === "error") {
      rememberJob(null);
      if (pollRef.current) clearInterval(pollRef.current);
      setError(s.error || L("生成失败,请重试", "Generation failed"));
      setLoading(false);
    }
  }

  async function refreshJob(id: string) {
    const r = await fetch(`/api/aplus?job=${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: await authHeader(),
    });
    const s = await r.json();
    if (!r.ok) { if (r.status===404 || r.status===403) {rememberJob(null);if(pollRef.current) clearInterval(pollRef.current);} throw new Error(s.error || "任务状态获取失败"); }
    applyJobState(s);
    return s;
  }

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void refreshJob(id).catch(() => {
        /* 单次轮询失败忽略 */
      });
    }, 2500);
  }

  async function generate() {
    setError(null);
    if (!user) {
      if (ready) openAuth("sign-in");
      return;
    }
    if (files.length === 0) {
      setError(L("请上传至少一张商品图", "Upload at least one product image"));
      return;
    }
    if (modules.length === 0) {
      setError(L("请至少勾选一个内容模块", "Select at least one content module"));
      return;
    }
    setLoading(true);
    setFinished(false);
    setShots([]);
    setSources([]);
    setJobId(null);
    rememberJob(null);
    setSourceFeedback({});
    setStage("preparing");
    setDone(0);
    setTotal(modules.length);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("image", f));
      if (text.trim()) fd.append("text", text.trim());
      fd.append("platform", platform);
      fd.append("lang", lang);
      fd.append("format", format);
      modules.forEach((m) => fd.append("module", m));
      fd.append("email", user.email);
      const res = await fetch("/api/aplus", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || L("生成失败,请重试", "Generation failed"));
      const jobId: string = data.jobId;
      setJobId(jobId);
      rememberJob(jobId);
      if (data.total) setTotal(data.total);
      startPolling(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : L("生成失败,请重试", "Generation failed"));
      setLoading(false);
    }
  }

  async function updateSource(
    index: number,
    action: "approve_source" | "redo_source"
  ) {
    if (!jobId) return;
    const source = sources[index];
    const feedback = (sourceFeedback[source.id] ?? "").trim();
    if (action === "redo_source" && !feedback) {
      setError("请先填写这张母图需要修改的地方");
      return;
    }
    setError(null);
    if (action === "redo_source") {
      setSources((current) =>
        current.map((item, i) =>
          i === index ? { ...item, status: "redoing", feedback } : item
        )
      );
    }
    try {
      const res = await fetch("/api/aplus", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ jobId, action, sourceIndex: index, feedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      if (data.source) {
        setSources((current) =>
          current.map((item, i) =>
            i === index ? { ...item, ...data.source } : item
          )
        );
      }
      if (action === "redo_source") startPolling(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
      await refreshJob(jobId).catch(() => {});
    }
  }

  async function continueGeneration() {
    if (!jobId || !allSourcesApproved) return;
    setError(null);
    setLoading(true);
    setStage("generating");
    try {
      const res = await fetch("/api/aplus", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ jobId, action: "generate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成启动失败");
      startPolling(jobId);
    } catch (e) {
      setStage("reviewing");
      setLoading(false);
      setError(e instanceof Error ? e.message : "生成启动失败");
    }
  }

  function restartReview() {
    if (pollRef.current) clearInterval(pollRef.current);
    setJobId(null);
    rememberJob(null);
    setSources([]);
    setShots([]);
    setSourceFeedback({});
    setStage("preparing");
    setLoading(false);
    setFinished(false);
    setDone(0);
    setError(null);
  }

  async function downloadAll() {
    const items = shots
      .filter((s) => s.status === "done" && s.url)
      .map((s, i) => ({ url: s.url!, name: `aplus-${s.label}-${i + 1}` }));
    if (!items.length) return;
    setZipping(true);
    try {
      const res = await fetch("/api/suite/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error("zip failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aplus-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      items.forEach((it, i) =>
        setTimeout(() => downloadImage(it.url, it.name), i * 350)
      );
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="w-full px-5 py-6 sm:px-6 lg:px-8">
      {/* 面包屑 */}
      <div className="mb-4">
        <nav className="flex items-center gap-1.5 text-[13px]">
          <Link href="/tools" className="text-c-text3 transition-colors hover:text-c-text">
            创作工具
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-c-text4" />
          <span className="font-semibold text-c-text">A+ 详情页</span>
        </nav>
      </div>

      <div className="grid gap-5 lg:h-[890px] lg:grid-cols-[320px_1fr]">
        {/* 左:参数面板 */}
        <div className="h-fit space-y-5 rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {/* 工具头 */}
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-[10px]" style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}>
              <FileText className="h-[21px] w-[21px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[16px] font-bold text-c-text">A+ 详情页</h1>
              <p className="text-[12px] text-c-text3">
                上传商品图,AI 按模块出高转化详情页
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[12.5px] font-medium text-c-text2">文字规划模型</p>
            <TextModelSelect />
          </div>

          {/* 商品原图 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              商品原图
              <span className="ml-1 text-xs text-c-text3">支持 1-{MAX_IMAGES} 张</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              disabled={formLocked}
              onChange={(e) => pickFiles(e.target.files)}
            />
            <div className="flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div
                  key={src}
                  className="relative h-16 w-16 overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`product ${i + 1}`}
                    className="h-full w-full bg-secondary object-cover"
                  />
                  <button
                    onClick={() => removeFile(i)}
                    disabled={formLocked}
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card/90 text-foreground shadow hover:bg-card"
                    aria-label="移除图片"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {files.length < MAX_IMAGES && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={formLocked}
                  className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border bg-secondary/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-[10px]">上传图片</span>
                </button>
              )}
            </div>
          </div>

          {/* 上架平台 / 语言 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">上架平台</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                disabled={formLocked}
                className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">语言</label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                disabled={formLocked}
                className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 图片比例 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">图片比例</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={formLocked}
              className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            >
              {FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* 商品卖点 & 要求 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">商品卖点 & 要求</label>
              <button
                ref={assistBtnRef}
                type="button"
                onClick={() => openAssist("write")}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-acc hover:underline"
              >
                <Wand2 className="h-3.5 w-3.5" />
                AI帮写
              </button>
            </div>
            <PromptAssistPopup
              open={assistOpen}
              onClose={() => setAssistOpen(false)}
              anchorRef={assistBtnRef}
              tool="suite"
              currentPrompt={text}
              imageFile={files[0] ?? null}
              imageThumb={previews[0] ?? ""}
              run={assistRun}
              onUse={(t2) => setText(t2)}
            />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={formLocked}
              placeholder="建议提供:产品名称、核心优势、目标人群、使用场景、详细参数"
              className="min-h-[88px] w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* 快捷优化项(多选) */}
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <label className="text-sm font-medium">快捷优化项</label>
              <span className="text-[11px] text-c-text3">选择需要的内容模块,可多选</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MODULE_CARDS.map((m) => {
                const on = modules.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleModule(m.id)}
                    disabled={formLocked}
                    className={cn(
                      "rounded-xl border p-2.5 text-left transition-colors",
                      on
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:bg-secondary/40"
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "flex h-4 w-4 flex-none items-center justify-center rounded-[4px] border",
                          on
                            ? "border-primary bg-primary text-white"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {on && (
                          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                            <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span className="text-[12.5px] font-semibold text-c-text">{m.label}</span>
                    </span>
                    <span className="mt-0.5 block pl-[22px] text-[11px] leading-tight text-muted-foreground">
                      {m.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 成本预估 */}
          <div className="rounded-xl bg-secondary/50 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">生成内容</span>
              <span className="font-medium">{modules.length || 0} 个模块</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground">预计消耗</span>
              <span className="font-semibold text-c-text">{cost} 积分</span>
            </div>
          </div>
          {ready && user && pro && (
            <p className="-mt-3 text-right text-xs text-muted-foreground">
              余额: {user.creditsTotal - user.creditsUsed}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* CTA:积分前置 */}
          <button
            type="button"
            onClick={stage === "reviewing" && jobId ? continueGeneration : generate}
            disabled={loading || (stage === "reviewing" && !!jobId && !allSourcesApproved)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white shadow-btn [background:var(--grad-acc)] transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading
              ? stage === "preparing"
                ? "正在提取商品并生成白底母图"
                : `生成中 ${done}/${total}`
              : stage === "reviewing" && jobId
                ? allSourcesApproved
                  ? L(`确认并生成详情页（${cost} 积分）`, `Confirm and generate (${cost} credits)`)
                  : L("请先审核全部白底母图", "Review all source images first")
                : L("提取主体并进入审核", "Extract products for review")}
          </button>

          <p className="text-xs leading-relaxed text-muted-foreground">
            每个模块约 1-2 分钟,期间可留在本页查看进度;生成结果自动存入「作品库」,保留 180 天。
          </p>
        </div>

        {/* 右:结果区 */}
        <div className="flex min-h-[520px] flex-col rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {(loading || stage === "reviewing") && jobId && (
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-c-text">
                {stage === "reviewing" ? "审核白底母图" : "生成进度"}
              </h3>
              <span className="text-xs text-muted-foreground">
                {stage === "preparing"
                  ? "白底母图处理中"
                  : stage === "reviewing"
                    ? `已通过 ${sources.filter((source) => source.status === "approved").length}/${sources.length}`
                    : `${done}/${total}`}
              </span>
            </div>
          )}
          {stage === "reviewing" && sources.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 border-y border-c-border py-3 text-[12px] leading-5 text-c-text3">
                <p>逐张放大核对主体、包装文字和边缘。合格的直接通过；不合格的填写要求，只重做当前这一张。</p>
                <button
                  type="button"
                  onClick={restartReview}
                  className="flex-none font-medium text-c-text hover:underline"
                >
                  重新上传
                </button>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {sources.map((source, index) => (
                  <section
                    key={source.id}
                    className="grid gap-3 border-b border-c-border pb-4 sm:grid-cols-[150px_1fr]"
                  >
                    <button
                      type="button"
                      disabled={!source.url}
                      onClick={() =>
                        source.url && setViewing({ url: source.url, label: source.label })
                      }
                      className="relative aspect-[2/3] overflow-hidden border border-c-border bg-white text-left disabled:cursor-default"
                    >
                      {source.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={source.url}
                          alt={source.label}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center bg-c-subtle2 text-c-text4">
                          <Loader2 className="h-5 w-5 animate-spin" />
                        </span>
                      )}
                      {source.url && (
                        <span className="absolute bottom-2 left-2 bg-slate-900/75 px-2 py-1 text-[10px] font-medium text-white">
                          点击放大 · v{source.version}
                        </span>
                      )}
                    </button>
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold text-c-text">{source.label}</p>
                        <span
                          className={cn(
                            "text-[11px] font-medium",
                            source.status === "approved"
                              ? "text-emerald-600"
                              : source.status === "error"
                                ? "text-red-600"
                                : "text-c-text3"
                          )}
                        >
                          {source.status === "approved"
                            ? "已通过"
                            : source.status === "redoing"
                              ? "重做中"
                              : source.status === "error"
                                ? "生成失败"
                                : "待审核"}
                        </span>
                      </div>
                      {source.error && (
                        <p className="mt-2 text-[11px] leading-4 text-red-600">{source.error}</p>
                      )}
                      <textarea
                        value={sourceFeedback[source.id] ?? source.feedback ?? ""}
                        onChange={(e) =>
                          setSourceFeedback((current) => ({
                            ...current,
                            [source.id]: e.target.value,
                          }))
                        }
                        disabled={source.status === "redoing"}
                        placeholder="例如：保留瓶盖文字，主体完整露出，四周增加留白"
                        className="mt-3 min-h-[78px] w-full border border-c-border bg-c-subtle2 px-3 py-2 text-[12px] leading-5 outline-none focus:border-primary disabled:opacity-60"
                      />
                      {(source.history?.length ?? 0) > 1 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-c-text3">
                          <span>返工记录</span>
                          {source.history!.map((revision) => (
                            <button
                              key={revision.version}
                              type="button"
                              title={revision.feedback}
                              onClick={() =>
                                setViewing({
                                  url: revision.url,
                                  label: `${source.label} v${revision.version}`,
                                })
                              }
                              className="border-b border-c-text4 font-medium text-c-text hover:border-c-text"
                            >
                              v{revision.version}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateSource(index, "approve_source")}
                          disabled={!source.url || source.status === "redoing" || source.status === "approved"}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 border border-emerald-600 px-3 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {source.status === "approved" ? "已通过" : "通过"}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSource(index, "redo_source")}
                          disabled={source.status === "redoing"}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 border border-c-border px-3 text-[12px] font-semibold text-c-text transition-colors hover:bg-c-subtle2 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {source.status === "redoing" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          打回重做
                        </button>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}

          {!hasResult && !loading && stage !== "reviewing" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-c-text">
                  {L("示例预览", "Preview")}
                </h2>
                <div className="inline-flex rounded-[10px] border border-c-border bg-c-subtle2 p-1">
                  <button
                    type="button"
                    onClick={() => setDemoLayout("two-column")}
                    className={cn(
                      "rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors",
                      demoLayout === "two-column"
                        ? "bg-c-card text-c-text shadow-sm"
                        : "text-c-text3 hover:text-c-text"
                    )}
                  >
                    {L("双列预览", "Two columns")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoLayout("single-column")}
                    className={cn(
                      "rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors",
                      demoLayout === "single-column"
                        ? "bg-c-card text-c-text shadow-sm"
                        : "text-c-text3 hover:text-c-text"
                    )}
                  >
                    {L("单列长图", "Long page")}
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[14px] border border-c-border bg-c-subtle2 p-3 sm:p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    demoLayout === "two-column"
                      ? "/demos/aplus/showcase-two-column.png"
                      : "/demos/aplus/showcase-single-column.png"
                  }
                  alt={
                    demoLayout === "two-column"
                      ? L("A+ 详情页双列分栏示例", "Two-column A+ page example")
                      : L("A+ 详情页单列长图示例", "Single-column A+ page example")
                  }
                  className={cn(
                    "max-h-[720px] max-w-full object-contain",
                    demoLayout === "two-column" ? "w-full" : "h-full"
                  )}
                />
              </div>
              <p className="mt-3 text-center text-[11px] text-c-text4">
                {L("示例为 AI 生成素材,实际结果以商品图为准", "AI-generated example; actual results depend on the product images")}
              </p>
            </div>
          )}

          {(hasResult || loading) && shots.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-c-text">详情页模块</h3>
                {finished && (
                  <button
                    type="button"
                    onClick={downloadAll}
                    disabled={zipping}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-1.5 text-[12.5px] font-medium text-c-text transition-colors hover:bg-secondary"
                  >
                    {zipping ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    打包下载
                  </button>
                )}
              </div>
              <div
                className={cn(
                  sources.length > 0
                    ? "grid items-center gap-3 md:grid-cols-[150px_30px_1fr]"
                    : ""
                )}
              >
                {sources.length > 0 && (
                  <div className="space-y-2 rounded-xl bg-secondary/45 p-2.5">
                    <p className="text-center text-[11px] font-semibold text-c-text3">
                      白底商品母图
                    </p>
                    {sources.map((source) => (
                      <div
                        key={source.id}
                        className="relative aspect-[2/3] overflow-hidden rounded-[10px] border border-border bg-white"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={source.url}
                          alt={source.label}
                          className="h-full w-full object-contain"
                        />
                        <span className="absolute bottom-1.5 left-1.5 rounded-[5px] bg-black/65 px-1.5 py-0.5 text-[9px] font-medium text-white">
                          {source.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {sources.length > 0 && (
                  <ArrowRight className="mx-auto h-5 w-5 text-c-text4" />
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {shots.map((s) => (
                  <div
                    key={s.id}
                    className="group relative overflow-hidden rounded-xl border border-border bg-card"
                  >
                    {s.status === "done" && s.url ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.url}
                          alt={s.label}
                          className={cn(
                            "w-full cursor-zoom-in object-cover",
                            aspectFor(format)
                          )}
                          onClick={() => setViewing({ url: s.url!, label: s.label })}
                        />
                        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {s.label}
                        </span>
                      </>
                    ) : s.status === "error" ? (
                      <div
                        className={cn(
                          "flex w-full items-center justify-center bg-red-500/5 text-[12px] text-red-500",
                          aspectFor(format)
                        )}
                      >
                        生成失败
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "flex w-full items-center justify-center bg-secondary/40 text-muted-foreground",
                          aspectFor(format)
                        )}
                      >
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    )}
                  </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {viewing && (
            <ImageLightbox
              src={viewing.url}
              alt={viewing.label}
              downloadName={viewing.label}
              onClose={() => setViewing(null)}
            />
          )}
        </div>
      </div>

      {/* 底部小字:记录提示(对齐其它工具页) */}
      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-c-text3">
        <Clock className="h-3.5 w-3.5" />
        生成结果与「作品库」同步,可在作品页按模块筛选与下载。
      </p>
    </div>
  );
}
