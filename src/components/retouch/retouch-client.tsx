"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Eraser,
  ChevronRight,
  Clock,
  Download,
  Focus,
  Loader2,
  Palette,
  Rotate3d,
  Sparkles,
  Sun,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";
import { POINTS_PER_IMAGE } from "@/lib/mock-data";
import { ToolDemo, getDemo } from "@/components/tools/tool-demo";

// ---------------------------------------------------------------------------
// AI 商品精修工作台(对标竞品 产品精修):
// 商品原图(1 张) + 快捷优化项多选(光泽/瑕疵/清晰度/色彩/透视) + 补充要求
// → 图生图单张精修,原图/精修图对比展示,积分前置 CTA。
// ---------------------------------------------------------------------------

const MAX_UPLOAD = 12 * 1024 * 1024;

const OPT_CARDS = [
  { id: "gloss", label: "增强产品光泽", Icon: Sun },
  { id: "blemish", label: "修复划痕瑕疵", Icon: Eraser },
  { id: "clarity", label: "提升整体清晰度", Icon: Focus },
  { id: "color", label: "色彩校正", Icon: Palette },
  { id: "perspective", label: "修正透视变形", Icon: Rotate3d },
];

export function RetouchClient() {
  const L = (z: string, e: string) =>
    typeof window !== "undefined" && document.documentElement.lang === "en" ? e : z;
  const { user, ready, applyServerUser } = useAuth();
  const { openAuth } = useAuthModal();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [options, setOptions] = useState<string[]>(["gloss", "blemish", "clarity"]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cost = POINTS_PER_IMAGE;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickFile(f: File | null) {
    if (!f || f.size > MAX_UPLOAD) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
  }
  function toggleOpt(id: string) {
    setOptions((cur) =>
      cur.includes(id) ? cur.filter((o) => o !== id) : [...cur, id]
    );
  }

  async function generate() {
    setError(null);
    if (!user) {
      if (ready) openAuth("sign-in");
      return;
    }
    if (!file) {
      setError(L("请上传商品原图", "Upload a product image"));
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      options.forEach((o) => fd.append("option", o));
      if (text.trim()) fd.append("text", text.trim());
      fd.append("email", user.email);
      const res = await fetch("/api/retouch", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || L("精修失败,请重试", "Retouch failed"));
      }
      if (data.user) applyServerUser(data.user);
      setResult(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : L("精修失败,请重试", "Retouch failed"));
    } finally {
      setLoading(false);
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
          <span className="font-semibold text-c-text">产品精修</span>
        </nav>
      </div>

      <div className="grid gap-5 lg:h-[890px] lg:grid-cols-[320px_1fr]">
        {/* 左:参数面板 */}
        <div className="h-fit space-y-5 rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {/* 工具头 */}
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-[10px]" style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}>
              <Sparkles className="h-[21px] w-[21px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[16px] font-bold text-c-text">产品精修</h1>
              <p className="text-[12px] text-c-text3">
                AI 分析并优化画质、去除瑕疵、增强细节
              </p>
            </div>
          </div>

          {/* 商品原图(1 张) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              商品原图
              <span className="ml-1 text-xs text-c-text3">支持 1 张图片</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            {preview ? (
              <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="商品原图"
                  className="h-full w-full bg-secondary object-cover"
                />
                <button
                  onClick={() => {
                    URL.revokeObjectURL(preview);
                    setPreview("");
                    setFile(null);
                  }}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-card/90 text-foreground shadow hover:bg-card"
                  aria-label="移除图片"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border bg-secondary/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Upload className="h-4 w-4" />
                <span className="text-[10px]">上传图片</span>
              </button>
            )}
          </div>

          {/* 快捷优化项(多选) */}
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <label className="text-sm font-medium">快捷优化项</label>
              <span className="text-[11px] text-c-text3">选择常用优化方向,可多选</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {OPT_CARDS.map((o) => {
                const on = options.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggleOpt(o.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition-colors",
                      on
                        ? "border-primary/60 bg-primary/5"
                        : "border-border hover:bg-secondary/40"
                    )}
                  >
                    <o.Icon
                      className={cn(
                        "h-5 w-5",
                        on ? "text-primary" : "text-muted-foreground"
                      )}
                      strokeWidth={1.8}
                    />
                    <span
                      className={cn(
                        "text-[11.5px] leading-tight",
                        on ? "font-semibold text-c-text" : "text-muted-foreground"
                      )}
                    >
                      {o.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 补充要求 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">补充要求</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="选填,例如:去除背景杂物、增强产品光泽、修复划痕、提升整体清晰度等"
              className="min-h-[72px] w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
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
              ? L("精修生成中,约 1 分钟", "Retouching, ~1 min")
              : L(`生成商品精修（预计 ${cost} 积分）`, `Retouch now (~${cost} credits)`)}
          </button>

          <p className="text-xs leading-relaxed text-muted-foreground">
            单张约 1 分钟,生成结果自动存入「作品库」,保留 180 天。
          </p>
        </div>

        {/* 右:结果区(原图/精修图 对比) */}
        <div className="flex min-h-[520px] flex-col rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-c-text3" />
              <p className="text-[13.5px] text-muted-foreground">
                {L(
                  "AI 正在分析并优化商品画质,约 1 分钟…",
                  "Analyzing and enhancing your product photo, ~1 min…"
                )}
              </p>
            </div>
          )}
          {!loading && !result && (
            <ToolDemo {...getDemo("retouch")!} notice />
          )}
          {!loading && result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-c-text">精修结果</h3>
                <a
                  href={result}
                  download="retouch.png"
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-1.5 text-[12.5px] font-medium text-c-text transition-colors hover:bg-secondary"
                >
                  <Download className="h-3.5 w-3.5" />
                  下载
                </a>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="relative overflow-hidden rounded-xl border border-border bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="原图"
                    className="aspect-square w-full object-cover"
                  />
                  <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    原图
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-xl border border-border bg-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={result}
                    alt="精修图"
                    className="aspect-square w-full cursor-zoom-in object-cover"
                    onClick={() => setViewing(true)}
                  />
                  <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    精修图
                  </span>
                </div>
              </div>
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
                alt="精修图"
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
