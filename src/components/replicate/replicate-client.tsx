"use client";

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
import { usePaymentConfig } from "@/lib/payment-context";
import { authHeader } from "@/lib/supabase";
import { POINTS_PER_IMAGE } from "@/lib/mock-data";
import { PromptAssistPopup } from "@/components/tools/prompt-assist-popup";

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
  const L = (z: string, e: string) =>
    typeof window !== "undefined" && document.documentElement.lang === "en" ? e : z;
  const { user, ready, applyServerUser } = useAuth();
  const { openAuth } = useAuthModal();
  const { pro } = usePaymentConfig();

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
  const [result, setResult] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const assistBtnRef = useRef<HTMLButtonElement>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistRun, setAssistRun] = useState<{ mode: "write" | "optimize"; nonce: number } | null>(null);

  const cost = POINTS_PER_IMAGE;

  useEffect(() => {
    return () => {
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
  function pickRef(f: File | null) {
    if (!f || f.size > MAX_UPLOAD) return;
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRef(f);
    setRefPreview(URL.createObjectURL(f));
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
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("image", f));
      fd.append("ref", ref);
      fd.append("degree", degree);
      if (text.trim()) fd.append("text", text.trim());
      fd.append("platform", platform);
      fd.append("lang", lang);
      fd.append("email", user.email);
      const res = await fetch("/api/replicate", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || L("复刻失败,请重试", "Replication failed"));
      }
      if (data.user) applyServerUser(data.user);
      setResult(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : L("复刻失败,请重试", "Replication failed"));
    } finally {
      setLoading(false);
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

      <div className="grid gap-5 lg:h-[890px] lg:grid-cols-[320px_1fr]">
        {/* 左:参数面板 */}
        <div className="h-fit space-y-5 rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
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
                  <img
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
                <img
                  src={refPreview}
                  alt="参考图"
                  className="h-full w-full bg-secondary object-cover"
                />
                <button
                  onClick={() => {
                    URL.revokeObjectURL(refPreview);
                    setRefPreview("");
                    setRef(null);
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
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
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

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* CTA:积分前置 */}
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white shadow-btn [background:var(--grad-acc)] transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading
              ? L("复刻生成中,约 1 分钟", "Generating, ~1 min")
              : L(`一键复刻生成（预计 ${cost} 积分）`, `Replicate now (~${cost} credits)`)}
          </button>

          <p className="text-xs leading-relaxed text-muted-foreground">
            单张约 1 分钟,生成结果自动存入「作品库」,保留 180 天。
          </p>
        </div>

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
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-c-text3">
                <Flame className="h-6 w-6" />
              </span>
              <div>
                <h2 className="text-[17px] font-bold text-c-text">爆款图复刻</h2>
                <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
                  上传一张卖得爆的参考图和你的商品原图,AI
                  将把你的商品复刻为同款风格、同款构图的电商图。
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
                <span className="rounded-full border border-border px-2.5 py-1">构图复刻</span>
                <span className="rounded-full border border-border px-2.5 py-1">风格迁移</span>
                <span className="rounded-full border border-border px-2.5 py-1">文案本地化</span>
              </div>
            </div>
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
                <img
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
              <img
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
