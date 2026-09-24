"use client";

import { cdnUrl } from "@/lib/cdn";
import { setPendingRefs } from "@/lib/pending-refs";
import { toolBySlug, type ToolMeta } from "@/lib/tool-meta";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  LayoutGrid,
  Network,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";
import { Media } from "@/components/media";
import { useI18n } from "@/lib/i18n/locale-context";
import { useAuth } from "@/lib/auth-context";
import { authHeader } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { PickedTemplate } from "@/lib/homepage-picks";

type RecentWork = {
  id: string;
  image: string;
  title?: string;
  status?: string;
  gradient?: string;
  createdAt?: string;
};

const MAX_REF_FILES = 6;
const MAX_REF_BYTES = 12 * 1024 * 1024;

// Hero 输入框 = 智能体入口:提交后跳 /brain 自动首发(?prompt=)。
// 附带参考图经 setPendingRefs 模块变量随路由带过去,由智能体页上传后随消息发出。

// 图标行:画布与全部工具不在 tool-meta 里,自定义;其余取 tool-meta 双语标题。
const ROW_TOOLS = ["generate", "suite", "cutout", "inpaint", "competitors"];
const ROW_CUSTOM: { href: string; title: string; titleEn: string; Icon: LucideIcon }[] = [
  { href: "/canvas", title: "创作画布", titleEn: "Canvas", Icon: Network },
  { href: "/tools", title: "全部工具", titleEn: "All tools", Icon: LayoutGrid },
];

// 快捷 chips:高频工作流(tool-meta 提供 icon/双语标题/链接)
const CHIP_SLUGS = ["suite", "aplus", "replicate", "tryon"];

// HOT 工具卡:轮换马卡龙底色(低透明度渐变,明暗主题通用)
const HOT_SLUGS = ["retouch", "replicate", "cutout", "dewatermark", "tryon"];
const HOT_TINTS = [
  "rgba(245,158,11,0.14)",
  "rgba(244,63,94,0.12)",
  "rgba(14,165,233,0.13)",
  "rgba(16,185,129,0.13)",
  "rgba(139,92,246,0.13)",
];

export function HomeDashboard({ hot }: { hot: PickedTemplate[] }) {
  const { t, locale } = useI18n();
  const { user, ready, remaining } = useAuth();
  const router = useRouter();
  const L = (zh: string, en: string) => (locale === "en" ? en : zh);
  const [recent, setRecent] = useState<RecentWork[] | null>(null);
  const [stats, setStats] = useState<{ today: number; total: number }>({
    today: 0,
    total: 0,
  });

  // Hero 输入框状态
  const [composerText, setComposerText] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [composerPreviews, setComposerPreviews] = useState<string[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const composerFileRef = useRef<HTMLInputElement>(null);
  const composerTextRef = useRef<HTMLTextAreaElement>(null);

  // 问候语随本地时段
  const [greet, setGreet] = useState("home.dash.greetEvening");
  const [dateLabel, setDateLabel] = useState("");
  useEffect(() => {
    const d = new Date();
    const h = d.getHours();
    setGreet(
      h < 12
        ? "home.dash.greetMorning"
        : h < 18
          ? "home.dash.greetAfternoon"
          : "home.dash.greetEvening"
    );
    setDateLabel(
      locale === "en"
        ? d.toLocaleDateString("en-US", { month: "long", day: "numeric" })
        : `${d.getMonth() + 1} 月 ${d.getDate()} 日`
    );
  }, [locale]);

  // 拉作品:最近 8 张 + 统计(今日生成 / 累计作品)
  useEffect(() => {
    if (!user?.email) {
      setRecent(null);
      setStats({ today: 0, total: 0 });
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
        const arts = (d.artworks ?? []) as RecentWork[];
        if (cancelled) return;
        const done = arts.filter((a) => a.image && a.status !== "failed");
        const todayStr = new Date().toDateString();
        const today = done.filter(
          (a) => a.createdAt && new Date(a.createdAt).toDateString() === todayStr
        ).length;
        setStats({ today, total: done.length });
        setRecent(done.slice(0, 8));
      } catch {
        if (!cancelled) setRecent([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  // 参考图预览的对象 URL:卸载时回收
  useEffect(() => {
    return () => {
      composerPreviews.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = useMemo(() => {
    if (user?.name) return `${t(greet)}，${user.name}`;
    return t("home.dash.greetGuest");
  }, [user?.name, greet, t]);

  const statPills = [
    { label: L("今日生成", "Today"), value: `${stats.today.toLocaleString("en-US")}${L(" 张", "")}` },
    { label: L("积分余额", "Credits"), value: remaining.toLocaleString("en-US"), href: user ? "/plans" : undefined, accent: true },
    { label: L("累计作品", "Works"), value: stats.total.toLocaleString("en-US") },
  ];

  function autoGrowTextarea() {
    const el = composerTextRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(150, el.scrollHeight)}px`;
  }

  function pickComposerFiles(list: FileList | null) {
    if (!list || !list.length) return;
    setComposerError(null);
    const accepted: File[] = [];
    for (const f of Array.from(list)) {
      if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
        setComposerError(L("仅支持 PNG / JPG / WebP 图片", "PNG / JPG / WebP only"));
        continue;
      }
      if (f.size > MAX_REF_BYTES) {
        setComposerError(L("单张图片过大，请小于 12MB", "Each image must be under 12MB"));
        continue;
      }
      accepted.push(f);
      if (accepted.length >= MAX_REF_FILES - composerFiles.length) break;
    }
    if (!accepted.length) return;
    setComposerFiles((prev) => [...prev, ...accepted]);
    setComposerPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
    if (composerFileRef.current) composerFileRef.current.value = "";
  }

  function removeComposerFile(index: number) {
    setComposerPreviews((prev) => {
      const u = prev[index];
      if (u) URL.revokeObjectURL(u);
      return prev.filter((_, i) => i !== index);
    });
    setComposerFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function submitComposer() {
    const text = composerText.trim();
    if (!text) return;
    // 参考图交给智能体页:pending-refs 模块变量在客户端路由跳转后仍存活
    if (composerFiles.length) setPendingRefs(composerFiles);
    const query = new URLSearchParams({ prompt: text });
    router.push(`/brain?${query.toString()}`);
  }

  return (
    <div className="relative w-full px-5 py-8 sm:px-6 lg:px-8">
      {/* Hero 淡渐变背景(竞品同款顶部光晕,低透明度明暗通用) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
        style={{
          background:
            "radial-gradient(640px 300px at 50% 0%, rgba(99,102,241,0.10), rgba(99,102,241,0) 70%)",
        }}
      />

      {/* Hero:居中问候 + 统计药丸 + 输入框 + chips + 图标行 */}
      <div className="relative mx-auto w-full max-w-[860px]">
        <div className="text-center">
          <h1 className="text-[28px] font-bold tracking-tight text-c-text sm:text-[32px]">
            {greeting}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-c-text3">
            {dateLabel}
            {dateLabel && " · "}
            {t("home.dash.welcome")}
          </p>
          {/* 统计药丸(次要信息,从原三卡缩小;积分可点去充值) */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {statPills.map((pill) => {
              const body = (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-c-border bg-c-card px-3.5 py-1.5 text-xs shadow-card transition-colors",
                    pill.href && "hover:border-c-border2"
                  )}
                >
                  <span className="text-c-text3">{pill.label}</span>
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      pill.accent ? "text-acc" : "text-c-text"
                    )}
                  >
                    {pill.value}
                  </span>
                </span>
              );
              return pill.href ? (
                <Link key={pill.label} href={pill.href}>
                  {body}
                </Link>
              ) : (
                <span key={pill.label}>{body}</span>
              );
            })}
          </div>
        </div>

        {/* 大输入框 */}
        <div className="mt-7 rounded-[20px] border border-c-border bg-c-card p-4 shadow-pop transition-colors focus-within:border-c-border2">
          <div className="flex items-start gap-3">
            <button
              type="button"
              title={t("home.dash.composeAttach")}
              onClick={() => composerFileRef.current?.click()}
              className="relative flex h-11 w-11 flex-none items-center justify-center rounded-[13px] border border-dashed border-c-border text-c-text3 transition-colors hover:border-acc hover:text-acc"
            >
              <Plus className="h-5 w-5" />
              {composerFiles.length > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-acc px-1 text-[10px] font-bold text-white">
                  {composerFiles.length}
                </span>
              )}
            </button>
            <textarea
              ref={composerTextRef}
              rows={1}
              value={composerText}
              placeholder={t("home.dash.composePlaceholder")}
              onChange={(e) => {
                setComposerText(e.target.value);
                autoGrowTextarea();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submitComposer();
                }
              }}
              className="max-h-[150px] min-h-[44px] w-full flex-1 resize-none bg-transparent py-2.5 text-[14.5px] leading-relaxed text-c-text outline-none placeholder:text-c-text3"
            />
          </div>

          {/* 参考图缩略 / 错误提示 + 发送按钮 */}
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {composerPreviews.map((url, index) => (
                <span key={url} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="h-10 w-10 rounded-[10px] border border-c-border object-cover"
                  />
                  <button
                    type="button"
                    aria-label={L("移除参考图", "Remove reference")}
                    onClick={() => removeComposerFile(index)}
                    className="absolute -right-1.5 -top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-c-text text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              {composerError && (
                <span className="text-xs font-medium text-red-500">{composerError}</span>
              )}
            </div>
            <button
              type="button"
              aria-label={t("home.dash.composeSend")}
              disabled={!composerText.trim()}
              onClick={submitComposer}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full [background:var(--grad-acc)] text-white shadow-btn transition-all hover:opacity-90 disabled:opacity-30"
            >
              <ArrowUp className="h-[18px] w-[18px]" />
            </button>
          </div>
          <input
            ref={composerFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => pickComposerFiles(e.target.files)}
          />
        </div>

        {/* 快捷工作流 chips */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {CHIP_SLUGS.map((slug) => {
            const tool = toolBySlug(slug);
            if (!tool) return null;
            return (
              <Link
                key={slug}
                href={tool.href}
                className="inline-flex items-center gap-2.5 rounded-full border border-c-border bg-c-card py-1.5 pl-2 pr-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:border-c-border2"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-acc-tint text-acc">
                  <tool.Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[13px] font-semibold text-c-text">
                  {L(tool.key, tool.en)}
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 text-c-text3" />
              </Link>
            );
          })}
        </div>

        {/* 图标入口行(原三功能卡并入:生图/套图/画布在此) */}
        <div className="mt-7 flex flex-wrap items-start justify-center gap-x-6 gap-y-4 sm:gap-x-9">
          {ROW_CUSTOM.slice(0, 1).map((item) => (
            <IconRowLink key={item.href} href={item.href} label={L(item.title, item.titleEn)} Icon={item.Icon} />
          ))}
          {ROW_TOOLS.map((slug) => {
            const tool = toolBySlug(slug);
            if (!tool) return null;
            return <IconRowLink key={slug} href={tool.href} label={L(tool.key, tool.en)} Icon={tool.Icon} />;
          })}
          {ROW_CUSTOM.slice(1).map((item) => (
            <IconRowLink key={item.href} href={item.href} label={L(item.title, item.titleEn)} Icon={item.Icon} />
          ))}
        </div>
      </div>

      {/* HOT 工具卡(马卡龙底色横卡,数据源 tool-meta) */}
      <section className="relative mt-12">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-base font-extrabold uppercase italic tracking-tight text-c-text">
            HOT
          </span>
          <h2 className="text-base font-semibold text-c-text">
            {t("home.dash.hotToolsTitle")}
          </h2>
          <Link
            href="/tools"
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-acc hover:underline"
          >
            {t("home.dash.viewAll")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {HOT_SLUGS.map((slug, index) => {
            const tool = toolBySlug(slug);
            if (!tool) return null;
            return <HotToolCard key={slug} tool={tool} tint={HOT_TINTS[index % HOT_TINTS.length]} />;
          })}
        </div>
      </section>

      {/* 最近作品(横向滚动条) */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-c-text">
            {t("home.dash.recentTitle")}
          </h2>
          {user && recent && recent.length > 0 && (
            <Link
              href="/works"
              className="inline-flex items-center gap-1 text-sm font-medium text-acc hover:underline"
            >
              {t("home.dash.viewAll")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        {!ready || (user && recent === null) ? (
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="nv-skeleton aspect-[3/4] w-[150px] shrink-0 rounded-[12px]"
              />
            ))}
          </div>
        ) : !user ? (
          <div className="rounded-card border border-dashed border-c-border bg-c-card px-5 py-12 text-center text-sm text-c-text3">
            {t("home.dash.signInHint")}
          </div>
        ) : recent && recent.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
            {recent.slice(0, 8).map((a) => (
              <Link
                key={a.id}
                href="/works"
                className="group relative block w-[150px] shrink-0 overflow-hidden rounded-[12px] border border-c-border bg-c-subtle"
              >
                <Media
                  src={cdnUrl(a.image)}
                  alt={a.title || ""}
                  gradient={a.gradient}
                  thumbWidth={400}
                  ratio="aspect-[3/4]"
                  className="rounded-none border-0 transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-c-border bg-c-card px-5 py-12 text-center text-sm text-c-text3">
            {t("home.dash.recentEmpty")}
          </div>
        )}
      </section>

      {/* 推荐模板 */}
      {hot.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              {t("home.dash.hotTitle")}
            </h2>
            <Link
              href="/templates"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {t("home.dash.viewAll")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {hot.slice(0, 5).map((tpl) => (
              <Link
                key={tpl.id}
                href={`/generate?template=${encodeURIComponent(tpl.id)}`}
                className="group overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] transition-all hover:-translate-y-1"
              >
                <Media
                  src={cdnUrl(tpl.image)}
                  alt={tpl.title}
                  gradient={tpl.gradient}
                  thumbWidth={480}
                  ratio="aspect-[4/5]"
                  className="rounded-none border-0"
                />
                <div className="px-3 py-2.5">
                  <p className="line-clamp-1 text-xs font-semibold text-foreground">
                    {tpl.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-primary">{tpl.category}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function IconRowLink({ href, label, Icon }: { href: string; label: string; Icon: LucideIcon }) {
  return (
    <Link href={href} className="group flex w-[72px] flex-col items-center gap-2">
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-c-border bg-c-card text-c-text2 shadow-card transition-all group-hover:-translate-y-0.5 group-hover:border-acc group-hover:text-acc">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-center text-xs font-medium text-c-text2 transition-colors group-hover:text-c-text">
        {label}
      </span>
    </Link>
  );
}

function HotToolCard({ tool, tint }: { tool: ToolMeta; tint: string }) {
  const { locale } = useI18n();
  const label = locale === "en" ? tool.en : tool.key;
  return (
    <Link
      href={tool.href}
      className="group relative flex min-h-[118px] flex-col justify-between overflow-hidden rounded-2xl border border-c-border p-4 shadow-card transition-all hover:-translate-y-1"
      style={{ background: `linear-gradient(135deg, ${tint}, rgba(255,255,255,0.02))` }}
    >
      <tool.Icon className="absolute -bottom-3 -right-3 h-20 w-20 rotate-12 text-c-text opacity-[0.06]" />
      <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-c-card text-acc shadow-card">
        <tool.Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="relative">
        <span className="flex items-center gap-1 text-[14px] font-bold text-c-text">
          {label}
          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="mt-0.5 line-clamp-1 block text-[11.5px] text-c-text3">
          {tool.desc}
        </span>
      </span>
    </Link>
  );
}
