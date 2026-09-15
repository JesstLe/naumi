"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  Loader2,
  Send,
  Sparkles,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 首页大 Agent 工作台:核心大脑。
// 一句话调度全部业务系统(生图/套图/A+/鱼塘任务/模板检索/余额)。
// 复用 /api/agent 的 PUT SSE 通道(与 /agent 页同协议)。
// ---------------------------------------------------------------------------

type Msg = {
  role: "user" | "assistant";
  content: string;
  steps?: { tool: string; summary: string }[];
  pending?: boolean;
};

const MAX_UPLOAD = 12 * 1024 * 1024;

const QUICK_PROMPTS = [
  { icon: "🐟", text: "鱼塘现在有多少任务在跑?" },
  { icon: "🎨", text: "帮我生成一张保健品主图" },
  { icon: "📊", text: "查一下我的积分余额" },
  { icon: "🔍", text: "模板库里有哪些主图模板?" },
];

/** 渲染回复:markdown 图片 + 文本行 */
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
    return line.trim() ? (
      <p key={i} className="whitespace-pre-wrap">
        {line}
      </p>
    ) : null;
  });
}

export function HomeAgent() {
  const { user } = useAuth();
  const { openAuth } = useAuthModal();
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // 刷新恢复:拉最近 agent 会话
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch("/api/agent/session", {
          headers: await authHeader(),
        });
        if (!res.ok) return;
        const d = await res.json();
        const list = (d.sessions ?? []) as {
          id: string;
          messages: Msg[];
        }[];
        if (list.length === 0) return;
        const sd = await fetch(
          `/api/agent/session?id=${encodeURIComponent(list[0].id)}`,
          { headers: await authHeader() }
        );
        if (!sd.ok) return;
        const sdd = await sd.json();
        const msgs = (sdd.session?.messages ?? []) as Msg[];
        if (msgs.length === 0) return;
        sessionIdRef.current = list[0].id;
        setMessages(
          msgs.map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          }))
        );
      } catch {
        /* 静默 */
      }
    })();
  }, [user]);

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_UPLOAD) continue;
        const fd = new FormData();
        fd.append("image", f);
        fd.append("title", "Agent 上传");
        const res = await fetch("/api/artworks/add", {
          method: "POST",
          headers: await authHeader(),
          body: fd,
        });
        const d = await res.json();
        const url = d?.artwork?.image || d?.image || d?.url;
        if (url) setAttachments((prev) => [...prev, url]);
      }
    } catch {
      setError("图片上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setError(null);
    const parts = [content, ...attachments.map((u) => `[商品图] ${u}`)];
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
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
              <span
                className="grid h-16 w-16 place-items-center rounded-2xl"
                style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}
              >
                <Sparkles className="h-8 w-8" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-c-text">
                  今天要做什么?
                </h2>
                <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
                  直接说,我来调度:「鱼塘今天几单」「把这张商品图出一套详情页」
                  「生成保健品礼盒主图」…
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.text}
                    type="button"
                    onClick={() => void send(q.text)}
                    className="rounded-full border border-border bg-secondary/40 px-3.5 py-1.5 text-[12.5px] font-medium text-c-text2 transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {q.icon} {q.text}
                  </button>
                ))}
              </div>
            </div>
          )}
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
              onChange={(e) => void uploadFiles(e.target.files)}
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
