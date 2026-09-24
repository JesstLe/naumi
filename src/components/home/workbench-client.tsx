"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bot,
  LayoutGrid,
  Loader2,
  MessageSquarePlus,
  Network,
  Plus,
  Send,
  Upload,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { cdnUrl } from "@/lib/cdn";
import { toolBySlug, type ToolMeta } from "@/lib/tool-meta";
import { Media } from "@/components/media";
import { useI18n } from "@/lib/i18n/locale-context";
import { useAuth } from "@/lib/auth-context";
import { authHeader } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { PickedTemplate } from "@/lib/homepage-picks";

// ---------------------------------------------------------------------------
// 统一工作台(一期收敛):空态 = 门户(问候/统计/大输入框/快捷入口/最近作品),
// 发送第一条消息后同页渐变为 Agent 对话,不再跳转 /brain(该路由已 302 到此)。
// 对话逻辑与原 home-agent 一致:PUT /api/agent SSE + steering + 会话持久化。
// 一期不做历史会话抽屉:刷新回到门户 = 新对话;历史仍在 DB(二期收编 /agent 侧栏)。
// ---------------------------------------------------------------------------

type Msg = {
  role: "user" | "assistant";
  content: string;
  steps?: { tool: string; summary: string }[];
  pending?: boolean;
};

type RecentWork = {
  id: string;
  image: string;
  title?: string;
  status?: string;
  gradient?: string;
  createdAt?: string;
};

const MAX_UPLOAD = 12 * 1024 * 1024;
const MAX_REF_FILES = 6;
const MAX_REF_BYTES = 12 * 1024 * 1024;

/** 渲染回复:markdown 图片 + [商品图] 行(缩略图) + 文本行 */
function renderContent(content: string) {
  return content.split("\n").map((line, i) => {
    const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (m) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={m[2]}
          alt={m[1]}
          className="my-1 max-h-72 rounded-xl border border-border"
        />
      );
    }
    const ref = line.match(/^\[商品图\]\s*(\S+)$/);
    if (ref) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={ref[1]}
          alt="商品图"
          className="my-1 h-20 w-20 rounded-lg border border-border object-cover"
        />
      );
    }
    return line.trim() ? (
      <p key={i} className="whitespace-pre-wrap">
        {line}
      </p>
    ) : null;
  });
}

export function WorkbenchClient({ hot }: { hot: PickedTemplate[] }) {
  const { t, locale } = useI18n();
  const { user, ready, remaining } = useAuth();
  const L = (zh: string, en: string) => (locale === "en" ? en : zh);
  const params = useSearchParams();
  // ?prompt= 引导只执行一次(旧 /brain?prompt= 链接 302 过来的场景)
  const bootstrapRef = useRef(false);

  // ── 门户状态 ──
  const [recent, setRecent] = useState<RecentWork[] | null>(null);
  const [stats, setStats] = useState<{ today: number; total: number }>({
    today: 0,
    total: 0,
  });
  const [composerText, setComposerText] = useState("");
  const [composerFiles, setComposerFiles] = useState<File[]>([]);
  const [composerPreviews, setComposerPreviews] = useState<string[]>([]);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const composerFileRef = useRef<HTMLInputElement>(null);
  const composerTextRef = useRef<HTMLTextAreaElement>(null);

  // ── 对话状态 ──
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [interject, setInterject] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const greeting = useMemo(() => {
    if (user?.name) return `${t(greet)}，${user.name}`;
    return t("home.dash.greetGuest");
  }, [user?.name, greet, t]);

  const statPills = [
    { label: L("今日生成", "Today"), value: `${stats.today.toLocaleString("en-US")}${L(" 张", "")}` },
    { label: L("积分余额", "Credits"), value: remaining.toLocaleString("en-US"), href: user ? "/plans" : undefined, accent: true },
    { label: L("累计作品", "Works"), value: stats.total.toLocaleString("en-US") },
  ];

  // ── 对话核心 ──

  /** 上传单张参考图 → 站内 URL;失败返回 null 不阻塞主消息。 */
  async function uploadOne(f: File): Promise<string | null> {
    if (f.size > MAX_UPLOAD) return null;
    try {
      const fd = new FormData();
      fd.append("image", f);
      fd.append("title", "Agent 上传");
      const res = await fetch("/api/artworks/add", {
        method: "POST",
        headers: await authHeader(),
        body: fd,
      });
      const d = await res.json();
      return d?.artwork?.image || d?.image || d?.url || null;
    } catch {
      return null;
    }
  }

  async function send(text?: string, attachmentUrls?: string[]) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setError(null);
    const urls = attachmentUrls ?? attachments;
    const parts = [content, ...urls.map((u) => `[商品图] ${u}`)];
    const userMsg: Msg = { role: "user", content: parts.join("\n") };
    const history = messages
      .filter((m) => !m.pending && m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant", content: "", pending: true },
    ]);
    setInput("");
    setAttachments([]);
    setBusy(true);
    setRunning(true);

    try {
      const res = await fetch("/api/agent", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({
          message: userMsg.content,
          sessionId: sessionIdRef.current || undefined,
          history,
          // 视觉输入:服务端按模型自动判定,支持时随消息直喂模型
          images: urls,
        }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Agent 执行失败");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const evLine = chunk.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!evLine || !dataLine) continue;
          const type = evLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
          if (type === "open" && typeof data.sessionId === "string") {
            sessionIdRef.current = data.sessionId;
          } else if (type === "tool_start") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.pending) {
                copy[copy.length - 1] = {
                  ...last,
                  content: `🔧 正在调用 ${data.tool || "工具"}…`,
                };
              }
              return copy;
            });
          } else if (type === "tool_end") {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.pending) {
                copy[copy.length - 1] = {
                  ...last,
                  content: `✓ ${data.tool || ""} ${data.summary || ""}`,
                  steps: [
                    ...(last.steps ?? []),
                    {
                      tool: (data.tool as string) || "",
                      summary: (data.summary as string) || "",
                    },
                  ],
                };
              }
              return copy;
            });
          } else if (type === "final") {
            reply = (data.reply as string) || "";
          } else if (type === "error") {
            throw new Error((data.message as string) || "执行失败");
          }
        }
      }
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = {
          role: "assistant",
          content: reply || "(无回复)",
          steps: last?.steps ?? [],
        };
        return copy;
      });
      // 持久化
      void fetch("/api/agent/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeader()),
        },
        body: JSON.stringify({
          id: sessionIdRef.current,
          title: content.slice(0, 40),
          messages: [
            ...history,
            { role: "user", content: userMsg.content },
            { role: "assistant", content: reply || "(无回复)" },
          ],
        }),
      }).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent 执行失败");
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "(执行失败)" };
        return copy;
      });
    } finally {
      setBusy(false);
      setRunning(false);
    }
  }

  async function stopRun() {
    if (!sessionIdRef.current) return;
    await fetch(
      `/api/agent?sessionId=${encodeURIComponent(sessionIdRef.current)}`,
      { method: "DELETE", headers: await authHeader() }
    ).catch(() => {});
  }

  async function sendInterject() {
    const text = interject.trim();
    if (!text || !running || !sessionIdRef.current) return;
    await fetch("/api/agent", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(await authHeader()),
      },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        message: text,
      }),
    }).catch(() => {});
    setInterject("");
  }

  function newConversation() {
    if (running) return;
    sessionIdRef.current = "";
    bootstrapRef.current = false;
    setMessages([]);
    setAttachments([]);
    setError(null);
    setInput("");
  }

  // ?prompt= 进入(旧 /brain 链接):清参数后自动首发,跳过门户空态
  useEffect(() => {
    if (bootstrapRef.current) return;
    const prompt = (params.get("prompt") || "").trim();
    if (!prompt) return;
    bootstrapRef.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    void send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // ── 门户交互 ──

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

  /** 门户大输入框提交:参考图先上传换 URL,随后同页进入对话(不再跳转)。 */
  async function submitComposer() {
    const text = composerText.trim();
    if (!text || composerSubmitting || busy) return;
    setComposerError(null);
    setComposerSubmitting(true);
    try {
      const urls: string[] = [];
      if (composerFiles.length) {
        setUploading(true);
        for (const f of composerFiles) {
          const u = await uploadOne(f);
          if (u) urls.push(u);
        }
        setUploading(false);
      }
      setComposerText("");
      setComposerFiles([]);
      setComposerPreviews((prev) => {
        prev.forEach((u) => URL.revokeObjectURL(u));
        return [];
      });
      await send(text, urls);
    } finally {
      setUploading(false);
      setComposerSubmitting(false);
    }
  }

  // ── 对话态(与原 /brain 一致) ──
  if (messages.length > 0 || busy || composerSubmitting) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex h-[calc(100vh-160px)] max-w-4xl flex-col rounded-card border border-c-border bg-c-card shadow-card">
          {/* 头 */}
          <div className="flex items-center gap-3 border-b border-border px-6 py-4">
            <span
              className="grid h-11 w-11 flex-none place-items-center rounded-[10px]"
              style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}
            >
              <Bot className="h-[21px] w-[21px]" strokeWidth={1.9} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] font-bold text-c-text">
                Naumi 智能工作台
              </h1>
              <p className="text-[12px] text-c-text3">
                一句话调度全部业务系统 · 生图 / 套图 / A+ / 鱼塘任务 / 模板 / 余额
              </p>
            </div>
            <button
              type="button"
              onClick={newConversation}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium text-c-text2 transition-colors hover:bg-secondary disabled:opacity-50"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              新对话
            </button>
            <Link
              href="/hub"
              className="hidden rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-medium text-c-text2 transition-colors hover:bg-secondary sm:block"
            >
              业务系统 →
            </Link>
          </div>

          {/* 消息区 */}
          <div
            ref={scrollRef}
            className="nv-panel-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2.5",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {m.role === "assistant" && (
                  <span
                    className="mt-1 grid h-8 w-8 flex-none place-items-center rounded-lg"
                    style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}
                  >
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed",
                    m.role === "user"
                      ? "bg-primary/10 text-c-text"
                      : "border border-border bg-secondary/40 text-c-text"
                  )}
                >
                  {m.pending ? (
                    <div className="space-y-2">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在执行,可插话修正或停止
                      </span>
                      {running && (
                        <div className="flex items-center gap-2">
                          <input
                            value={interject}
                            onChange={(e) => setInterject(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void sendInterject();
                            }}
                            placeholder="插话修正,如:换蓝色的"
                            className="h-8 flex-1 rounded-lg border border-border bg-secondary px-2.5 text-[12px] outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={() => void sendInterject()}
                            disabled={!interject.trim()}
                            className="h-8 rounded-lg border border-border px-2.5 text-[12px] font-medium text-c-text transition-colors hover:bg-secondary disabled:opacity-50"
                          >
                            插话
                          </button>
                          <button
                            type="button"
                            onClick={() => void stopRun()}
                            className="h-8 rounded-lg border border-red-500/40 px-2.5 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-500/10"
                          >
                            停止
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {m.steps && m.steps.length > 0 && (
                        <details className="mb-2 rounded-lg bg-secondary/60 px-3 py-2 text-[12px] text-muted-foreground">
                          <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                            <Wrench className="h-3.5 w-3.5" />
                            执行轨迹({m.steps.length} 步)
                          </summary>
                          <ul className="mt-1.5 space-y-1">
                            {m.steps.map((s, j) => (
                              <li key={j}>
                                🔧 <span className="font-medium text-c-text2">{s.tool}</span>
                                {s.summary && (
                                  <div className="mt-0.5 line-clamp-2 opacity-80">
                                    {s.summary}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      {renderContent(m.content)}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 输入区 */}
          <div className="border-t border-border px-6 py-4">
            {error && (
              <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((u, i) => (
                  <span
                    key={u}
                    className="inline-flex max-w-[240px] items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] text-c-text2"
                  >
                    <span className="truncate">商品图 {i + 1}</span>
                    <button
                      onClick={() =>
                        setAttachments((prev) => prev.filter((x) => x !== u))
                      }
                      aria-label="移除"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                hidden
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (!files.length) return;
                  setUploading(true);
                  const urls: string[] = [];
                  for (const f of files) {
                    const u = await uploadOne(f);
                    if (u) urls.push(u);
                  }
                  setUploading(false);
                  if (urls.length) setAttachments((prev) => [...prev, ...urls]);
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                title="上传商品图"
                className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="直接说,例如:鱼塘现在几单在跑?帮我出一张保健品礼盒主图"
                rows={1}
                className="max-h-32 min-h-[44px] flex-1 resize-y rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={busy || !input.trim()}
                className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-white shadow-btn [background:var(--grad-acc)] transition-all hover:brightness-95 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 门户空态(原工作台首页) ──
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
          {/* 统计药丸(次要信息;积分可点去充值) */}
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

        {/* 大输入框 = Agent 入口:提交后同页进入对话 */}
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
                  void submitComposer();
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
              disabled={!composerText.trim() || composerSubmitting}
              onClick={() => void submitComposer()}
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full [background:var(--grad-acc)] text-white shadow-btn transition-all hover:opacity-90 disabled:opacity-30"
            >
              {composerSubmitting ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <ArrowUp className="h-[18px] w-[18px]" />
              )}
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
          {/* Agent 能力提示:与工具直达入口区分,这里强调「说句话就行」 */}
          <p className="mt-2 text-center text-[12px] text-c-text3">
            {L(
              "生图 · 套图 · A+ 详情页 · 鱼塘任务 · 查余额 —— 直接说，我来调度",
              "Images · suites · A+ pages · tasks · balance — just ask"
            )}
          </p>
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
