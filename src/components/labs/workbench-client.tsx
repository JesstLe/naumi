"use client";

// 内部生图工作台:面向内部员工的批量电商出图工具。
// 布局与交互流对齐团队此前使用的批量出图客户端(产品图+风格参考图 → 主图/详情图/SKU 批量任务),
// 代码为本仓库原创实现,生成统一走 /api/generate-image 现有链路(billing + 任务轮询)。
// 界面文案固定中文,不接 i18n。

import { useCallback, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { ChevronRight, Download, Loader2, Plus, RefreshCw, Upload } from "lucide-react";
import { authHeader } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import {useFeatureAccess} from "@/lib/feature-access/client";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useFeatureBilling } from "@/lib/billing/preview";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {ImagegenPanel} from "@/components/imagegen/imagegen-panel";

type ProductImage = {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
};

type JobKind = "main" | "detail" | "sku";

type CardJob = {
  kind: JobKind;
  jobId: string | null;
  status: "queued" | "running" | "done" | "error";
  error?: string;
};

type CardState = {
  status: "idle" | "running" | "done" | "error";
  jobs: CardJob[];
  results: { id: string; url: string; kind: JobKind }[];
};

type TaskType = "all" | "main_detail" | "main" | "detail" | "sku";

const TASK_TYPES: { id: TaskType; label: string }[] = [
  { id: "all", label: "主图 + 详情图 + SKU" },
  { id: "main_detail", label: "主图 + 详情图" },
  { id: "main", label: "只跑主图" },
  { id: "detail", label: "只跑详情图" },
  { id: "sku", label: "只跑 SKU" },
];

const KIND_LABEL: Record<JobKind, string> = { main: "主图", detail: "详情图", sku: "SKU" };

// 任务类型 → 该卡要跑的生成作业(count 为单次出图张数)
function jobsForType(type: TaskType): { kind: JobKind; count: number }[] {
  switch (type) {
    case "all":
      return [
        { kind: "main", count: 1 },
        { kind: "detail", count: 2 },
        { kind: "sku", count: 1 },
      ];
    case "main_detail":
      return [
        { kind: "main", count: 1 },
        { kind: "detail", count: 2 },
      ];
    case "main":
      return [{ kind: "main", count: 1 }];
    case "detail":
      return [{ kind: "detail", count: 2 }];
    case "sku":
      return [{ kind: "sku", count: 1 }];
  }
}

const KIND_PROMPT_SUFFIX: Record<JobKind, string> = {
  main: "本次输出为电商主图：简洁浅色背景、柔和棚拍光，产品居中且占画面主体，突出产品外观与质感，构图干净适合平台主图位。",
  detail: "本次输出为详情页营销图：场景化构图与氛围光，可加入与产品匹配的使用场景元素，带简约版式留白，突出卖点与质感。",
  sku: "本次输出为 SKU 规格特写图：近距离微距质感、浅景深、干净背景，突出产品材质与工艺细节。",
};

const DEFAULT_PROMPT =
  "图一为产品原图，图二为风格参考。保持图一产品主体特征不变，参考图二的构图、配色、场景与版式风格，用专业的电商视觉经验重新排版输出同风格的成图。";

const QUALITIES = ["high", "medium", "low", "auto"] as const;
const RESOLUTIONS = ["1K", "2K", "4K"] as const;
const RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
const CONCURRENCY = 2;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function WorkbenchClient() {
  const [imagegenOpen,setImagegenOpen]=useState(false);
  const { user, ready } = useAuth();
  const {ready:featureReady,can}=useFeatureAccess();
  const { openAuth } = useAuthModal();

  const [products, setProducts] = useState<ProductImage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [styleRef, setStyleRef] = useState<{ file: File; previewUrl: string } | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});

  const [taskType, setTaskType] = useState<TaskType>("main_detail");
  const [quality, setQuality] = useState<(typeof QUALITIES)[number]>("high");
  const [resolution, setResolution] = useState<(typeof RESOLUTIONS)[number]>("2K");
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]>("1:1");
  const [waitSec, setWaitSec] = useState(900);
  const [overwrite, setOverwrite] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  const [queueRunning, setQueueRunning] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queueAbort = useRef(false);

  const billing = useFeatureBilling("image.generate", {
    quantity: 1,
    resolution,
    ratio,
  });

  const pendingJobs = useMemo(() => {
    const list: { cardId: string; job: CardJob; name: string }[] = [];
    for (const p of products) {
      const card = cards[p.id];
      if (!card) continue;
      for (const job of card.jobs) {
        if (job.status === "queued" || job.status === "running") {
          list.push({ cardId: p.id, job, name: p.name });
        }
      }
    }
    return list;
  }, [products, cards]);

  const stats = useMemo(() => {
    let done = 0;
    let failed = 0;
    for (const p of products) {
      const card = cards[p.id];
      if (!card) continue;
      if (card.status === "done") done += 1;
      if (card.status === "error") failed += 1;
    }
    return { done, failed };
  }, [products, cards]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setProducts((prev) => {
      const next = [...prev];
      const nextSelected = new Set(selected);
      for (const file of list) {
        const id = uid();
        next.push({ id, name: file.name, file, previewUrl: URL.createObjectURL(file) });
        nextSelected.add(id);
      }
      setSelected(nextSelected);
      return next;
    });
  }, [selected]);

  function patchCard(cardId: string, patch: (c: CardState) => CardState) {
    setCards((prev) => ({ ...prev, [cardId]: patch(prev[cardId] ?? { status: "idle", jobs: [], results: [] }) }));
  }

  async function submitJob(cardId: string, kind: JobKind, count: number) {
    const product = products.find((p) => p.id === cardId);
    if (!product) return;
    const fd = new FormData();
    // 提示词 = 批量提示词(用户可改) + 任务类型模板
    fd.append("prompt", `${prompt}${KIND_PROMPT_SUFFIX[kind]}`);
    fd.append("userPrompt", prompt);
    fd.append("category", "product");
    fd.append("ratio", ratio);
    fd.append("resolution", resolution);
    fd.append("quality", quality);
    fd.append("count", String(count));
    fd.append("email", user?.email ?? "");
    fd.append("image", product.file);
    if (styleRef) fd.append("image", styleRef.file);

    const startRes = await billing.submit("/api/generate-image", {
      method: "POST",
      headers: await authHeader(),
      body: fd,
    });
    const start = await startRes.json();
    if (!startRes.ok) throw new Error(start.error ?? "任务提交失败");
    const jobId = start.jobId as string | undefined;
    if (!jobId) throw new Error("服务端未返回任务ID");

    patchCard(cardId, (c) => ({
      ...c,
      status: "running",
      jobs: c.jobs.map((j) => (j.kind === kind && j.jobId === null ? { ...j, jobId, status: "running" } : j)),
    }));

    // 轮询直到完成/失败/超时
    const deadline = Date.now() + waitSec * 1000;
    for (;;) {
      const res = await fetch(`/api/generate-image?job=${encodeURIComponent(jobId)}`, {
        cache: "no-store",
        headers: await authHeader(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "任务查询失败");
      if (data.status === "error") throw new Error(data.error ?? "生成失败");
      if (data.status === "done") {
        const imgs: { id: string; url: string }[] = data.images ?? [];
        patchCard(cardId, (c) => {
          const jobs = c.jobs.map((j) => (j.jobId === jobId ? { ...j, status: "done" as const } : j));
          const results = [
            ...c.results,
            ...imgs.map((im) => ({ id: im.id, url: im.url, kind })),
          ];
          const allSettled = jobs.every((j) => j.status === "done" || j.status === "error");
          return {
            ...c,
            jobs,
            results,
            status: allSettled ? (jobs.some((j) => j.status === "error") ? "error" : "done") : "running",
          };
        });
        return;
      }
      if (Date.now() > deadline) throw new Error("等待超时,可稍后用「刷新结果」继续查询");
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  async function runQueue(cardIds: string[]) {
    if (queueRunning) return;
    setGlobalError(null);
    setQueueRunning(true);
    queueAbort.current = false;

    // 组任务清单(含覆盖判断)
    const tasks: { cardId: string; kind: JobKind; count: number }[] = [];
    for (const cardId of cardIds) {
      const card = cards[cardId];
      const plan = jobsForType(taskType).filter(({ kind }) => {
        if (overwrite) return true;
        const has = card?.results.some((r) => r.kind === kind);
        return !has;
      });
      if (!plan.length) continue;
      patchCard(cardId, (c) => ({
        ...c,
        status: "running",
        jobs: [...c.jobs, ...plan.map(({ kind }) => ({ kind, jobId: null, status: "queued" as const }))],
      }));
      for (const { kind, count } of plan) tasks.push({ cardId, kind, count });
    }
    if (!tasks.length) {
      setQueueRunning(false);
      setNotice("选中卡片已有结果(覆盖=否)。需要重跑请把「覆盖已有结果」设为是。");
      return;
    }

    let idx = 0;
    const worker = async () => {
      while (idx < tasks.length && !queueAbort.current) {
        const task = tasks[idx++];
        try {
          await submitJob(task.cardId, task.kind, task.count);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "生成失败";
          patchCard(task.cardId, (c) => ({
            ...c,
            jobs: c.jobs.map((j) =>
              j.kind === task.kind && j.status !== "done" ? { ...j, status: "error", error: msg } : j
            ),
            status: "error",
          }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, worker));
    setQueueRunning(false);
    if (queueAbort.current) setNotice("已停止后续任务;正在跑的任务会继续到本张结束。");
  }

  function generateSelected() {
    if (!user) {
      openAuth("sign-up");
      return;
    }
    const cardIds = products.filter((p) => selected.has(p.id)).map((p) => p.id);
    if (!cardIds.length) {
      setGlobalError("请先上传产品图并勾选要生成的卡片");
      return;
    }
    void runQueue(cardIds);
  }

  // ── 下载 ──
  async function fetchBlob(url: string): Promise<Blob> {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("图片下载失败");
    return res.blob();
  }

  function extFor(url: string) {
    const m = url.split("?")[0].match(/\.(png|jpe?g|webp)$/i);
    return m ? m[1].toLowerCase() : "png";
  }

  function saveBlob(blob: Blob, filename: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function downloadSelected(mode: "results" | "sources" | "both") {
    const targets = products.filter((p) => selected.has(p.id));
    if (!targets.length) {
      setNotice("请先勾选要下载的卡片");
      return;
    }
    setNotice("正在打包下载…");
    try {
      const zip = new JSZip();
      let n = 0;
      for (const p of targets) {
        const card = cards[p.id];
        if (!card) continue;
        const base = p.name.replace(/\.[^.]+$/, "");
        if (mode !== "results") {
          if (mode === "sources" || mode === "both") {
            zip.file(`原图/${base}_原图${p.name.match(/\.[^.]+$/)?.[0] ?? ".png"}`, p.file);
          }
        }
        if (mode !== "sources") {
          for (const r of card.results) {
            const blob = await fetchBlob(r.url);
            zip.file(`生成图/${base}_${KIND_LABEL[r.kind]}_${++n}.${extFor(r.url)}`, blob);
          }
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      saveBlob(blob, `工作台结果_${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice(`已打包 ${n} 张生成图`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "打包失败");
    }
  }

  return (
    <div className="w-full px-5 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
      {/* 面包屑 + 快捷入口(对齐其它工具页) */}
      <div className="relative mb-4">
        <nav className="flex items-center gap-1.5 text-[13px]">
          <Link href="/tools" className="text-c-text3 transition-colors hover:text-c-text">创作工具</Link>
          <ChevronRight className="h-3.5 w-3.5 text-c-text4" />
          <span className="font-semibold text-c-text">批量出图</span>
        </nav>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-[17px] font-bold leading-6">批量出图</h1>
          <span className="text-[12px] text-c-text4">产品图 + 风格参考图 → 主图 / 详情图 / SKU 批量任务</span>
          <div className="ml-auto flex items-center gap-2 text-[12.5px]">
            {queueRunning && (
              <span className="flex items-center gap-1 text-c-text3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                队列运行中(并发 {CONCURRENCY})
              </span>
            )}
            <Link href="/genchat" className="rounded-md border border-c-line px-2.5 py-1.5 hover:bg-c-track">聊天生图</Link>
            <Link href="/generate" className="rounded-md border border-c-line px-2.5 py-1.5 hover:bg-c-track">单图生成</Link>
            <button disabled={!ready||!user||!featureReady||!can("batchshot")} className="rounded-md border border-c-line px-2.5 py-1.5 hover:bg-c-track disabled:opacity-40" onClick={()=>setImagegenOpen(true)}>图像创作 / 提示词批次</button>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        {/* 侧栏:后台项目 */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="rounded-xl border border-c-line bg-c-card p-3">
            <h3 className="mb-2 text-[13px] font-semibold">后台项目</h3>
            <p className="mb-2 text-[11.5px] leading-4 text-c-text4">
              关闭页面不会打断已提交任务;回到本页可查看进度。
            </p>
            {pendingJobs.length === 0 ? (
              <p className="text-[12px] text-c-text4">暂无后台项目</p>
            ) : (
              <ul className="space-y-1.5">
                {pendingJobs.map(({ cardId, job, name }) => (
                  <li key={`${cardId}-${job.kind}`} className="flex items-center gap-1.5 text-[12px]">
                    {job.status === "running" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-c-text4" />
                    )}
                    <span className="truncate" title={name}>
                      {name} · {KIND_LABEL[job.kind]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* 主区 */}
        <main className="min-w-0 flex-1 space-y-4">
          {!user && ready && (
            <div className="flex items-center justify-between rounded-xl border border-c-line bg-c-card px-4 py-3 text-[13px]">
              <span>请先登录后使用工作台(与主站账号通用)。</span>
              <Button size="sm" onClick={() => openAuth("sign-up")}>登录 / 注册</Button>
            </div>
          )}
          {globalError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {globalError}
            </div>
          )}
          {notice && (
            <div className="flex items-center justify-between rounded-xl border border-c-line bg-c-card px-4 py-3 text-[13px] text-c-text2">
              <span>{notice}</span>
              <button className="text-c-text4 hover:text-c-text" onClick={() => setNotice(null)}>×</button>
            </div>
          )}

          {/* 上传区 */}
          <section className="rounded-xl border border-dashed border-c-line bg-c-card p-4">
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-[13.5px] font-semibold">产品图</h2>
              <span className="text-[11.5px] text-c-text4">每张产品图生成一张任务卡;可拖拽或点击上传多张</span>
            </div>
            <label className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg bg-c-track/60 text-c-text3 hover:bg-c-track">
              <Upload className="h-5 w-5" />
              <span className="text-[12.5px]">点击选择产品图(可多选)</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[12px] text-c-text3">风格参考图(可选,作为图二)</p>
                {styleRef ? (
                  <div className="flex items-center gap-2 rounded-lg border border-c-line p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={styleRef.previewUrl} alt="参考图" className="h-14 w-14 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate text-[12px]">{styleRef.file.name}</span>
                    <button className="text-c-text4 hover:text-c-text" onClick={() => setStyleRef(null)}>×</button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-c-line px-3 py-2.5 text-[12.5px] text-c-text3 hover:bg-c-track">
                    <Plus className="h-4 w-4" /> 添加风格参考图
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setStyleRef({ file: f, previewUrl: URL.createObjectURL(f) });
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              <div className="flex items-center gap-4 text-[12px] text-c-text3">
                <span>已上传 {products.length} 张</span>
                <span>已勾选 {selected.size} 张</span>
                <span>完成 {stats.done} · 失败 {stats.failed}</span>
              </div>
            </div>
          </section>

          {/* 参数区(顺序对齐旧版习惯) */}
          <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-c-line bg-c-card p-4 md:grid-cols-3">
            <label className="space-y-1">
              <span className="block text-[12px] text-c-text3">生图模型商</span>
              <select disabled className="w-full rounded-lg border border-c-line bg-c-track/50 px-2.5 py-2 text-[13px] text-c-text3">
                <option>服务器自动分配</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[12px] text-c-text3">处理类型</span>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                className="w-full rounded-lg border border-c-line bg-c-card px-2.5 py-2 text-[13px]"
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[12px] text-c-text3">质量</span>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as typeof quality)}
                className="w-full rounded-lg border border-c-line bg-c-card px-2.5 py-2 text-[13px]"
              >
                {QUALITIES.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[12px] text-c-text3">分辨率</span>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as typeof resolution)}
                className="w-full rounded-lg border border-c-line bg-c-card px-2.5 py-2 text-[13px]"
              >
                {RESOLUTIONS.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[12px] text-c-text3">比例</span>
              <select
                value={ratio}
                onChange={(e) => setRatio(e.target.value as typeof ratio)}
                className="w-full rounded-lg border border-c-line bg-c-card px-2.5 py-2 text-[13px]"
              >
                {RATIOS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[12px] text-c-text3">等待秒数</span>
              <select
                value={waitSec}
                onChange={(e) => setWaitSec(Number(e.target.value))}
                className="w-full rounded-lg border border-c-line bg-c-card px-2.5 py-2 text-[13px]"
              >
                {[300, 600, 900, 1800].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-[12px] text-c-text3">覆盖已有结果</span>
              <select
                value={overwrite ? "是" : "否"}
                onChange={(e) => setOverwrite(e.target.value === "是")}
                className="w-full rounded-lg border border-c-line bg-c-card px-2.5 py-2 text-[13px]"
              >
                <option>否</option>
                <option>是</option>
              </select>
            </label>
            <div className="col-span-2 space-y-1 md:col-span-3">
              <span className="block text-[12px] text-c-text3">批量提示词(图一 = 产品图,图二 = 风格参考图;修改后同步到全部卡片)</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="w-full resize-y rounded-lg border border-c-line bg-c-card px-3 py-2 text-[13px] leading-5"
              />
            </div>
          </section>

          {/* 操作按钮行(顺序对齐旧版习惯) */}
          <section className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set(products.map((p) => p.id)))}>全选</Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>取消全选</Button>
            <Button
              size="sm"
              disabled={queueRunning || !selected.size || !user}
              onClick={generateSelected}
            >
              {queueRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              生成选中
            </Button>
            {queueRunning && (
              <Button variant="outline" size="sm" onClick={() => { queueAbort.current = true; }}>停止排队</Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void downloadSelected("results")} disabled={!products.length}>
              <Download className="h-4 w-4" /> 下载选中生成图
            </Button>
            <Button variant="outline" size="sm" onClick={() => void downloadSelected("sources")} disabled={!products.length}>
              下载选中原图
            </Button>
            <Button variant="outline" size="sm" onClick={() => void downloadSelected("both")} disabled={!products.length}>
              下载选中原图+生成图
            </Button>
            <span className="ml-auto text-[12px] text-c-text4">选中几张卡片,就同时发送几个任务;并发 {CONCURRENCY}。</span>
          </section>

          {/* 卡片区 */}
          {products.length === 0 ? (
            <section className="rounded-xl border border-c-line bg-c-card px-4 py-16 text-center text-[13px] text-c-text4">
              上传产品图后,这里会出现任务卡片
            </section>
          ) : (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => {
                const card = cards[p.id];
                const isSel = selected.has(p.id);
                return (
                  <div
                    key={p.id}
                    className={`overflow-hidden rounded-xl border bg-c-card transition-colors ${
                      isSel ? "border-accent" : "border-c-line"
                    }`}
                  >
                    <div className="flex items-center gap-2 border-b border-c-line px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(p.id);
                          else next.delete(p.id);
                          setSelected(next);
                        }}
                        className="h-4 w-4"
                      />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" title={p.name}>
                        {p.name}
                      </span>
                      {card?.status === "running" && (
                        <span className="flex items-center gap-1 text-[11.5px] text-c-text3">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 生成中
                        </span>
                      )}
                      {card?.status === "done" && (
                        <span className="text-[11.5px] text-emerald-600 dark:text-emerald-400">
                          完成 {card.results.length} 张
                        </span>
                      )}
                      {card?.status === "error" && (
                        <span className="text-[11.5px] text-red-600 dark:text-red-400">
                          {card.jobs.filter((j) => j.status === "error").length} 个失败
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.previewUrl} alt={p.name} className="h-36 w-full rounded-lg bg-c-track object-contain" />
                      {card && card.jobs.some((j) => j.status === "error") && (
                        <p className="mt-2 line-clamp-2 text-[11.5px] text-red-600 dark:text-red-400">
                          {card.jobs.find((j) => j.error)?.error}
                        </p>
                      )}
                      {card && card.results.length > 0 && (
                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                          {card.results.map((r) => (
                            <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="group relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={r.url}
                                alt={`${KIND_LABEL[r.kind]}结果`}
                                className="aspect-square w-full rounded-md border border-c-line object-cover"
                              />
                              <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 text-[10px] text-white">
                                {KIND_LABEL[r.kind]}
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          className="flex items-center gap-1 text-[12px] text-c-text3 hover:text-c-text disabled:opacity-50"
                          disabled={queueRunning || !isSel || !user}
                          onClick={() => void runQueue([p.id])}
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> 重跑此卡
                        </button>
                        {card?.results[0] && (
                          <button
                            className="flex items-center gap-1 text-[12px] text-c-text3 hover:text-c-text"
                            onClick={() => {
                              const r = card.results[0];
                              void fetchBlob(r.url).then((b) => saveBlob(b, `${p.name}_${KIND_LABEL[r.kind]}.${extFor(r.url)}`));
                            }}
                          >
                            <Download className="h-3.5 w-3.5" /> 下载首图
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {imagegenOpen&&<ImagegenPanel entry="workbench" inputs={[]} onClose={()=>setImagegenOpen(false)} onResult={()=>{}}/>}
          <p className="pb-6 pt-2 text-center text-[11.5px] text-c-text4">
            生成走主站模型通道并正常计积分;任务提交后可关闭页面,后台继续。
          </p>
        </main>
      </div>
      </div>
    </div>
  );
}
