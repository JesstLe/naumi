"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ExternalLink, Menu, X, ArrowRight, ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { LangSwitcher } from "@/components/lang-switcher";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n/locale-context";
import { cn } from "@/lib/utils";
import { BRAND_PARENT_URL, BRAND_PARENT_LABEL } from "@/lib/brand";
import { useAuthModal } from "@/lib/auth-modal-context";
import { usePaymentConfig } from "@/lib/payment-context";

const NAV = [
  { href: "/", key: "nav.home" },
  { href: "/generate", key: "nav.generate" },
  // hot:展示 HOT 脉冲徽标 + 下方打字机气泡(新功能引导)
  { href: "/suite", key: "suite.navLabel", hot: true },
  { href: "/templates", key: "nav.templates" },
  // 作品库需要登录:未登录点它不跳转,直接在当前页弹登录窗
  { href: "/dashboard", key: "nav.dashboard", auth: true },
  { href: "/canvas", key: "nav.canvas", auth: true },
  { href: "/account?tab=credits", key: "nav.credits" },
];

// ── 业务项目聚合:导航「业务系统」下拉 ─────────────────────────────────────
type HubProject = {
  slug: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  color: string;
  category: string;
  run_type?: "web" | "script" | "external";
};

function HubProjectsMenu({ mobile }: { mobile?: boolean }) {
  const [projects, setProjects] = useState<HubProject[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    fetch("/api/hub/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {});
  }, [loaded]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (projects.length === 0) return null; // 未注册任何项目时不渲染

  if (mobile) {
    return (
      <div className="border-t border-border/70 pt-3">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          业务系统
        </p>
        {projects.map((p) => (
          <a
            key={p.slug}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <span
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: p.color }}
            />
            {p.name}
            <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-50" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          open && "bg-secondary text-foreground"
        )}
      >
        业务系统
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="absolute left-1/2 top-[calc(100%+8px)] z-50 w-[340px] -translate-x-1/2 rounded-2xl border border-border bg-card p-2 shadow-xl">
          {projects.map((p) => (
            <a
              key={p.slug}
              href={p.url || "/hub"}
              target={p.url ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary"
            >
              <span
                className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[13px] font-bold text-white"
                style={{ background: p.color }}
              >
                {p.name.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[13.5px] font-semibold text-foreground">
                  {p.name}
                  {p.run_type === "script" ? (
                    <span className="rounded bg-secondary px-1 py-px text-[9px] font-medium text-muted-foreground">
                      脚本
                    </span>
                  ) : (
                    <ExternalLink className="h-3 w-3 opacity-40" />
                  )}
                </span>
                {p.description && (
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                    {p.description}
                  </span>
                )}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// 红橙渐变「HOT」胶囊 + 向外扩散的脉冲光圈(方案 A 徽标)
function HotBadge() {
  return (
    <span className="pointer-events-none absolute -right-2.5 -top-1 inline-flex">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-md bg-rose-500 opacity-60" />
      <span className="relative rounded-md bg-gradient-to-br from-orange-500 to-rose-500 px-1.5 py-[3px] text-[9px] font-extrabold leading-none text-white shadow-sm">
        HOT
      </span>
    </span>
  );
}

const SUITE_HINT_KEY = "nv_suite_hot_seen";

// 下方绿色气泡 + 打字机(打字 → 停 → 删 → 换句)。
// loop=true:无限循环(悬停时);loop=false:走完一轮三句就停并回调 onRoundDone(首次自动播)。
function SuiteTypewriter({
  loop,
  onRoundDone,
}: {
  loop: boolean;
  onRoundDone?: () => void;
}) {
  const { t } = useI18n();
  const phrases = useMemo(
    () => [t("suite.hot1"), t("suite.hot2"), t("suite.hot3")],
    [t]
  );
  const [text, setText] = useState("");
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const doneRef = useRef(onRoundDone);
  doneRef.current = onRoundDone;

  useEffect(() => {
    let pi = 0;
    let ci = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = phrases[pi] ?? "";
      if (!deleting) {
        ci += 1;
        setText(full.slice(0, ci));
        if (ci === full.length) {
          deleting = true;
          timer = setTimeout(tick, 1600);
          return;
        }
      } else {
        ci -= 1;
        setText(full.slice(0, ci));
        if (ci === 0) {
          deleting = false;
          // 走完最后一句且非循环模式 → 一轮结束,通知外层收起
          if (pi === phrases.length - 1 && !loopRef.current) {
            doneRef.current?.();
            return;
          }
          pi = (pi + 1) % phrases.length;
          timer = setTimeout(tick, 320);
          return;
        }
      }
      timer = setTimeout(tick, deleting ? 38 : 75);
    };
    tick();
    return () => clearTimeout(timer);
  }, [phrases]);

  return (
    <span
      role="status"
      className="pointer-events-none absolute left-1/2 top-[52px] z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-primary/30"
    >
      <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-primary" />
      {text}
      <span className="ml-0.5 inline-block w-px animate-blink bg-white align-middle">
        &nbsp;
      </span>
    </span>
  );
}

// 桌面端「一键套图」导航项:HOT 徽标常驻 + 首次访问自动播一轮气泡(localStorage 记住)
// + 之后悬停才再现。
function SuiteNavItem({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);

  // 仅首次(本设备未看过)在页面稳定后自动播一轮
  useEffect(() => {
    if (typeof window === "undefined") return;
    let seen = false;
    try {
      seen = localStorage.getItem(SUITE_HINT_KEY) === "1";
    } catch {
      seen = true; // 隐私模式等读不了就当看过,不打扰
    }
    if (seen) return;
    const id = setTimeout(() => setAutoPlay(true), 900);
    return () => clearTimeout(id);
  }, []);

  const markSeen = useCallback(() => {
    setAutoPlay(false);
    try {
      localStorage.setItem(SUITE_HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const showBubble = hovered || autoPlay;

  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active && "text-foreground"
      )}
    >
      {label}
      <HotBadge />
      {showBubble && (
        // 悬停 → 无限循环;仅自动播放 → 走一轮后 markSeen 收起
        <SuiteTypewriter loop={hovered} onRoundDone={markSeen} />
      )}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const { t } = useI18n();
  const { openAuth } = useAuthModal();
  const { commerceVisible } = usePaymentConfig();
  const [open, setOpen] = useState(false);
  const navItems = commerceVisible
    ? NAV
    : NAV.filter((item) => item.href !== "/account?tab=credits");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 glass">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) =>
            item.hot ? (
              <SuiteNavItem
                key={item.href}
                href={item.href}
                label={t(item.key)}
                active={pathname === item.href}
              />
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  // 需要登录的项,未登录时不跳转,留在当前页弹登录窗
                  if (item.auth && ready && !user) {
                    e.preventDefault();
                    openAuth("sign-in");
                  }
                }}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  pathname === item.href && "text-foreground"
                )}
              >
                {t(item.key)}
              </Link>
            )
          )}
          <HubProjectsMenu />
        </nav>

        <div className="flex items-center gap-2">
          {/* 母站入口 — 仅当 NEXT_PUBLIC_BRAND_PARENT_URL 设了才显示。
              国内 配置的签发站 设 配置的母站地址 后,这里出现「↗ 品牌官网」。
              海外站不设 → 这里啥也没有。 */}
          {BRAND_PARENT_URL && (
            <a
              href={BRAND_PARENT_URL}
              className="hidden items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              {BRAND_PARENT_LABEL}
            </a>
          )}
          <LangSwitcher className="hidden sm:flex" />
          {!ready ? (
            <div className="h-8 w-20 animate-pulse rounded-full bg-secondary" />
          ) : user ? (
            <>
              <Button
                asChild
                variant="default"
                size="sm"
                className="hidden sm:inline-flex"
              >
                <Link href="/generate">
                  {t("header.start")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <UserMenu />
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => openAuth("sign-in")}
              >
                {t("header.signin")}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={() => openAuth("sign-up")}
              >
                {t("header.signup")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          <button
            type="button"
            aria-label={t("header.menu")}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-secondary md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border/70 bg-white md:hidden">
          <nav className="container flex flex-col py-3">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  if (item.auth && ready && !user) {
                    e.preventDefault();
                    setOpen(false);
                    openAuth("sign-in");
                  }
                }}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  pathname === item.href && "text-foreground"
                )}
              >
                {t(item.key)}
                {item.hot && (
                  <span className="rounded-md bg-gradient-to-br from-orange-500 to-rose-500 px-1.5 py-[3px] text-[9px] font-extrabold leading-none text-white shadow-sm">
                    HOT
                  </span>
                )}
              </Link>
            ))}
            <HubProjectsMenu mobile />
            {BRAND_PARENT_URL && (
              <a
                href={BRAND_PARENT_URL}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ArrowUpRight className="h-4 w-4" />
                {BRAND_PARENT_LABEL}
              </a>
            )}
            <div className="mt-3 border-t border-border pt-3">
              <LangSwitcher />
            </div>
            {ready && !user && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    openAuth("sign-in");
                  }}
                >
                  {t("header.signin")}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    openAuth("sign-up");
                  }}
                >
                  {t("header.signup")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            {ready && user && (
              <div className="mt-3 border-t border-border pt-3">
                <Button
                  asChild
                  variant="default"
                  size="sm"
                  className="w-full"
                >
                  <Link href="/generate">{t("header.start")}</Link>
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
