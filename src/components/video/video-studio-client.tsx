"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Clapperboard,
  Download,
  ImagePlus,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// /video 视频工作台(方案 §8,Phase 2):三段式——左参数(能力驱动)/中预览(当前
// 任务播放器+状态)/右历史(进行中恢复+结果卡)。数据源:Phase 1 的 service
// (catalog / generate / tasks 列表与轮询 / retry / send-to-canvas)。
// 进行中任务靠后台 worker 兜底,页面刷新后从历史区找回继续轮询。
// ---------------------------------------------------------------------------

type Capability = {
  providerId: string;
  modelId: string;
  label: string;
  modes: string[];
  durations: number[];
  aspectRatios: string[];
  resolutions: string[];
  maxReferenceImages: number;
  defaultDuration?: number;
  note?: string;
  isDefault: boolean;
  supportsLastFrame?: boolean;
  supportsNegativePrompt?: boolean;
  supportsGenerateAudio?: boolean;
  supportsWatermark?: boolean;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
};

type ProviderView = {
  id: string;
  label: string;
  protocol: string;
  defaultModel: string;
  models: Capability[];
};

type UploadedReference = { id: string; kind: "image" | "video" | "audio"; role: string; url: string; mimeType?: string; storageKey?: string };

type TaskView = {
  id: string;
  prompt: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  progress: number;
  cost: number;
  model: string;
  seconds: string;
  videoUrl: string;
  artworkId: string;
  error: string;
  createdAt: string;
};

const MAX_REF_BYTES = 12 * 1024 * 1024;

export function VideoStudioClient() {
  const { user, ready } = useAuth();
  const { openAuth } = useAuthModal();
  const [catalog, setCatalog] = useState<Capability[] | null>(null);
  const [providers, setProviders] = useState<ProviderView[]>([]);
  const [configured, setConfigured] = useState(true);
  const [costPerTask, setCostPerTask] = useState(20);
  const [modelId, setModelId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seconds, setSeconds] = useState(4);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1280x720");
  const [generateAudio, setGenerateAudio] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [lastFrameFile, setLastFrameFile] = useState<File | null>(null);
  const [extraRefFiles, setExtraRefFiles] = useState<File[]>([]);
  const [refPreview, setRefPreview] = useState("");
  const [refUrl, setRefUrl] = useState("");
  const [uploadingRef, setUploadingRef] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [tip, setTip] = useState("");
  // 当前关注的任务(中央预览);activePoll 由 effect 驱动
  const [activeId, setActiveId] = useState("");
  const [activeTask, setActiveTask] = useState<TaskView | null>(null);
  const [history, setHistory] = useState<TaskView[] | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const activeIdRef = useRef("");

  activeIdRef.current = activeId;
  const cap = catalog?.find((c) => c.providerId === providerId && c.modelId === modelId) ?? null;
  const providerModels = catalog?.filter((c) => c.providerId === providerId) ?? [];

  const loadHistory = useCallback(async () => {
    if (!user) {
      setHistory(null);
      return;
    }
    try {
      const res = await fetch("/api/video/tasks?limit=50", { headers: await authHeader() });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tasks)) {
        setHistory(data.tasks);
        // 恢复:没有主动关注任务时,把最新一条作为中央预览
        if (!activeIdRef.current && data.tasks.length) {
          setActiveId(data.tasks[0].id);
        }
      }
    } catch { /* keep */ }
  }, [user]);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/video/catalog", { headers: await authHeader() });
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      setCostPerTask(Number(data.costPerTask ?? 20));
      const models = (data.models ?? []) as Capability[];
      setCatalog(models);
      const providerList = (data.providers ?? []) as ProviderView[];
      setProviders(providerList);
      const defaultProvider = String(data.defaultProvider || providerList[0]?.id || models[0]?.providerId || "");
      setProviderId(defaultProvider);
      const def = models.find((m) => m.providerId === defaultProvider && m.isDefault) ?? models.find((m) => m.providerId === defaultProvider) ?? models[0];
      if (def) {
        setModelId(def.modelId);
        setSeconds(def.defaultDuration ?? def.durations[0] ?? 4);
        setAspectRatio(def.aspectRatios[0] || "16:9");
        setResolution(def.resolutions[0] || "1280x720");
      }
    } catch { /* keep */ }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (ready && !user) return;
    void loadHistory();
  }, [ready, user, loadHistory]);

  // 模型切换:时长重置为该模型默认档
  useEffect(() => {
    if (!cap) return;
    setSeconds(cap.defaultDuration ?? cap.durations[0] ?? 4);
    setAspectRatio(cap.aspectRatios[0] || "16:9");
    setResolution(cap.resolutions[0] || "1280x720");
    if (!cap.supportsGenerateAudio) setGenerateAudio(false);
    if (!cap.supportsWatermark) setWatermark(false);
  }, [modelId]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectProvider(id: string) {
    setProviderId(id);
    const next = catalog?.find((item) => item.providerId === id && item.isDefault)
      ?? catalog?.find((item) => item.providerId === id);
    if (next) setModelId(next.modelId);
  }

  // 中央任务轮询(5s);后台 worker 兜底,这里只为即时反馈
  useEffect(() => {
    if (!activeId || !user) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/video/tasks?id=${encodeURIComponent(activeId)}`, {
          headers: await authHeader(),
        });
        if (res.ok) {
          const data = await res.json();
          if (!stop && data.task) {
            setActiveTask(data.task as TaskView);
            if (data.task.status !== "processing" && data.task.status !== "queued") {
              void loadHistory();
            }
          }
        }
      } catch { /* keep */ }
    };
    void poll();
    const timer = setInterval(() => {
      const t = activeTask;
      if (t && t.status !== "processing" && t.status !== "queued") return;
      void poll();
    }, 5000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [activeId, user, loadHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // 历史区周期刷新(有进行中任务时)
  useEffect(() => {
    if (!user) return;
    const hasRunning = (history ?? []).some(
      (t) => t.status === "processing" || t.status === "queued"
    );
    if (!hasRunning) return;
    const timer = setInterval(() => void loadHistory(), 8000);
    return () => clearInterval(timer);
  }, [history, user, loadHistory]);

  function pickRef(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      setError("仅支持 PNG / JPG / WebP 参考图");
      return;
    }
    if (f.size > MAX_REF_BYTES) {
      setError("参考图请小于 12MB");
      return;
    }
    setError("");
    setRefFile(f);
    setRefPreview(URL.createObjectURL(f));
  }

  function clearRef() {
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRefFile(null);
    setRefPreview("");
    setRefUrl("");
  }

  async function submit() {
    const text = prompt.trim();
    if (!text || submitting) return;
    if (ready && !user) {
      openAuth("sign-in");
      return;
    }
    setError("");
    setTip("");
    setSubmitting(true);
    try {
      const uploadReference = async (file: File): Promise<UploadedReference> => {
        setUploadingRef(true);
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch("/api/video/references", {
          method: "POST",
          headers: await authHeader(),
          body: fd,
        });
        const upd = await up.json();
        if (!up.ok || !upd?.reference?.url) throw new Error(upd?.error || "素材上传失败");
        return upd.reference as UploadedReference;
      };
      const references: UploadedReference[] = [];
      if (refFile) references.push({ ...(await uploadReference(refFile)), role: "first_frame" });
      if (lastFrameFile) references.push({ ...(await uploadReference(lastFrameFile)), role: "last_frame" });
      for (const file of extraRefFiles) {
        const uploaded = await uploadReference(file);
        references.push({
          ...uploaded,
          role: uploaded.kind === "video" ? "source_video" : uploaded.kind === "audio" ? "source_audio" : "reference",
        });
      }
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          prompt: text,
          providerId,
          modelId,
          negativePrompt: negativePrompt.trim() || undefined,
          durationSeconds: seconds,
          seconds: String(seconds),
          aspectRatio,
          resolution,
          size: resolution,
          generateAudio,
          watermark,
          references,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建失败");
      setTip(`已创建任务,扣 ${data.cost} 积分;生成约 1-3 分钟`);
      setActiveId(data.taskId);
      setActiveTask(null);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setUploadingRef(false);
      setSubmitting(false);
    }
  }

  async function retry(task: TaskView) {
    if (busyAction) return;
    setBusyAction(task.id);
    setError("");
    try {
      const res = await fetch(`/api/video/tasks/${encodeURIComponent(task.id)}/retry`, {
        method: "POST",
        headers: await authHeader(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "重试创建失败");
      setTip(`已按原配置重新创建,扣 ${data.cost} 积分`);
      setActiveId(data.taskId);
      setActiveTask(null);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "重试失败");
    } finally {
      setBusyAction("");
    }
  }

  async function sendToCanvas(task: TaskView) {
    if (busyAction) return;
    setBusyAction(task.id);
    setError("");
    try {
      const res = await fetch(`/api/video/tasks/${encodeURIComponent(task.id)}/send-to-canvas`, {
        method: "POST",
        headers: await authHeader(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "发送失败");
      setTip(data.reused ? "该视频已在画布上" : "已发送到画布");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setBusyAction("");
    }
  }

  const durations = cap?.durations ?? [4, 8, 12];
  const supportsImage = !cap || cap.modes.includes("image");

  return (
    <div className="w-full px-5 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1280px]">
        <header className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-primary/10 text-primary">
            <Clapperboard className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-c-text">视频工作台</h1>
            <p className="text-[13px] text-c-text3">
              文生视频 / 图生视频 · 任务后台执行,关掉页面也能完成 · {costPerTask} 积分/条
            </p>
          </div>
          <Link
            href="/canvas"
            className="hidden rounded-lg border border-c-border px-3 py-1.5 text-[12.5px] font-medium text-c-text2 transition-colors hover:bg-secondary sm:block"
          >
            去画布 →
          </Link>
        </header>

        {!configured && (
          <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-700">
            视频服务未配置:需要管理员在服务器设置 VIDEO_API_BASE_URL / KEY / MODEL。
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[340px_1fr_320px]">
          {/* 左:参数区 */}
          <section className="rounded-2xl border border-c-border bg-c-card p-4 shadow-card">
            {providers.length > 1 && (
              <>
                <p className="mb-1.5 text-[12.5px] font-semibold text-c-text2">供应商</p>
                <select value={providerId} onChange={(e) => selectProvider(e.target.value)} className="mb-3 w-full rounded-lg border border-c-border bg-c-subtle px-3 py-2 text-[13px] text-c-text outline-none focus:ring-1 focus:ring-primary">
                  {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                </select>
              </>
            )}
            <p className="mb-2 text-[12.5px] font-semibold text-c-text2">模型</p>
            {!catalog ? (
              <p className="py-2 text-xs text-c-text3">读取中…</p>
            ) : (
              <div className="space-y-1.5">
                {providerModels.map((m) => (
                  <button
                    key={`${m.providerId}:${m.modelId}`}
                    type="button"
                    onClick={() => setModelId(m.modelId)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      m.modelId === modelId
                        ? "border-primary/50 bg-primary/[0.06]"
                        : "border-c-border hover:bg-secondary/60"
                    )}
                  >
                    <VideoIcon className="h-4 w-4 flex-none text-c-text3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-c-text">{m.label}</span>
                      <span className="block truncate text-[11px] text-c-text3">
                        {m.durations.join("/")} 秒{m.note ? ` · ${m.note}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <p className="mb-1.5 mt-4 text-[12.5px] font-semibold text-c-text2">画面描述</p>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="描述画面与运镜,如:保健品瓶身缓慢旋转,柔和棚拍灯光,浅景深背景"
              className="w-full resize-y rounded-xl border border-c-border bg-c-subtle px-3 py-2.5 text-[13px] leading-relaxed outline-none focus:ring-1 focus:ring-primary"
            />

            {supportsImage && (
              <>
                <p className="mb-1.5 mt-3 text-[12.5px] font-semibold text-c-text2">
                  首帧参考图 <span className="font-normal text-c-text4">(可选,图生视频)</span>
                </p>
                {refPreview ? (
                  <div className="relative w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={refPreview} alt="参考图" className="h-20 w-20 rounded-xl border border-c-border object-cover" />
                    <button
                      type="button"
                      aria-label="移除参考图"
                      onClick={clearRef}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-c-text text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-c-border text-[12.5px] text-c-text3 transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {uploadingRef ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    上传一张商品图作为首帧
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickRef(e.target.files)} />
              </>
            )}

            {cap?.supportsLastFrame && (
              <label className="mt-3 block text-[12.5px] font-semibold text-c-text2">
                尾帧 <span className="font-normal text-c-text4">（可选）</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLastFrameFile(e.target.files?.[0] || null)} className="mt-1.5 block w-full text-[11.5px] text-c-text3 file:mr-2 file:rounded-md file:border file:border-c-border file:bg-white file:px-2 file:py-1 file:text-c-text2" />
              </label>
            )}

            {(cap?.modes.includes("reference") || cap?.modes.includes("video_edit")) && (
              <label className="mt-3 block text-[12.5px] font-semibold text-c-text2">
                多模态参考 <span className="font-normal text-c-text4">（图片 / 视频 / 音频）</span>
                <input type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/mp4,audio/webm" onChange={(e) => setExtraRefFiles(Array.from(e.target.files || []))} className="mt-1.5 block w-full text-[11.5px] text-c-text3 file:mr-2 file:rounded-md file:border file:border-c-border file:bg-white file:px-2 file:py-1 file:text-c-text2" />
                {extraRefFiles.length > 0 && <span className="mt-1 block font-normal text-c-text4">已选 {extraRefFiles.length} 个素材</span>}
              </label>
            )}

            <p className="mb-1.5 mt-3 text-[12.5px] font-semibold text-c-text2">时长</p>
            <div className="flex gap-1.5">
              {durations.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSeconds(d)}
                  className={cn(
                    "flex-1 rounded-lg border px-2 py-1.5 text-[12.5px] font-semibold transition-colors",
                    seconds === d
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-c-border text-c-text2 hover:bg-secondary"
                  )}
                >
                  {d}s
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[12px] text-c-text3">画幅
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="mt-1 w-full rounded-lg border border-c-border bg-c-subtle px-2 py-1.5 text-[12.5px] text-c-text">
                  {(cap?.aspectRatios ?? ["16:9", "9:16", "1:1"]).map((ratio) => <option key={ratio}>{ratio}</option>)}
                </select>
              </label>
              <label className="text-[12px] text-c-text3">分辨率
                <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="mt-1 w-full rounded-lg border border-c-border bg-c-subtle px-2 py-1.5 text-[12.5px] text-c-text">
                  {(cap?.resolutions ?? ["1280x720", "720x1280"]).map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
            {cap?.supportsNegativePrompt && <input value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder="负面提示词（可选）" className="mt-3 w-full rounded-lg border border-c-border bg-c-subtle px-3 py-2 text-[12.5px] outline-none focus:ring-1 focus:ring-primary" />}
            {(cap?.supportsGenerateAudio || cap?.supportsWatermark) && <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-c-text2">
              {cap.supportsGenerateAudio && <label className="flex items-center gap-1.5"><input type="checkbox" checked={generateAudio} onChange={(e) => setGenerateAudio(e.target.checked)} />生成音频</label>}
              {cap.supportsWatermark && <label className="flex items-center gap-1.5"><input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />添加水印</label>}
            </div>}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={!prompt.trim() || submitting || !configured}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13.5px] font-bold text-white shadow-btn transition-all hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {submitting ? "创建中…" : `生成视频 · ${costPerTask} 积分`}
            </button>
            {error && <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>}
            {tip && <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">{tip}</p>}
          </section>

          {/* 中:预览区 */}
          <section className="flex min-h-[420px] flex-col rounded-2xl border border-c-border bg-c-card p-4 shadow-card">
            {!activeTask ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-c-subtle text-c-text3">
                  <VideoIcon className="h-7 w-7" />
                </span>
                <p className="max-w-xs text-[13px] leading-relaxed text-c-text3">
                  左侧填写描述创建任务,或从右侧历史中选择一条查看。
                  任务在后台执行,关掉页面也能完成。
                </p>
              </div>
            ) : activeTask.status === "completed" && activeTask.videoUrl ? (
              <div className="flex flex-1 flex-col gap-3">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={activeTask.videoUrl}
                  controls
                  playsInline
                  className="max-h-[460px] w-full flex-1 rounded-xl border border-c-border bg-black object-contain"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={activeTask.videoUrl}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-c-border px-3 text-[12.5px] font-semibold text-c-text2 transition-colors hover:bg-secondary"
                  >
                    <Download className="h-3.5 w-3.5" /> 下载
                  </a>
                  <button
                    type="button"
                    onClick={() => void sendToCanvas(activeTask)}
                    disabled={busyAction === activeTask.id}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-c-border px-3 text-[12.5px] font-semibold text-c-text2 transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" /> 发送到画布
                  </button>
                  <button
                    type="button"
                    onClick={() => void retry(activeTask)}
                    disabled={busyAction === activeTask.id}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-c-border px-3 text-[12.5px] font-semibold text-c-text2 transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> 按原配置再生成
                  </button>
                  <span className="ml-auto text-[11.5px] text-c-text4">
                    {activeTask.model} · {activeTask.seconds}s · {activeTask.cost} 积分
                  </span>
                </div>
              </div>
            ) : activeTask.status === "failed" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <p className="rounded-lg bg-red-500/10 px-4 py-2 text-[13px] text-red-600">
                  {activeTask.error || "生成失败"}
                </p>
                <p className="text-[12px] text-c-text3">积分已自动退回</p>
                <button
                  type="button"
                  onClick={() => void retry(activeTask)}
                  disabled={busyAction === activeTask.id}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[12.5px] font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> 按原配置重试
                </button>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="w-full max-w-xs">
                  <div className="mb-1 flex justify-between text-[12px] text-c-text3">
                    <span>{activeTask.status === "queued" ? "排队中" : "生成中"}</span>
                    <span>{Math.min(95, activeTask.progress)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-c-subtle">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.max(6, Math.min(95, activeTask.progress))}%` }}
                    />
                  </div>
                </div>
                <p className="text-[12px] text-c-text4">约 1-3 分钟;可以离开此页,任务在后台继续</p>
              </div>
            )}
          </section>

          {/* 右:历史区 */}
          <section className="rounded-2xl border border-c-border bg-c-card p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12.5px] font-semibold text-c-text2">任务历史</p>
              <button
                type="button"
                aria-label="刷新"
                onClick={() => void loadHistory()}
                className="grid h-7 w-7 place-items-center rounded-md text-c-text3 transition-colors hover:bg-secondary hover:text-c-text"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="nv-panel-scroll max-h-[70vh] space-y-1.5 overflow-y-auto">
              {!history ? (
                <p className="py-3 text-xs text-c-text3">读取中…</p>
              ) : history.length === 0 ? (
                <p className="rounded-lg border border-dashed border-c-border px-3 py-6 text-center text-xs leading-relaxed text-c-text3">
                  还没有任务。左侧创建第一条视频。
                </p>
              ) : (
                history.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveId(t.id);
                      setActiveTask(t);
                    }}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                      t.id === activeId ? "border-primary/50 bg-primary/[0.06]" : "border-c-border hover:bg-secondary/60"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {t.status === "processing" || t.status === "queued" ? (
                        <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-primary" />
                      ) : t.status === "completed" ? (
                        <VideoIcon className="h-3.5 w-3.5 flex-none text-emerald-600" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 flex-none text-red-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-c-text">
                        {t.prompt || "(无描述)"}
                      </span>
                      <span className="flex-none text-[10.5px] text-c-text4">{t.seconds}s</span>
                    </div>
                    <p className="mt-1 truncate pl-5 text-[10.5px] text-c-text4">
                      {t.status === "completed"
                        ? `${t.model} · 已完成`
                        : t.status === "failed"
                          ? `失败:${(t.error || "").slice(0, 30)}`
                          : `${Math.min(95, t.progress)}% · 后台执行中`}
                    </p>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
