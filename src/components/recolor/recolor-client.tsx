"use client";
import {useFeatureBilling} from "@/lib/billing/preview";
import { useImageQuality } from "@/lib/image-quality-context";
import { ImageQualityControl } from "@/components/image-quality-control";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Clock,
  Download,
  Droplet,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";
import { ToolDemo, getDemo } from "@/components/tools/tool-demo";

// ---------------------------------------------------------------------------
// AI 产品换色工作台(对标竞品 产品换色):
// 商品原图(1 张) + 目标颜色(色板/取色器/HEX) + 强度 → 图生图只换色,
// 原图/换色效果对比展示,积分前置 CTA。
// ---------------------------------------------------------------------------

const MAX_UPLOAD = 12 * 1024 * 1024;

const PRESETS = [
  "#C0392B", "#E67E22", "#F1C40F", "#27AE60", "#16A085",
  "#2E86DE", "#8E44AD", "#E84393", "#7F5539", "#16181D",
];

export function RecolorClient() {
  const billing=useFeatureBilling("tool.recolor",{});
  const { costPerImage } = useImageQuality();
  const L = (z: string, e: string) =>
    typeof window !== "undefined" && document.documentElement.lang === "en" ? e : z;
  const { user, ready, applyServerUser } = useAuth();
  const { openAuth } = useAuthModal();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [color, setColor] = useState("#2E86DE");
  const [strength, setStrength] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cost = billing.cost;

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
      fd.append("color", color);
      fd.append("strength", String(strength));
      fd.append("email", user.email);
      const res = await billing.submit("/api/recolor", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || L("换色失败,请重试", "Recolor failed"));
      }
      if (data.user) applyServerUser(data.user);
      setResult(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : L("换色失败,请重试", "Recolor failed"));
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
          <span className="font-semibold text-c-text">产品换色</span>
        </nav>
      </div>

      <div className="grid gap-5 lg:h-[890px] lg:grid-cols-[320px_1fr]">
        {/* 左:参数面板 */}
        <div className="h-fit space-y-5 rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {/* 工具头 */}
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-[10px]" style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}>
              <Droplet className="h-[21px] w-[21px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[16px] font-bold text-c-text">产品换色</h1>
              <p className="text-[12px] text-c-text3">
                选择目标颜色,AI 即刻为商品换上新配色
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

          {/* 目标颜色 */}
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <label className="text-sm font-medium">目标颜色</label>
              <span className="text-[11px] text-c-text3">选择要替换成的目标颜色</span>
            </div>
            {/* 常用色板 */}
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={cnColor(c, color)}
                  style={{ background: c }}
                />
              ))}
              {/* 自定义取色器 */}
              <label
                className="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-border"
                style={{
                  background:
                    "conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
                }}
                title="自定义颜色"
              >
                <span className="absolute inset-[3px] rounded-[4px] bg-card" />
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            {/* HEX 输入 + 当前色块 */}
            <div className="flex items-center gap-2">
              <span
                className="h-9 w-9 flex-none rounded-lg border border-border"
                style={{ background: color }}
              />
              <div className="flex h-9 flex-1 items-center rounded-[10px] border border-border bg-secondary px-3">
                <span className="text-xs font-medium text-muted-foreground">HEX</span>
                <input
                  value={color.replace("#", "").toUpperCase()}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
                    if (v.length === 6) setColor(`#${v.toLowerCase()}`);
                  }}
                  className="ml-2 w-full bg-transparent text-sm uppercase outline-none"
                  placeholder="2E86DE"
                />
              </div>
            </div>
            {/* 强度 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                <span>{L("换色强度", "Strength")}</span>
                <span className="font-medium text-c-text2">{strength}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                className="w-full accent-[#4F46E5]"
              />
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
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white shadow-btn [background:var(--grad-acc)] transition-all hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading
              ? L("换色生成中,约 1 分钟", "Recoloring, ~1 min")
              : L(`生成产品换色（预计 ${cost} 积分）`, `Recolor now (~${cost} credits)`)}
          </button>

          <p className="text-xs leading-relaxed text-muted-foreground">
            单张约 1 分钟,生成结果自动存入「作品库」,保留 180 天。
          </p>
        </div>

        {/* 右:结果区(原图/换色效果 对比) */}
        <div className="flex min-h-[520px] flex-col rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
          {loading && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-c-text3" />
              <p className="text-[13.5px] text-muted-foreground">
                {L("正在为商品换上新配色,约 1 分钟…", "Recoloring your product, ~1 min…")}
              </p>
            </div>
          )}
          {!loading && !result && (
            <ToolDemo {...getDemo("recolor")!} notice />
          )}
          {!loading && result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-c-text">换色效果</h3>
                <a
                  href={result}
                  download="recolor.png"
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
                    alt="换色效果"
                    className="aspect-square w-full cursor-zoom-in object-cover"
                    onClick={() => setViewing(true)}
                  />
                  <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    换色效果
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
                alt="换色效果"
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

function cnColor(c: string, current: string) {
  const base =
    "h-7 w-7 rounded-md border transition-transform hover:scale-110";
  return c === current
    ? `${base} border-primary ring-2 ring-primary/30 scale-110`
    : `${base} border-border`;
}
