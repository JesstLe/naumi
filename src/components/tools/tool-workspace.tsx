"use client";
import { browserImageArchive } from "@/lib/browser-image-archive";
import { readBrowserImage } from "@/lib/browser-image-cache";
import { CachedImage } from "@/components/cached-image";
import type { FeatureId } from "@/lib/billing/types";
import {toolImageError, toolSourceUrl} from "@/lib/tool-ui";
import { X } from "lucide-react";
import { FeatureModelSelect } from "./feature-model-select";
import { useFeatureModels } from "@/lib/model-config/feature-client";
import { featureExecutionBlock, featureExecutionMessage } from "@/lib/model-config/feature-availability";
import {useFeatureBilling} from "@/lib/billing/preview";
import {CATEGORY_FEATURES} from "@/lib/billing/feature-map";
import { ImageQualityControl, QUALITY_TOOL_CATEGORIES } from "@/components/image-quality-control";

import { cdnUrl } from "@/lib/cdn";
import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  Clock,
  Download,
  Upload,
  Loader2,
  ImageIcon,
  Check,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { Media } from "@/components/media";
import { GenLoader } from "@/components/gen-loader";
import { ImageLightbox } from "@/components/image-lightbox";
import { RecordPager, RECORDS_PER_PAGE } from "@/components/tools/record-pager";
import { ToolDemo, getDemo } from "@/components/tools/tool-demo";
import { authHeader } from "@/lib/supabase";
import { useAuth, type SessionUser } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { downloadImage } from "@/lib/download";
import { cn } from "@/lib/utils";
import { useClipboardImagePaste } from "@/lib/clipboard-images";

export type ToolProcessResult = {
  url: string;
  user?: SessionUser | null;
  creditsUsed?: number;
};

type RecordItem = {
  id: string;
  url: string;
  prompt?: string;
  source?: string;
  gradient?: string;
};

// 透明棋盘格(抠图类效果图底)。
const CHECKER: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg,#dfe3e8 25%,transparent 25%),linear-gradient(-45deg,#dfe3e8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#dfe3e8 75%),linear-gradient(-45deg,transparent 75%,#dfe3e8 75%)",
  backgroundSize: "18px 18px",
  backgroundPosition: "0 0,0 9px,9px -9px,-9px 0",
  backgroundColor: "#fff",
};

/** 工具参数 chip 组(首项默认填充 accent 白字,其余 c-subtle)。 */
export function ToolChips({
  label,
  options,
  value,
  onChange,
  accent = "var(--acc)",
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  accent?: string;
}) {
  return (
    <div>
      <p className="mb-2 text-[12.5px] font-medium text-c-text2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "min-h-9 rounded-[10px] px-3.5 py-2 text-[13px] font-medium transition-colors",
                active ? "text-white" : "bg-c-subtle text-c-text2 hover:bg-c-subtle2"
              )}
              style={active ? { background: accent } : undefined}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 通用工具工作台(spec C.4):左 320 参数 / 中 1fr 处理结果(原图·效果对比)/ 右 280 本工具记录。
 * - 处理结果里的图可点击放大(全屏查看)。
 * - 右栏「本工具记录」按 category 拉本人作品:点图=载入中间看原图/效果/提示词 + 选中;选中可批量打包下载。
 */
export function ToolWorkspace({
  name,
  desc,
  Icon,
  tint,
  accent,
  category,
  feature: requestedFeature,
  cost: baseCost,
  resolution = "1K",
  action,
  controls,
  onProcess,
  checker = false,
  accept = "image/png,image/jpeg,image/webp",
  maxUploadBytes = 12 * 1024 * 1024,
  uploadHint = "JPG / PNG / WebP · 12MB",
  regenLabel = "以此图重新生成",
  onFileChange,
}: {
  name: string;
  desc: string;
  Icon: LucideIcon;
  tint: string;
  accent: string;
  category: string;
  feature?: FeatureId;
  cost: number;
  resolution?: string;
  action: string;
  controls?: React.ReactNode;
  onProcess: (file: File) => Promise<ToolProcessResult>;
  checker?: boolean;
  accept?: string;
  maxUploadBytes?: number;
  uploadHint?: string;
  regenLabel?: string;
  /** 当前输入图变化时通知(AI帮写等需要拿到图的场景);null=清空 */
  onFileChange?: (file: File | null, previewUrl: string) => void;
}) {
  const { user, ready, remaining, consumeCredits, applyServerUser } = useAuth();
  const { openAuth } = useAuthModal();
  const feature = requestedFeature || CATEGORY_FEATURES[category || ""] || "image.generate";
  const { catalog: modelCatalog, error: modelError } = useFeatureModels(feature);
  const executionBlock = featureExecutionBlock(modelCatalog, modelError);
  const qualityPriced = QUALITY_TOOL_CATEGORIES.has(category || "") || feature === "tool.garment3d";
  const billing=useFeatureBilling(feature,{resolution});
  const cost = baseCost;
  const { locale } = useI18n();
  const L = (z: string, e: string) => (locale === "en" ? e : z);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState("");
  const [result, setResult] = React.useState("");
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [records, setRecords] = React.useState<RecordItem[] | null>(null);
  // 放大查看(全屏);选中记录(批量下载);载入到中间看的历史记录。
  const [viewing, setViewing] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [shown, setShown] = React.useState<RecordItem | null>(null);
  const [zipping, setZipping] = React.useState(false);
  const [recPage, setRecPage] = React.useState(0);
  const [recordError, setRecordError] = React.useState("");
  const [recordRetry, setRecordRetry] = React.useState(0);

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // 本工具记录:按 category 过滤本人作品;每次出图后刷新。
  React.useEffect(() => {
    if (!user?.email) {
      setRecords(null);
      return;
    }
    let cancelled = false;
    setRecordError("");
    (async () => {
      try {
        const r = await fetch(
          `/api/account?email=${encodeURIComponent(user.email)}`,
          { headers: await authHeader() }
        );
        if (cancelled) return;
        if (!r.ok) throw new Error(locale === "en" ? "History unavailable" : "记录加载失败");
        const d = await r.json();
        const arts = (d.artworks ?? []) as {
          id: string;
          image: string;
          prompt?: string;
          source?: string;
          category?: string;
          status?: string;
          gradient?: string;
        }[];
        if (cancelled) return;
        setRecords(
          arts
            .filter(
              (a) => a.image && a.status !== "failed" && a.category === category
            )
            .slice(0, 60)
            .map((a) => ({
              id: a.id,
              url: a.image,
              prompt: a.prompt,
              source: toolSourceUrl(a.source),
              gradient: a.gradient,
            }))
        );
        setSelected(new Set());
        setRecPage(0);
      } catch {
        if (!cancelled) { setRecords([]); setRecordError(locale === "en" ? "History unavailable" : "记录加载失败"); }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email, category, result, recordRetry, locale]);

  // 工具页 Ctrl+V 截图 → 直接进上传槽(全站 20+ 单图工具共用此组件)
  const onWindowPaste = useClipboardImagePaste(
    (imgs) => {
      const dt = new DataTransfer();
      for (const f of imgs) dt.items.add(f);
      pick(dt.files);
    },
    !preview && !processing
  );
  React.useEffect(() => {
    if (!onWindowPaste) return;
    window.addEventListener("paste", onWindowPaste as unknown as EventListener);
    return () => window.removeEventListener("paste", onWindowPaste as unknown as EventListener);
  }, [onWindowPaste]);

  function pick(files: FileList | null) {
    if (processing) return;
    if (!user) return openAuth();
    const f = files?.[0];
    if (!f) return;
    const issue=toolImageError(f,maxUploadBytes,accept);
    if (issue) {
      setError(issue === "size" ? L(`图片需小于 ${Math.round(maxUploadBytes/1024/1024)}MB`, `Image must be under ${Math.round(maxUploadBytes/1024/1024)}MB`) : L("请选择有效的图片文件", "Choose a valid image file"));
      return;
    }
    setError(null);
    setResult("");
    setShown(null); // 上传新图 → 退出历史查看
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreview(url);
    onFileChange?.(f, url);
  }

  const busy=React.useRef(false);
  async function run() {
    if(busy.current)return;
    if (!user) return openAuth();
    if (!file) {
      setError("请先上传图片");
      return;
    }
    if(executionBlock){setError(featureExecutionMessage(executionBlock, locale));return;}
    if(!billing.quote){setError(billing.error||"报价加载中，请稍后重试");return;}
    if (remaining < cost) {
      setError(`积分不足:需 ${cost},剩余 ${remaining}`);
      return;
    }
    setError(null);
    setShown(null);
    busy.current=true;
    setProcessing(true);
    setResult("");
    try {
      const data = await onProcess(file);
      if (!data.url) throw new Error("处理失败");
      if (data.user) applyServerUser(data.user);
      else if (data.creditsUsed) consumeCredits(data.creditsUsed);
      setResult(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "处理失败");
    } finally {
      busy.current=false;
      setProcessing(false);
    }
  }

  // 「以此图重新生成」:把指定图载入成新的输入图、清空旧结果,等用户再点处理(不自动扣分)。
  async function regenFrom(url: string) {
    if (processing || !url) return;
    try {
      const blob =
        url.startsWith("blob:") || url.startsWith("data:")
          ? await (await fetch(url)).blob()
          : await readBrowserImage(url);
      const f = new File([blob], "input.png", { type: blob.type || "image/png" });
      if(toolImageError(f,maxUploadBytes,accept))throw new Error("invalid image");
      if (preview) URL.revokeObjectURL(preview);
      const url2 = URL.createObjectURL(f);
      setFile(f);
      setPreview(url2);
      onFileChange?.(f, url2);
      setResult("");
      setShown(null);
      setError(null);
    } catch {
      setError("载入失败,请重试");
    }
  }

  // 点历史记录:载入中间查看(原图/效果/提示词)。选中由左上选择框单独控制。
  function clickRecord(r: RecordItem) {
    setShown(r);
  }
  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // 批量打包下载选中的记录(走 /api/suite/download 打 zip;失败回退逐张)。
  async function downloadSelected() {
    const items = (records ?? [])
      .filter((r) => selected.has(r.id))
      .map((r, i) => ({ url: r.url, name: `${name}-${i + 1}` }));
    if (!items.length) return;
    setZipping(true);
    try {
      const blob = await browserImageArchive(items);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}-${items.length}张.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      items.forEach((it, i) =>
        setTimeout(() => downloadImage(it.url, it.name), i * 350)
      );
    } finally {
      setZipping(false);
    }
  }

  // 中间显示用:查看历史 → 用记录的原图/效果/提示词;否则用上传预览 + 本次结果。
  const dispOriginal = shown ? shown.source || "" : preview;
  const dispResult = shown ? shown.url : result;
  const dispPrompt = shown?.prompt;
  const hasContent = !!(dispOriginal || dispResult);

  return (
    <div data-tool-workspace="tool-workspace" className="w-full px-4 py-5 sm:px-6 lg:px-8" onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault();pick(e.dataTransfer.files);}}>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        disabled={processing}
        data-testid="tool-upload-input"
        hidden
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      {/* 面包屑 */}
      <nav className="flex items-center gap-1.5 text-[13px]">
        <Link href="/tools" className="text-c-text3 transition-colors hover:text-c-text">
          {L("创作工具", "Creative Tools")}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-c-text4" />
        <span className="font-semibold text-c-text">{name}</span>
      </nav>

      {/* 三栏等高:整行固定高度(lg+),各栏内部滚动 → 页面高度一致、图片不再浮在大空区 */}
      <div className="mt-4 grid gap-5 tool-layout-grid lg:grid-cols-[320px_minmax(0,1fr)] tool-layout-three xl:grid-cols-[320px_minmax(0,1fr)_280px]">
        {/* 左:参数(头部/生成按钮钉住,中间参数区内部滚动) */}
        <div className="flex flex-col gap-[18px] rounded-card border border-c-border bg-c-card p-5 shadow-card lg:h-full lg:overflow-hidden">
          <div className="flex items-center gap-3">
            <span
              className="grid h-11 w-11 flex-none place-items-center rounded-[10px]"
              style={{ background: tint, color: accent }}
            >
              <Icon className="h-[21px] w-[21px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[16px] font-bold text-c-text">{name}</h1>
              <p className="text-[12px] text-c-text3">{desc}</p>
            </div>
          </div>

          {/* 可滚动参数区(内容多时内部上下滚,头部与底部按钮不动) */}
          <fieldset disabled={processing} className="nv-panel-scroll flex flex-col gap-[18px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1.5">
          {/* 上传 */}
          <div>
            <p className="mb-2 text-[12.5px] font-medium text-c-text2">{L("上传图片", "Upload image")}</p>
            {preview ? (
              <div
                className="group relative h-28 w-full overflow-hidden rounded-field border border-c-border"
                style={checker ? CHECKER : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <CachedImage src={preview} alt="" className="h-full w-full object-contain" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center bg-[rgba(22,24,29,.45)] text-[10px] font-medium text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                >
                  {L("更换", "Change")}
                </button>
                <button type="button" aria-label={L("移除图片", "Remove image")} onClick={()=>{if(preview)URL.revokeObjectURL(preview);if(fileRef.current)fileRef.current.value="";setFile(null);setPreview("");setResult("");setShown(null);setError(null);onFileChange?.(null,"");}} className="absolute right-1 top-1 z-10 grid h-7 w-7 place-items-center rounded-lg border border-c-border2 bg-c-card text-c-text"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title={uploadHint}
                className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-field border-[1.5px] border-dashed border-c-border2 bg-c-subtle2 text-c-text3 transition-colors hover:border-acc hover:text-acc"
              >
                <Upload className="h-4 w-4" />
                <span className="text-[10px] font-medium">{L("点击或拖拽上传", "Click or drag to upload")}</span>
                <span className="text-[11px]">{uploadHint}</span>
              </button>
            )}
          </div>

          {controls}
            {category && <FeatureModelSelect feature={feature} disabled={processing} />}
            {qualityPriced && <ImageQualityControl feature={feature} resolution={resolution} disabled={processing} />}
          </fieldset>

          <div className="space-y-3 border-t border-c-line pt-4">
            <button
              type="button"
              onClick={run}
              disabled={!ready || processing || (!!user && (!file || !billing.quote || !!executionBlock))}
              className="flex w-full items-center justify-center gap-2 rounded-[11px] py-3 text-[14px] font-semibold text-white shadow-btn [background:var(--grad-acc)] transition-all hover:brightness-95 disabled:opacity-70"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {processing
                ? L("处理中…", "Processing…")
                : ready && !user
                  ? L(`登录并${action}`, `Sign in — ${action}`)
                  : cost > 0
                    ? L(`${action}(消耗 ${cost} 积分)`, `${action} (${cost} credits)`)
                    : action}
            </button>
            {(error || billing.error) && <p role="alert" className="break-words text-[12.5px] text-c-danger">{error || billing.error}</p>}
          </div>
        </div>

        {/* 中:处理结果 */}
        <div className="flex min-h-[520px] flex-col rounded-card border border-c-border bg-c-card p-5 shadow-card lg:h-full lg:min-h-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-c-text">
              {shown ? L("记录详情", "Record details") : L("处理结果", "Result")}
            </h2>
            {shown ? (
              <button
                type="button"
                onClick={() => setShown(null)}
                className="text-[12.5px] font-medium text-acc hover:underline"
              >
                {L("← 返回当前", "← Back to current")}
              </button>
            ) : (
              <span className="text-[12.5px] text-c-text3">{L("原图 / 效果对比", "Original / result")}</span>
            )}
          </div>

          {!hasContent ? (
            getDemo(category) ? (
              <ToolDemo {...getDemo(category)!} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <ImageIcon className="h-9 w-9 text-c-text4" />
                <p className="text-[13px] text-c-text3">{L("上传图片后开始", "Upload an image to start")}</p>
              </div>
            )
          ) : (
            <>
              <div className="tool-compare grid flex-1 grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-medium text-c-text3">{L("原图", "Original")}</span>
                  <div className="group/orig relative flex flex-1 items-center justify-center overflow-hidden rounded-[13px] border border-c-border bg-c-subtle2">
                    {dispOriginal ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <CachedImage
                          src={dispOriginal}
                          alt={L("原图", "Original")}
                          onClick={() => setViewing(dispOriginal)}
                          className="max-h-[460px] max-w-full cursor-zoom-in object-contain"
                        />
                        <button
                          type="button"
                          disabled={processing}
                            onClick={() => regenFrom(dispOriginal)}
                          className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[rgba(22,24,29,.6)] px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur transition-colors hover:bg-[rgba(22,24,29,.8)]"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {regenLabel}
                        </button>
                      </>
                    ) : (
                      <span className="text-[12px] text-c-text4">{L("无原图", "No original")}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-medium" style={{ color: accent }}>
                    {L("效果", "Result")}
                  </span>
                  <div
                    className="relative flex flex-1 items-center justify-center overflow-hidden rounded-[13px] border border-c-border"
                    style={checker ? CHECKER : { background: "var(--c-subtle2)" }}
                  >
                    {processing ? (
                      <GenLoader />
                    ) : dispResult ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <CachedImage
                          src={dispResult}
                          alt={L("效果", "Result")}
                          onClick={() => setViewing(dispResult)}
                          className="max-h-[460px] max-w-full cursor-zoom-in object-contain"
                        />
                        <button
                          type="button"
                          disabled={processing}
                            onClick={() => regenFrom(dispResult)}
                          className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[rgba(22,24,29,.6)] px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur transition-colors hover:bg-[rgba(22,24,29,.8)]"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {regenLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadImage(dispResult, name)}
                          className="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-[rgba(22,24,29,.6)] text-white backdrop-blur transition-colors hover:bg-[rgba(22,24,29,.8)]"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <span className="text-[12px] text-c-text4">{L(`点「${action}」生成`, `Click “${action}” to generate`)}</span>
                    )}
                  </div>
                </div>
              </div>
              {dispPrompt && (
                <div className="mt-3 rounded-field bg-c-subtle2 px-3 py-2 text-[12px] leading-relaxed text-c-text2">
                  <span className="font-medium text-c-text3">{L("提示词:", "Prompt:")}</span> {dispPrompt}
                </div>
              )}
            </>
          )}
          <p className="mt-3 text-center text-[11px] text-c-text4">
            {L("结果保存至作品库", "Saved to Library")}
          </p>
        </div>

        {/* 右:本工具记录 */}
        <aside className="tool-history rounded-card border border-c-border bg-c-card p-4 shadow-card xl:h-full">
          <div className="mb-3 flex min-h-[28px] items-center gap-1.5">
            <Clock className="h-4 w-4 text-c-text3" />
            <span className="text-[13px] font-semibold text-c-text">{L("本工具记录", "Tool history")}</span>
            {records && records.length > 0 && (
              <span className="text-[12px] text-c-text3">{L(`· ${records.length} 张`, `· ${records.length}`)}</span>
            )}
            {selected.size > 0 && (
              <button
                type="button"
                onClick={downloadSelected}
                disabled={zipping}
                className="ml-auto inline-flex items-center gap-1 rounded-[8px] bg-acc px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-60"
              >
                {zipping ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {L(`下载 ${selected.size}`, `Download ${selected.size}`)}
              </button>
            )}
          </div>
          <div className="nv-panel-scroll min-h-0 flex-1 overflow-y-auto pr-0.5">
            {records === null && user ? (
              <div className="tool-history-grid grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="nv-skeleton aspect-square rounded-lg" />
                ))}
              </div>
            ) : records && records.length > 0 ? (
              <div className="tool-history-grid grid grid-cols-2 gap-2">
                {records
                  .slice(recPage * RECORDS_PER_PAGE, (recPage + 1) * RECORDS_PER_PAGE)
                  .map((r) => {
                  const sel = selected.has(r.id);
                  return (
                    <div
                      key={r.id}
                      title={L("点击查看原图 / 成品", "Click to view original / result")}
                      className={cn(
                        "group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                        shown?.id === r.id
                          ? "border-acc"
                          : sel
                            ? "border-acc/40"
                            : "border-c-border hover:border-c-border2"
                      )}
                    >
                      <button type="button" onClick={()=>clickRecord(r)} aria-label={L("查看历史图片", "View history image")} className="block w-full text-left">
                        <Media
                        src={cdnUrl(r.url)}
                        alt=""
                        gradient={r.gradient}
                        thumbWidth={220}
                        ratio="aspect-square"
                        className="rounded-none border-0 transition-transform group-hover:scale-105"
                      />
                      </button>
                      {/* 左上选择框:点它才选中(用于批量打包下载) */}
                      <button type="button"
                        role="checkbox"
                          tabIndex={0}
                          aria-label={L("选择历史图片", "Select history image")}
                        aria-checked={sel}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(r.id);
                        }}
                        className={cn(
                          "absolute left-1 top-1 grid h-5 w-5 cursor-pointer place-items-center rounded-[6px] border-2 transition-colors",
                          sel
                            ? "border-acc bg-acc text-white"
                            : "border-white bg-black/25 text-transparent hover:bg-black/40"
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="px-2 py-10 text-center text-[12px] text-c-text3">{L("还没有记录", "No records yet")}</p>
            )}
          </div>
          <RecordPager
            page={recPage}
            total={Math.ceil((records?.length ?? 0) / RECORDS_PER_PAGE)}
            onPage={setRecPage}
          />
          {recordError && <div role="alert" className="mt-2 flex items-center justify-between gap-2 text-xs text-c-danger">{recordError}<button type="button" onClick={() => setRecordRetry(v=>v+1)} className="text-acc">{L("重试", "Retry")}</button></div>}
          <Link
            href={`/works?cat=${category}`}
            className="mt-3 text-center text-[12px] font-medium text-acc hover:underline"
          >
            {L("在作品库查看全部 →", "View all in Library →")}
          </Link>
        </aside>
      </div>

      {/* 全屏放大查看(全站统一 ImageLightbox:缩放/平移/导出;透明图棋盘底) */}
      {viewing && (
        <ImageLightbox
          src={viewing}
          onClose={() => setViewing("")}
          downloadName={name}
          checker={checker && viewing === dispResult}
        />
      )}
    </div>
  );
}
