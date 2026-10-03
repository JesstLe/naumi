"use client";
import { useImageQuality } from "@/lib/image-quality-context";
import { ImageQualityControl } from "@/components/image-quality-control";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Upload,
  X,
  Sparkles,
  Download,
  ImageIcon,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  RefreshCw,
  ChevronRight,
  Clock,
  Check,
  Wand2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { PromptAssistPopup } from "@/components/tools/prompt-assist-popup";
import { authHeader } from "@/lib/supabase";
import { useImageJobResume } from "@/components/use-image-job-resume";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cdnUrl } from "@/lib/cdn";
import { ImageLightbox } from "@/components/image-lightbox";
import { Media } from "@/components/media";
import { RecordPager, RECORDS_PER_PAGE } from "@/components/tools/record-pager";
import { GenLoader } from "@/components/gen-loader";
import { downloadImage } from "@/lib/download";
import { POINTS_PER_IMAGE, SUITE_PLATFORMS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { TextModelSelect } from "@/components/ui/text-model-select";

function fmt(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    s
  );
}

const MAX_UPLOAD = 12 * 1024 * 1024;
const RATIO_ASPECT: Record<string, string> = {
  "1:1": "aspect-square",
  "3:4": "aspect-[3/4]",
  "4:3": "aspect-[4/3]",
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
};

type Shot = {
  id: string;
  role: "main" | "sub" | "detail";
  label: string;
  ratio: string;
  status: "pending" | "done" | "error";
  url: string | null;
  gradient: string;
};

type CustomShot = {
  id: string;
  role: Shot["role"];
  label: string;
  ratio: string;
  instruction: string;
};

const CUSTOM_DEFAULTS: Omit<CustomShot, "id">[] = [
  { role: "main", label: "营销主图", ratio: "1:1", instruction: "产品主体完整，核心卖点醒目" },
  { role: "sub", label: "核心卖点", ratio: "1:1", instruction: "突出最重要的功能或优势" },
  { role: "sub", label: "细节特写", ratio: "1:1", instruction: "展示材质、做工或关键细节" },
  { role: "detail", label: "使用场景", ratio: "3:4", instruction: "展示真实使用方式与适用场景" },
  { role: "detail", label: "规格参数", ratio: "3:4", instruction: "信息清晰，避免臆造参数" },
];

function makeCustomShot(
  role: CustomShot["role"] = "sub",
  index = 0
): CustomShot {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    label:
      role === "main"
        ? "营销主图"
        : role === "detail"
          ? `详情图 ${index + 1}`
          : `副图 ${index + 1}`,
    ratio: role === "detail" ? "3:4" : "1:1",
    instruction: "",
  };
}

/* ── 套图示例展示:真实商品「原图 → 带标签结果宫格」,双商品可切换 ──
   对标竞品(product-set)的示例形态:黑底标签标注每张结果的商业用途,
   让用户一眼看懂「我会得到什么」。素材在 public/demos/suite-demo/。 */
const SUITE_DEMO_SETS = [
  {
    key: "thermos",
    label: "保温杯",
    src: "/demos/suite-demo/thermos-src.png",
    shots: [
      { tag: "主图", img: "/demos/suite-demo/thermos-main.png" },
      { tag: "卖点展示", img: "/demos/suite-demo/thermos-selling.png" },
      { tag: "细节特写", img: "/demos/suite-demo/thermos-detail.png" },
      { tag: "规格参数", img: "/demos/suite-demo/thermos-spec.png" },
    ],
  },
  {
    key: "suppl",
    label: "保健品",
    src: "/demos/suite-demo/suppl-src.png",
    shots: [
      { tag: "主图", img: "/demos/suite-demo/suppl-main.png" },
      { tag: "卖点展示", img: "/demos/suite-demo/suppl-selling.png" },
      { tag: "细节特写", img: "/demos/suite-demo/suppl-detail.png" },
      { tag: "规格参数", img: "/demos/suite-demo/suppl-spec.png" },
    ],
  },
];

function SuiteDemoShowcase() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false); // 显式暂停按钮
  const [hovered, setHovered] = useState(false); // 悬停自动暂停
  const set = SUITE_DEMO_SETS[idx];

  // 自动轮播:5s 切换下一个商品;悬停或手动暂停时停走。
  useEffect(() => {
    if (paused || hovered || SUITE_DEMO_SETS.length < 2) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % SUITE_DEMO_SETS.length),
      5000
    );
    return () => clearInterval(t);
  }, [paused, hovered]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="rounded-2xl bg-secondary/50 p-4">
        {/* 商品切换 + 暂停/播放 */}
        <div className="mb-3 flex items-center justify-center gap-1.5">
          {SUITE_DEMO_SETS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setIdx(i)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                i === idx
                  ? "border border-primary bg-primary/10 text-primary"
                  : "border border-transparent bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            aria-label={paused ? "播放" : "暂停"}
            title={paused ? "播放" : "暂停轮播"}
            className="ml-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            {paused ? (
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
                <path d="M3 1.5l7 4.5-7 4.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor">
                <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" />
              </svg>
            )}
          </button>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row">
          {/* 左:原图 */}
          <div className="relative sm:w-[38%] sm:self-start">
            <div className="aspect-square overflow-hidden rounded-xl border border-border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={set.src}
                alt={`${set.label} 原图`}
                className="h-full w-full object-cover"
              />
            </div>
            <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              商品原图
            </span>
          </div>
          {/* 右:2×2 结果宫格(带商业用途标签) */}
          <div className="grid flex-1 grid-cols-2 gap-2.5">
            {set.shots.map((s) => (
              <div
                key={s.tag}
                className="relative aspect-square overflow-hidden rounded-xl border border-border bg-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.img}
                  alt={s.tag}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {s.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-center text-[12px] text-c-text3">
        示例为 AI 生成的演示素材,实际结果以你的商品图为准。
      </p>
    </div>
  );
}

export function SuiteClient() {
  const { costPerImage } = useImageQuality();
  const { user, ready, remaining, applyServerUser } = useAuth();
  const { openAuth } = useAuthModal();
  const { t, locale } = useI18n();
  const L = (z: string, e: string) => (locale === "en" ? e : z);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [title2, setTitle2] = useState("");
  // 目标平台:决定套图风格与文案语言(淘宝/天猫=默认)。
  const [platform, setPlatform] = useState("taobao");
  const [points, setPoints] = useState("");
  // 产品图上限 4 张(设计稿权威:最多 4 张)
  const maxProduct = 4;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  // AI帮写/智能优化(贴按钮弹窗,全站统一;套图必传产品图)
  const assistBtnRef = useRef<HTMLButtonElement>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistRun, setAssistRun] = useState<{ mode: "write" | "optimize"; nonce: number } | null>(null);
  function openAssist(mode: "write" | "optimize") {
    if (!files[0]) {
      setError(L("请先上传图片", "Upload an image first"));
      return;
    }
    setError(null);
    setAssistOpen(true);
    setAssistRun({ mode, nonce: Date.now() });
  }
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(13);
  const [finished, setFinished] = useState(false);
  const [viewing, setViewing] = useState<Shot | null>(null);
  const [zipping, setZipping] = useState(false);
  // 右侧「本工具记录」(套图历史):列表 / 选中 / 放大 / 打包 / 分页。
  const [recItems, setRecItems] = useState<
    { id: string; url: string; gradient?: string }[] | null
  >(null);
  const [recSel, setRecSel] = useState<Set<string>>(new Set());
  const [recView, setRecView] = useState("");
  const [recZip, setRecZip] = useState(false);
  const [recPage, setRecPage] = useState(0);
  // 点记录 → 中间载入该张大图 + 提示词;null=显示当前套图结果。
  const [shownRec, setShownRec] = useState<{
    id: string;
    url: string;
    gradient?: string;
    prompt?: string;
  } | null>(null);

  // 套图结构:智能匹配固定 13 张；自定义按用户实际配置逐张计费。
  const [structure, setStructure] = useState<"auto" | "custom">("auto");
  const [customShots, setCustomShots] = useState<CustomShot[]>(() =>
    CUSTOM_DEFAULTS.map((item, index) => ({
      ...item,
      id: `custom-initial-${index}`,
    }))
  );
  const shotCount = structure === "custom" ? customShots.length : 13;
  const cost = shotCount * costPerImage;
  const customCounts = customShots.reduce(
    (counts, shot) => ({ ...counts, [shot.role]: counts[shot.role] + 1 }),
    { main: 0, sub: 0, detail: 0 }
  );

  function updateCustomShot(id: string, patch: Partial<CustomShot>) {
    setCustomShots((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.role && !patch.ratio) {
          next.ratio = patch.role === "detail" ? "3:4" : "1:1";
        }
        return next;
      })
    );
  }

  function addCustomShot(role: CustomShot["role"]) {
    setCustomShots((items) =>
      items.length >= 20 ? items : [...items, makeCustomShot(role, items.length)]
    );
  }

  function removeCustomShot(id: string) {
    setCustomShots((items) =>
      items.length <= 1 ? items : items.filter((item) => item.id !== id)
    );
  }

  function moveCustomShot(index: number, direction: -1 | 1) {
    setCustomShots((items) => {
      const target = index + direction;
      if (target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

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
      if (next.length >= maxProduct) break;
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

  const rememberJob=useImageJobResume("suite",user?.email,id=> { setLoading(true); startPolling(id); });
  function startPolling(jobId: string) {
      // 轮询进度
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
        const r = await fetch(`/api/suite?job=${jobId}`, {
          cache: "no-store",
          headers: await authHeader(),
        });
          const s = await r.json();
          if (!r.ok) { if (r.status===404 || r.status===403) { if(pollRef.current) clearInterval(pollRef.current); rememberJob(null); setLoading(false); setError(s.error || t("suite.errFail")); } return; }
          if (Array.isArray(s.shots)) setShots(s.shots);
          if (typeof s.done === "number") setDone(s.done);
          if (typeof s.total === "number") setTotal(s.total);
          if (s.status === "pending") setError(s.error || "");
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
            setError(s.error || t("suite.errFail"));
            setLoading(false);
          }
        } catch {
          /* 单次轮询失败忽略,下次再试 */
        }
      }, 2500);
  }

  async function generate() {
    setError(null);
    // 未登录:直接弹登录/注册窗(优先于上传校验),登录后再点生成。
    if (!user) {
      if (ready) openAuth("sign-in");
      return;
    }
    if (files.length === 0) {
      setError(t("suite.errNoImage"));
      return;
    }
    setLoading(true);
    setFinished(false);
    setShots([]);
    setDone(0);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("image", f));
      const copy = [
        title2.trim() && `主标题：${title2.trim()}`,
        points.trim() && `卖点：${points.trim()}`,
      ]
        .filter(Boolean)
        .join("；");
      if (copy) fd.append("text", copy);
      fd.append("platform", platform);
      fd.append("structure", structure);
      if (structure === "custom") {
        fd.append(
          "shots",
          JSON.stringify(
            customShots.map(({ role, label, ratio, instruction }) => ({
              role,
              label: label.trim(),
              ratio,
              instruction: instruction.trim(),
            }))
          )
        );
      }
      fd.append("email", user.email);
      const res = await fetch("/api/suite", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("suite.errFail"));
      const jobId: string = data.jobId;
      if (data.total) setTotal(data.total);

      rememberJob(jobId);
      startPolling(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("suite.errFail"));
      setLoading(false);
    }
  }

  // 打包 ZIP 下载:把图片 URL 交给服务端拉取+压缩(避免浏览器跨域 R2)
  async function downloadAll() {
    const items = shots
      .filter((s) => s.status === "done" && s.url)
      .map((s) => ({ url: s.url!, name: s.label }));
    if (items.length === 0) return;
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
      a.download = `星泽商图-套图-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // 服务端打包失败时,退化为逐张下载
      shots
        .filter((s) => s.status === "done" && s.url)
        .forEach((s, i) =>
          setTimeout(() => downloadImage(s.url!, `suite-${s.label}-${i + 1}`), i * 350)
        );
    } finally {
      setZipping(false);
    }
  }

  const group = (role: Shot["role"]) => shots.filter((s) => s.role === role);
  const hasResult = shots.length > 0;

  // 本工具记录:套图作品(batch_id 以 "suite-" 开头);套图完成后刷新。
  useEffect(() => {
    if (!user?.email) {
      setRecItems(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/account?email=${encodeURIComponent(user.email)}`,
          { headers: await authHeader() }
        );
        if (!r.ok || cancelled) return;
        const d = await r.json();
        const arts = (d.artworks ?? []) as {
          id: string;
          image: string;
          status?: string;
          gradient?: string;
          batchId?: string;
          prompt?: string;
        }[];
        if (cancelled) return;
        setRecItems(
          arts
            .filter(
              (a) =>
                a.image &&
                a.status !== "failed" &&
                (a.batchId ?? "").startsWith("suite-")
            )
            .slice(0, 60)
            .map((a) => ({
              id: a.id,
              url: a.image,
              gradient: a.gradient,
              prompt: a.prompt,
            }))
        );
        setRecPage(0);
        setShownRec(null);
      } catch {
        if (!cancelled) setRecItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email, finished]);

  function toggleRecSel(id: string) {
    setRecSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function downloadRecSelected() {
    const items = (recItems ?? [])
      .filter((r) => recSel.has(r.id))
      .map((r, i) => ({ url: r.url, name: `套图-${i + 1}` }));
    if (!items.length) return;
    setRecZip(true);
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
      a.download = `星泽商图-套图记录-${items.length}张.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      items.forEach((it, i) =>
        setTimeout(() => downloadImage(it.url, it.name), i * 350)
      );
    } finally {
      setRecZip(false);
    }
  }

  return (
    <div className="w-full px-5 py-6 sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="mb-4">
          <nav className="flex items-center gap-1.5 text-[13px]">
            <Link
              href="/tools"
              className="text-c-text3 transition-colors hover:text-c-text"
            >
              创作工具
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-c-text4" />
            <span className="font-semibold text-c-text">{t("suite.title")}</span>
          </nav>
        </div>
    <div className="grid gap-5 lg:h-[890px] lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_280px]">
      {/* 左:参数面板 */}
      <div className="h-fit space-y-5 rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
        {/* 工具头:图标 + 名称 + 描述(与其它工具页一致) */}
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-[10px]" style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}>
            <ImageIcon className="h-[21px] w-[21px]" strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h1 className="text-[16px] font-bold text-c-text">
              {t("suite.title")}
            </h1>
            <p className="text-[12px] text-c-text3">
              上传产品图,自动出 1 主图 + 4 副图 + 8 详情页图
            </p>
          </div>
        </div>
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-c-text2">文字规划模型</p>
          <TextModelSelect />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {t("suite.uploadLabel")}
            <span className="ml-1 text-xs text-c-text3">最多 {maxProduct} 张</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => pickFiles(e.target.files)}
          />
          {/* 小尺寸缩略图横排,不再占大块 */}
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
                  aria-label={t("suite.removeImage")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {files.length < maxProduct && (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border bg-secondary/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Upload className="h-4 w-4" />
                <span className="text-[10px]">{t("suite.addImage")}</span>
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            {L("目标平台", "Target platform")}
          </label>
          <div className="flex flex-wrap gap-2">
            {SUITE_PLATFORMS.map((pf) => (
              <button
                key={pf.id}
                type="button"
                onClick={() => setPlatform(pf.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors",
                  platform === pf.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                )}
              >
                {pf.label}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            {L(
              "国内平台出中文风格图,亚马逊/跨境出简约英文风格图。",
              "China platforms → Chinese style; Amazon/cross-border → minimal English."
            )}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t("suite.titleLabel")}</label>
          <input
            value={title2}
            onChange={(e) => setTitle2(e.target.value)}
            placeholder={t("suite.titlePlaceholder")}
            className="w-full rounded-[10px] border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{t("suite.pointsLabel")}</label>
            <div className="flex items-center gap-2">
              {points.trim() && (
                <button
                  type="button"
                  onClick={() => openAssist("optimize")}
                  className="inline-flex items-center gap-1 rounded-md bg-acc-tint px-2 py-1 text-[11.5px] font-medium text-acc hover:brightness-95"
                >
                  <Sparkles className="h-3 w-3" />
                  {L("智能优化", "Optimize")}
                </button>
              )}
              <button
                ref={assistBtnRef}
                type="button"
                onClick={() => openAssist("write")}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-acc hover:underline"
              >
                <Wand2 className="h-3.5 w-3.5" />
                {L("AI帮写", "AI write")}
              </button>
            </div>
          </div>
          <PromptAssistPopup
            open={assistOpen}
            onClose={() => setAssistOpen(false)}
            anchorRef={assistBtnRef}
            tool="suite"
            currentPrompt={points}
            imageFile={files[0] ?? null}
            imageThumb={previews[0] ?? ""}
            run={assistRun}
            onUse={(t2) => setPoints(t2)}
          />
          <Textarea
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            placeholder={t("suite.pointsPlaceholder")}
            className="min-h-[64px] bg-secondary"
          />
          <p className="text-xs text-muted-foreground">{t("suite.textHint")}</p>
        </div>

        {/* 套图结构配置:智能匹配 / 自定义逐张编排。 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {L("套图结构配置", "Suite structure")}
          </label>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setStructure("auto")}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                structure === "auto"
                  ? "border-primary/60 bg-primary/5"
                  : "border-border hover:bg-secondary/40"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border",
                  structure === "auto"
                    ? "border-primary"
                    : "border-muted-foreground/40"
                )}
              >
                {structure === "auto" && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-c-text">
                  {L("智能匹配", "Smart match")}
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                  {L(
                    "AI 辅助布局,按平台 Listing 架构自动安排 1 主图 + 4 副图 + 8 详情。",
                    "AI plans 1 hero + 4 secondary + 8 details to match the platform listing structure."
                  )}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStructure("custom")}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                structure === "custom"
                  ? "border-primary/60 bg-primary/5"
                  : "border-border hover:bg-secondary/40"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border",
                  structure === "custom"
                    ? "border-primary"
                    : "border-muted-foreground/40"
                )}
              >
                {structure === "custom" && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-c-text">
                  {L("自定义配置", "Custom")}
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                  {L(
                    "自由增删图片数量与版式,按需出图。",
                    "Freely add/remove shots and layouts."
                  )}
                </span>
              </span>
            </button>
          </div>

          {structure === "custom" && (
            <div className="space-y-2 border-l-2 border-primary/25 pl-3 pt-1">
              <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                <span>
                  {customShots.length} {L("张", "shots")} · {L("拖动顺序按上下按钮调整", "Use arrows to reorder")}
                </span>
                <span>{L("最多 20 张", "Up to 20")}</span>
              </div>
              {customShots.map((shot, index) => (
                <div
                  key={shot.id}
                  data-testid={`custom-shot-${index + 1}`}
                  className="border border-c-border bg-c-subtle2 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-center text-[11px] font-semibold text-c-text3">
                      {index + 1}
                    </span>
                    <select
                      value={shot.role}
                      onChange={(event) =>
                        updateCustomShot(shot.id, {
                          role: event.target.value as CustomShot["role"],
                        })
                      }
                      aria-label={L(`第 ${index + 1} 张类型`, `Shot ${index + 1} role`)}
                      className="h-8 border border-c-border bg-white px-2 text-[12px] outline-none focus:border-primary"
                    >
                      <option value="main">{L("主图", "Hero")}</option>
                      <option value="sub">{L("副图", "Sub")}</option>
                      <option value="detail">{L("详情", "Detail")}</option>
                    </select>
                    <select
                      value={shot.ratio}
                      onChange={(event) =>
                        updateCustomShot(shot.id, { ratio: event.target.value })
                      }
                      aria-label={L(`第 ${index + 1} 张画幅`, `Shot ${index + 1} ratio`)}
                      className="h-8 border border-c-border bg-white px-2 text-[12px] outline-none focus:border-primary"
                    >
                      {["1:1", "3:4", "4:3", "16:9", "9:16"].map((ratio) => (
                        <option key={ratio} value={ratio}>{ratio}</option>
                      ))}
                    </select>
                    <div className="ml-auto flex items-center">
                      <button
                        type="button"
                        onClick={() => moveCustomShot(index, -1)}
                        disabled={index === 0}
                        aria-label={L("上移", "Move up")}
                        className="grid h-7 w-7 place-items-center text-c-text3 hover:bg-white hover:text-c-text disabled:opacity-25"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCustomShot(index, 1)}
                        disabled={index === customShots.length - 1}
                        aria-label={L("下移", "Move down")}
                        className="grid h-7 w-7 place-items-center text-c-text3 hover:bg-white hover:text-c-text disabled:opacity-25"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCustomShot(shot.id)}
                        disabled={customShots.length === 1}
                        aria-label={L("删除", "Delete")}
                        className="grid h-7 w-7 place-items-center text-c-text3 hover:bg-red-50 hover:text-red-600 disabled:opacity-25"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <input
                    value={shot.label}
                    maxLength={40}
                    onChange={(event) =>
                      updateCustomShot(shot.id, { label: event.target.value })
                    }
                    aria-label={L(`第 ${index + 1} 张标题`, `Shot ${index + 1} title`)}
                    placeholder={L("图片标题", "Shot title")}
                    className="mt-2 h-8 w-full border border-c-border bg-white px-2.5 text-[12px] outline-none focus:border-primary"
                  />
                  <input
                    value={shot.instruction}
                    maxLength={240}
                    onChange={(event) =>
                      updateCustomShot(shot.id, { instruction: event.target.value })
                    }
                    aria-label={L(`第 ${index + 1} 张要求`, `Shot ${index + 1} instruction`)}
                    placeholder={L("这张图的内容或版式要求（选填）", "Content or layout requirement (optional)")}
                    className="mt-2 h-8 w-full border border-c-border bg-white px-2.5 text-[12px] outline-none focus:border-primary"
                  />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-1.5">
                {(["main", "sub", "detail"] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => addCustomShot(role)}
                    disabled={customShots.length >= 20}
                    aria-label={
                      role === "main"
                        ? L("新增主图", "Add hero")
                        : role === "sub"
                          ? L("新增副图", "Add sub")
                          : L("新增详情图", "Add detail")
                    }
                    className="inline-flex h-8 items-center justify-center gap-1 border border-dashed border-c-border bg-white text-[11.5px] text-c-text3 hover:border-primary/50 hover:text-c-text disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                    {role === "main"
                      ? L("主图", "Hero")
                      : role === "sub"
                        ? L("副图", "Sub")
                        : L("详情", "Detail")}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <ImageQualityControl disabled={loading} />
          <div className="rounded-xl bg-secondary/50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{t("suite.output")}</span>
            <span className="font-medium">
              {structure === "auto"
                ? t("suite.outputDetail")
                : L(
                    `${customCounts.main} 主图 + ${customCounts.sub} 副图 + ${customCounts.detail} 详情`,
                    `${customCounts.main} hero + ${customCounts.sub} sub + ${customCounts.detail} detail`
                  )}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted-foreground">{t("suite.costLabel")}</span>
            <span className="font-semibold text-primary">
              {fmt(t("suite.creditsUnit"), { n: cost })}
            </span>
          </div>
        </div>
        {ready && user && (
          <p className="-mt-3 text-right text-xs text-muted-foreground">
            {t("suite.balance")}: {remaining}
          </p>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <Button
          variant="gradient"
          className="h-12 w-full text-[15px]"
          onClick={generate}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading
            ? fmt(t("suite.generating"), { done, total })
            : `${L("生成商品套图", "Generate product suite")}（${L("预计", "~")}${fmt(t("suite.creditsUnit"), { n: cost })}）`}
        </Button>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("suite.note")}
        </p>
      </div>

      {/* 中:结果区 */}
      <div className="flex min-h-[520px] flex-col rounded-card border border-c-border bg-c-card p-5 shadow-card nv-panel-scroll lg:h-full lg:min-h-0 lg:overflow-y-auto">
        {shownRec ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-c-text">记录详情</h3>
              <button
                type="button"
                onClick={() => setShownRec(null)}
                className="text-[12.5px] font-medium text-acc hover:underline"
              >
                ← 返回当前
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-hidden rounded-[13px] border border-c-border bg-c-subtle2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cdnUrl(shownRec.url)}
                alt=""
                onClick={() => setRecView(shownRec.url)}
                className="max-h-[460px] max-w-full cursor-zoom-in object-contain"
              />
            </div>
            {shownRec.prompt && (
              <div className="mt-3 rounded-field bg-c-subtle2 px-3 py-2 text-[12px] leading-relaxed text-c-text2">
                <span className="font-medium text-c-text3">提示词:</span>{" "}
                {shownRec.prompt}
              </div>
            )}
          </div>
        ) : (
          <>
        {!hasResult && !loading && (
          <>
            {/* 头部行 + demo(flex-1)+ 底部 note:与其它功能页同构,示例图位置一致。 */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-c-text">
                {t("suite.resultTitle")}
              </h2>
              <span className="text-[12.5px] text-c-text3">
                {L("示例预览", "Preview")}
              </span>
            </div>
            <SuiteDemoShowcase />
            <p className="mt-3 text-center text-[11px] text-c-text4">
              {L(
                "生成结果将自动保存到「作品库」,保留 180 天",
                "Results are auto-saved to your Library for 180 days"
              )}
            </p>
          </>
        )}

        {(hasResult || loading) && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{t("suite.resultTitle")}</h3>
                <span className="text-xs text-muted-foreground">
                  {fmt(t("suite.progress"), { done, total })}
                </span>
              </div>
              {finished && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadAll}
                  disabled={zipping}
                >
                  {zipping ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {t("suite.downloadAll")}
                </Button>
              )}
            </div>

            {structure === "custom" ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {L("自定义顺序", "Custom order")}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {shots.map((s) => (
                    <ShotCard
                      key={s.id}
                      shot={s}
                      t={t}
                      onView={() => setViewing(s)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              (["main", "sub", "detail"] as const).map((role) => {
                const list = group(role);
                if (list.length === 0 && !loading) return null;
                return (
                  <div key={role} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {role === "main"
                        ? t("suite.groupMain")
                        : role === "sub"
                          ? t("suite.groupSub")
                          : t("suite.groupDetail")}
                    </p>
                    <div
                      className={cn(
                        "grid gap-3",
                        role === "main"
                          ? "grid-cols-2 sm:grid-cols-3"
                          : "grid-cols-2 sm:grid-cols-4"
                      )}
                    >
                      {list.map((s) => (
                        <ShotCard
                          key={s.id}
                          shot={s}
                          t={t}
                          onView={() => setViewing(s)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* 右:本工具记录(套图历史) */}
      <aside className="hidden rounded-card border border-c-border bg-c-card p-4 shadow-card xl:flex xl:h-full xl:flex-col">
        <div className="mb-3 flex min-h-[28px] items-center gap-1.5">
          <Clock className="h-4 w-4 text-c-text3" />
          <span className="text-[13px] font-semibold text-c-text">本工具记录</span>
          {recItems && recItems.length > 0 && (
            <span className="text-[12px] text-c-text3">· {recItems.length} 张</span>
          )}
          {recSel.size > 0 && (
            <button
              type="button"
              onClick={downloadRecSelected}
              disabled={recZip}
              className="ml-auto inline-flex items-center gap-1 rounded-[8px] bg-acc px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:brightness-95 disabled:opacity-60"
            >
              {recZip ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              下载 {recSel.size}
            </button>
          )}
        </div>
        <div className="nv-panel-scroll min-h-0 flex-1 overflow-y-auto pr-0.5">
          {recItems === null && user ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="nv-skeleton aspect-square rounded-lg" />
              ))}
            </div>
          ) : recItems && recItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {recItems
                .slice(recPage * RECORDS_PER_PAGE, (recPage + 1) * RECORDS_PER_PAGE)
                .map((r) => {
                  const sel = recSel.has(r.id);
                  return (
                    <div
                      key={r.id}
                      onClick={() => setShownRec(r)}
                      title="点击查看大图 / 详情"
                      className={cn(
                        "group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all",
                        shownRec?.id === r.id
                          ? "border-acc"
                          : sel
                            ? "border-acc/40"
                            : "border-c-border hover:border-c-border2"
                      )}
                    >
                      <Media
                        src={cdnUrl(r.url)}
                        alt=""
                        gradient={r.gradient}
                        thumbWidth={220}
                        ratio="aspect-square"
                        className="rounded-none border-0 transition-transform group-hover:scale-105"
                      />
                      <span
                        role="checkbox"
                        aria-checked={sel}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRecSel(r.id);
                        }}
                        className={cn(
                          "absolute left-1 top-1 grid h-5 w-5 cursor-pointer place-items-center rounded-[6px] border-2 transition-colors",
                          sel
                            ? "border-acc bg-acc text-white"
                            : "border-white bg-black/25 text-transparent hover:bg-black/40"
                        )}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="px-2 py-10 text-center text-[12px] text-c-text3">
              还没有套图记录
            </p>
          )}
        </div>
        <RecordPager
          page={recPage}
          total={Math.ceil((recItems?.length ?? 0) / RECORDS_PER_PAGE)}
          onPage={setRecPage}
        />
        <Link
          href="/works"
          className="mt-3 text-center text-[12px] font-medium text-acc hover:underline"
        >
          在作品库查看全部 →
        </Link>
      </aside>
    </div>
      </div>

      {/* 看大图 lightbox */}
      {viewing && viewing.url && (
        <ImageLightbox
          src={cdnUrl(viewing.url)}
          alt={viewing.label}
          onClose={() => setViewing(null)}
          downloadName="星泽商图-套图"
        />
      )}
      {/* 记录列放大 */}
      {recView && (
        <ImageLightbox
          src={recView}
          onClose={() => setRecView("")}
          downloadName="星泽商图-套图"
        />
      )}
    </div>
  );
}

function ShotCard({
  shot,
  t,
  onView,
}: {
  shot: Shot;
  t: (k: string) => string;
  onView: () => void;
}) {
  return (
    <div className="group space-y-1.5">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border bg-gradient-to-br",
          shot.gradient,
          RATIO_ASPECT[shot.ratio] ?? "aspect-square"
        )}
      >
        {shot.status === "done" && shot.url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cdnUrl(shot.url)}
              alt={shot.label}
              className="absolute inset-0 h-full w-full object-cover"
            />
            {/* 点图 → 看大图 */}
            <button
              onClick={onView}
              className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-transparent transition-all group-hover:bg-slate-900/35 group-hover:text-white"
              aria-label={t("suite.view")}
            >
              <Maximize2 className="h-5 w-5" />
            </button>
            {/* 左下角:以此图再做(跳生图页,以该图为源图) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = `/generate?src=${encodeURIComponent(
                  shot.url!
                )}`;
              }}
              className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-[rgba(22,24,29,.6)] px-2.5 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-all hover:bg-[rgba(22,24,29,.8)] group-hover:opacity-100"
            >
              <RefreshCw className="h-3 w-3" />
              {t("suite.remakeFromThis")}
            </button>
            {/* 右下角单张下载,不挡看大图 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadImage(shot.url!, `suite-${shot.label}`);
              }}
              className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-card/85 text-foreground opacity-0 shadow transition-opacity hover:bg-card group-hover:opacity-100"
              aria-label={t("suite.download")}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </>
        ) : shot.status === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-red-400" />
          </div>
        ) : (
          <GenLoader compact />
        )}
        {shot.status === "done" && (
          <CheckCircle2 className="absolute right-1.5 top-1.5 h-4 w-4 text-emerald-500 drop-shadow" />
        )}
      </div>
      <p className="truncate text-[11px] text-muted-foreground">{shot.label}</p>
    </div>
  );
}
