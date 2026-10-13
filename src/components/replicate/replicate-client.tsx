"use client";
import { CachedImage } from "@/components/cached-image";
import {toolImageError} from "@/lib/tool-ui";
import {SelectMenu} from "@/components/ui/select-menu";
import {useFeatureBilling} from "@/lib/billing/preview";
import { useImageQuality } from "@/lib/image-quality-context";
import { ImageQualityControl } from "@/components/image-quality-control";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Clock,
  Download,
  FileText,
  Flame,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";
import { PromptAssistPopup } from "@/components/tools/prompt-assist-popup";
import { ToolDemo, getDemo } from "@/components/tools/tool-demo";
import { readToolResponse } from "@/lib/tool-response";
import { TextModelSelect } from "@/components/ui/text-model-select";

// ---------------------------------------------------------------------------
// 爆款图复刻工作台(对标竞品 爆款复刻):
// 商品原图(1-3) + 爆款参考图(1) + 复刻程度(参考风格/高度复刻) + 补充要求 +
// 上架平台/语言 → 图生图单张出图,积分前置 CTA。
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

export function ReplicateClient() {
  const billing=useFeatureBilling("tool.replicate",{});
  const { costPerImage } = useImageQuality();
  const L = (z: string, e: string) =>
    typeof window !== "undefined" && document.documentElement.lang === "en" ? e : z;
  const { user, ready, applyServerUser } = useAuth();
  const { openAuth } = useAuthModal();

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [ref, setRef] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState("");
  const [degree, setDegree] = useState<"high" | "style">("high");
  const [text, setText] = useState("");
  const [platform, setPlatform] = useState("amazon");
  const [lang, setLang] = useState("auto");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [reversePrompt, setReversePrompt] = useState("");
  const operationRef = useRef(false);
  const [result, setResult] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const assistBtnRef = useRef<HTMLButtonElement>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistRun, setAssistRun] = useState<{ mode: "write" | "optimize"; nonce: number } | null>(null);

  const cost = billing.cost;

  const previewUrlsRef = useRef<string[]>([]);
  previewUrlsRef.current = [...previews, refPreview].filter(Boolean);
  useEffect(() => () => previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url)), []);

  function pickFiles(list: FileList | null) {
    if (!list || operationRef.current) return;
    const next: File[] = [...files];
    const nextPrev: string[] = [...previews];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_IMAGES) break;
      if (toolImageError(f, MAX_UPLOAD)) { setError(L("请选择12MB以内的PNG / JPG / WebP图片", "Choose a PNG / JPG / WebP under 12MB")); continue; }
      next.push(f);
      nextPrev.push(URL.createObjectURL(f));
    }
    setFiles(next);
    setPreviews(nextPrev);
    if (fileRef.current) fileRef.current.value = "";
  }
  function removeFile(i: number) {
    URL.revokeObjectURL(previews[i]);
    setFiles(files.filter((_, j) => j !== i));
    setPreviews(previews.filter((_, j) => j !== i));
  }
  function pickRef(f: File | null) {
    if (!f || operationRef.current) return;
    if (refFileRef.current) refFileRef.current.value = "";
    if (toolImageError(f, MAX_UPLOAD)) { setError(L("参考图请控制在 12MB 以内", "Reference image must be under 12MB")); return; }
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRef(f);
    setRefPreview(URL.createObjectURL(f));
    setReversePrompt("");
    setError(null);
  }
  async function requestAnalysis(reference: File) {
    setAnalyzing(true);
    try {
      const fd = new FormData(); fd.append("ref", reference);
      const response = await fetch("/api/replicate/analyze", { method: "POST", headers: await authHeader(), body: fd });
      const data = await readToolResponse<{ prompt: string }>(response);
      if (typeof data.prompt !== "string" || !data.prompt.trim()) throw new Error(L("未获得有效提示词，请重试", "No valid prompt returned. Please retry"));
      setReversePrompt(data.prompt);
      return data.prompt;
    } finally { setAnalyzing(false); }
  }
  async function analyzeReference() {
    if (operationRef.current || !ref) return;
    if (!user) { if (ready) openAuth("sign-in"); return; }
    operationRef.current = true;
    setError(null);
    try { await requestAnalysis(ref); }
    catch (e) { setError(e instanceof Error ? e.message : L("参考图分析失败，请重试", "Reference analysis failed")); }
    finally { operationRef.current = false; }
  }
  function openAssist(mode: "write" | "optimize") {
    if (!files[0]) {
      setError(L("请先上传商品原图", "Upload a product image first"));
      return;
    }
    setError(null);
    setAssistOpen(true);
    setAssistRun({ mode, nonce: Date.now() });
  }

  async function generate() {
    if (operationRef.current) return;
    setError(null);
    if (!user) {
      if (ready) openAuth("sign-in");
      return;
    }
    if (files.length === 0) {
      setError(L("请上传商品原图", "Upload a product image"));
      return;
    }
    if (!ref) {
      setError(L("请上传一张爆款参考图", "Upload a reference image"));
      return;
    }
    operationRef.current = true;
    setLoading(true);
    setResult(null);
    try {
      // Separate analysis and generation requests keep their time budgets independent.
      const prompt = reversePrompt.trim() || await requestAnalysis(ref);
      const fd = new FormData();
      files.forEach((f) => fd.append("image", f));
      fd.append("ref", ref);
      fd.append("degree", degree);
      fd.append("reversePrompt", prompt);
      if (text.trim()) fd.append("text", text.trim());
      fd.append("platform", platform);
      fd.append("lang", lang);
      fd.append("email", user.email);
      const res = await billing.submit("/api/replicate", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const data = await readToolResponse<{ ok: boolean; url: string; error?: string; user?: Parameters<typeof applyServerUser>[0] }>(res);
      if (!data.ok || !data.url) {
        throw new Error(data.error || L("复刻失败,请重试", "Replication failed"));
      }
      if (data.user) applyServerUser(data.user);
      setResult(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : L("复刻失败,请重试", "Replication failed"));
    } finally {
      setLoading(false);
      operationRef.current = false;
    }
  }

  const degreeCards: { id: "style" | "high"; label: string; desc: string }[] = [
    {
      id: "style",
      label: L("参考风格", "Style reference"),
      desc: L("参考整体风格和结构,自动调整色彩和重构场景", "Borrow mood & palette; AI rebuilds the scene"),
    },
    {
      id: "high",
      label: L("高度复刻", "High fidelity"),
      desc: L("参照参考图视觉结构替换产品和文案,场景细节略有差异", "Match composition; swap product & copy"),
    },
  ];

  return (
    <div className="w-full px-5 py-6 sm:px-6 lg:px-8">
      {/* 面包屑 */}
      <div className="mb-4">
        <nav className="flex items-center gap-1.5 text-[13px]">
          <Link href="/tools" className="text-c-text3 transition-colors hover:text-c-text">
            创作工具
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-c-text4" />
          <span className="font-semibold text-c-text">爆款复刻</span>
        </nav>
      </div>

      <div className="grid gap-5 tool-layout-grid lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* 左:参数面板 */}
        <fieldset disabled={loading || analyzing} className="min-w-0 h-fit space-y-5 rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {/* 工具头 */}
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-[10px]" style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}>
              <Flame className="h-[21px] w-[21px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[16px] font-bold text-c-text">爆款复刻</h1>
              <p className="text-[12px] text-c-text3">
                上传参考图和商品原图,AI 复刻同款风格电商图
              </p>
            </div>
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
              onChange={(e) => pickFiles(e.target.files)}
            />
            <div className="flex flex-wrap gap-2">
              {previews.map((src, i) => (
                <div
                  key={src}
                  className="relative h-16 w-16 overflow-hidden rounded-lg border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <CachedImage
                    src={src}
                    alt={`product ${i + 1}`}
                    className="h-full w-full bg-secondary object-cover"
                  />
                  <button
                    onClick={() => removeFile(i)}
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
                  className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border bg-secondary/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Upload className="h-4 w-4" />
                  <span className="text-[10px]">上传图片</span>
                </button>
              )}
            </div>
          </div>

          {/* 参考图(爆款图) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              参考图<span className="ml-1 text-xs text-c-text3">（爆款图,1 张）</span>
            </label>
            <input
              ref={refFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => pickRef(e.target.files?.[0] ?? null)}
            />
            {refPreview ? (
              <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <CachedImage
                  src={refPreview}
                  alt="参考图"
                  className="h-full w-full bg-secondary object-cover"
                />
                <button
                  onClick={() => {
                    URL.revokeObjectURL(refPreview);
                    setRefPreview("");
                    setRef(null);
                    setReversePrompt("");
                  }}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card/90 text-foreground shadow hover:bg-card"
                  aria-label="移除参考图"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => refFileRef.current?.click()}
                className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border bg-secondary/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Upload className="h-4 w-4" />
                <span className="text-[10px]">上传参考图</span>
              </button>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="replicate-reverse-prompt" className="text-sm font-medium">{L("逆向提示词", "Reverse prompt")}</label>
              <button type="button" disabled={!ready || !ref || analyzing || loading} onClick={() => void analyzeReference()} className="inline-flex items-center gap-1 text-xs font-medium text-c-text disabled:opacity-40">
                {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {analyzing ? L("分析中…", "Analyzing…") : reversePrompt ? L("重新反推", "Analyze again") : L("反推参考图", "Analyze reference")}
              </button>
            </div>
            <TextModelSelect compact />
            <textarea id="replicate-reverse-prompt" value={reversePrompt} onChange={e => setReversePrompt(e.target.value)} maxLength={8000} placeholder={L("先反推参考图，再编辑构图、配色、光线和排版。留空生成时会自动反推。", "Analyze the reference, then edit composition, colors, lighting and layout. A blank prompt is analyzed automatically on generation.")} className="min-h-[120px] w-full rounded-lg border border-c-border bg-white px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />
          </div>

          {/* 复刻程度 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">复刻程度</label>
            <div className="space-y-2">
              {degreeCards.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDegree(d.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    degree === d.id
                      ? "border-primary/60 bg-primary/5"
                      : "border-border hover:bg-secondary/40"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border",
                      degree === d.id
                        ? "border-primary"
                        : "border-muted-foreground/40"
                    )}
                  >
                    {degree === d.id && (
                      <span className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-c-text">{d.label}</span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                      {d.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 补充要求 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">补充要求</label>
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
              placeholder="选填,例如:去除背景杂物、增强产品光泽、修复划痕、提升整体清晰度等"
              className="min-h-[72px] w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* 上架平台 / 语言 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">上架平台</label>
              <SelectMenu label="上架平台" value={platform} onChange={setPlatform} className="w-full" options={PLATFORMS.map((p) => ({value:p.id,label:p.label}))} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">语言</label>
              <SelectMenu label="语言" value={lang} onChange={setLang} className="w-full" options={LANGS.map((l) => ({value:l.id,label:l.label}))} />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* CTA:积分前置 */}
          <ImageQualityControl disabled={loading} />
            <button
            type="button"
            onClick={generate}
            disabled={!ready || loading || analyzing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white shadow-btn [background:var(--grad-acc)] transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading
              ? analyzing ? L("正在反推参考图…", "Analyzing reference…") : L("复刻生成中…", "Generating…")
              : L(`一键复刻生成（预计 ${cost} 积分）`, `Replicate now (~${cost} credits)`)}
          </button>

          <p className="text-xs leading-relaxed text-muted-foreground">
            单张约 1 分钟,生成结果自动存入「作品库」,保留 180 天。
          </p>
        </fieldset>

        {/* 右:结果区 */}
        <div className="flex min-h-[520px] flex-col rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-c-text3" />
              <p className="text-[13.5px] text-muted-foreground">
                {L(
                  "正在参照爆款图复刻你的产品,约 1 分钟…",
                  "Replicating your product in the reference style, ~1 min…"
                )}
              </p>
            </div>
          )}
          {!loading && !result && (
            <ToolDemo {...getDemo("replicate")!} notice />
          )}
          {!loading && result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-c-text">复刻结果</h3>
                <a
                  href={result}
                  download="replicate.png"
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-1.5 text-[12.5px] font-medium text-c-text transition-colors hover:bg-secondary"
                >
                  <Download className="h-3.5 w-3.5" />
                  下载
                </a>
              </div>
              <div className="relative mx-auto max-w-xl overflow-hidden rounded-xl border border-border bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <CachedImage
                  src={result}
                  alt="复刻结果"
                  className="w-full cursor-zoom-in"
                  onClick={() => setViewing(true)}
                />
              </div>
              <p className="text-center text-[11px] text-c-text4">
                {L(
                  "构图与风格来自你的参考图,产品来自你的商品原图。",
                  "Composition from the reference; product from your photos."
                )}
              </p>
            </div>
          )}

          {/* 大图查看 */}
          {viewing && result && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-8 backdrop-blur-sm"
              onClick={() => setViewing(false)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <CachedImage
                src={result}
                alt="复刻结果"
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-c-text3">
        <Clock className="h-3.5 w-3.5" />
        生成结果与「作品库」同步,可在作品页查看与下载。
      </p>
    </div>
  );
}
