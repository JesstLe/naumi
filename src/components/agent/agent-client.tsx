"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  History,
  Loader2,
  MessageSquare,
  PanelLeft,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
  Bot,
  Wrench,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Agent 任务模式:自然语言下达图片任务,pi-agent 编排站内工具完成。
// 消息历史存前端;图片以 URL 形式附带在消息文本里([商品图] <url>)。
// ---------------------------------------------------------------------------

type Msg = {
  role: "user" | "assistant";
  content: string;
  steps?: { tool: string; summary: string }[];
  pending?: boolean;
};

type SessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

type SavedStep = {
  type?: string;
  tool?: string;
  summary?: string;
  items?: string[];
};

const MAX_UPLOAD = 12 * 1024 * 1024;

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

/** 把回复里的 markdown 图片语法渲染成图,其余按行输出 */
function renderContent(content: string) {
  const lines = content.split("\n");
  return lines.map((line, i) => {
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

export function AgentClient() {
  const { user, ready, applyServerUser } = useAuth();
  const { openAuth } = useAuthModal();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionLoadingId, setSessionLoadingId] = useState("");
  const [editingSessionId, setEditingSessionId] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState("");
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [interject, setInterject] = useState("");
  const sessionIdRef = useRef("");
  const sessionLoadRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => () => streamAbortRef.current?.abort(), []);

  // 首次进入拉取历史会话，并恢复最近使用的一条。
  useEffect(() => {
    if (!user) {
      setSessions([]);
      return;
    }
    void refreshSessions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function restoreMessages(rawMessages: Msg[], savedSteps: SavedStep[]) {
    const restored = rawMessages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })) as Msg[];
    const visibleSteps = savedSteps.map((step) => ({
      tool: step.type === "plan" ? "任务计划" : step.tool || "工具",
      summary:
        step.type === "plan"
          ? (step.items ?? []).join(" → ")
          : step.summary || "执行完成",
    }));
    if (visibleSteps.length && restored.at(-1)?.role === "assistant") {
      restored[restored.length - 1] = {
        ...restored[restored.length - 1],
        steps: visibleSteps,
      };
    }
    return restored;
  }

  async function refreshSessions(selectLatest = false) {
    if (!user) return;
    setSessionsLoading(true);
    try {
      const response = await fetch("/api/agent/session", {
        headers: await authHeader(),
      });
      if (!response.ok) return;
      const data = await response.json();
      const list = (data.sessions ?? []) as SessionSummary[];
      setSessions(list);
      if (
        selectLatest &&
        list[0] &&
        !sessionIdRef.current &&
        !streamAbortRef.current
      ) {
        await loadSession(list[0].id, true);
      }
    } finally {
      setSessionsLoading(false);
    }
  }

  async function loadSession(id: string, allowDuringInitialLoad = false) {
    if (!id || id === sessionIdRef.current) return;
    if (busy && !allowDuringInitialLoad) {
      setError("当前会话正在执行，请先停止任务再切换");
      return;
    }
    const loadToken = ++sessionLoadRef.current;
    setSessionLoadingId(id);
    setError(null);
    try {
      const response = await fetch(
        `/api/agent/session?id=${encodeURIComponent(id)}`,
        { headers: await authHeader() }
      );
      if (!response.ok) throw new Error("历史会话读取失败");
      const data = await response.json();
      if (loadToken !== sessionLoadRef.current) return;
      const nextMessages = restoreMessages(
        (data.session?.messages ?? []) as Msg[],
        (data.session?.steps ?? []) as SavedStep[]
      );
      sessionIdRef.current = id;
      setSessionId(id);
      setMessages(nextMessages);
      setAttachments([]);
      setInput("");
      setMobileSessionsOpen(false);

      const live = await fetch(
        `/api/agent?sessionId=${encodeURIComponent(id)}&since=0`,
        { headers: await authHeader() }
      ).catch(() => null);
      if (loadToken !== sessionLoadRef.current || !live?.ok) return;
      const state = await live.json();
      if (state.running) {
        setBusy(true);
        setRunning(true);
        setMessages((previous) => [
          ...previous,
          { role: "assistant", content: "正在恢复运行中的任务…", pending: true },
        ]);
        void pollRecoveredRun(id, Number(state.total) || 0);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "历史会话读取失败");
    } finally {
      if (loadToken === sessionLoadRef.current) setSessionLoadingId("");
    }
  }

  function createSession() {
    if (busy) {
      setError("当前会话正在执行，请先停止任务再新建会话");
      return;
    }
    sessionLoadRef.current += 1;
    sessionIdRef.current = "";
    setSessionId("");
    setMessages([]);
    setInput("");
    setAttachments([]);
    setError(null);
    setEditingSessionId("");
    setDeleteSessionId("");
    setMobileSessionsOpen(false);
  }

  async function renameSession(id: string) {
    const title = editingTitle.trim().replace(/\s+/g, " ");
    if (!title) return;
    const response = await fetch("/api/agent/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ id, title }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "会话重命名失败");
      return;
    }
    setSessions((previous) =>
      previous.map((session) => (session.id === id ? { ...session, title } : session))
    );
    setEditingSessionId("");
    setEditingTitle("");
    void refreshSessions();
  }

  async function removeSession(id: string) {
    const response = await fetch(
      `/api/agent/session?id=${encodeURIComponent(id)}`,
      { method: "DELETE", headers: await authHeader() }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "会话删除失败");
      return;
    }
    const remaining = sessions.filter((session) => session.id !== id);
    setSessions(remaining);
    setDeleteSessionId("");
    if (id === sessionIdRef.current) {
      createSession();
      if (remaining[0]) await loadSession(remaining[0].id, true);
    }
  }

  async function pollRecoveredRun(id: string, since: number) {
    let cursor = since;
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const res = await fetch(
        `/api/agent?sessionId=${encodeURIComponent(id)}&since=${cursor}`,
        { headers: await authHeader() }
      ).catch(() => null);
      if (!res?.ok) break;
      const data = await res.json();
      cursor = Number(data.total) || cursor;
      const events = Array.isArray(data.events) ? data.events : [];
      const lastAssistant = [...events]
        .reverse()
        .find((event) => event.type === "assistant");
      if (lastAssistant?.data?.text) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: String(lastAssistant.data.text),
          };
          return copy;
        });
      }
      if (!data.running) break;
    }
    setBusy(false);
    setRunning(false);
    if (sessionIdRef.current === id) {
      const response = await fetch(
        `/api/agent/session?id=${encodeURIComponent(id)}`,
        { headers: await authHeader() }
      ).catch(() => null);
      if (response?.ok) {
        const data = await response.json();
        setMessages(
          restoreMessages(
            (data.session?.messages ?? []) as Msg[],
            (data.session?.steps ?? []) as SavedStep[]
          )
        );
      }
    }
    void refreshSessions();
  }

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
      setError("图片上传失败,请重试");
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    if (!user) {
      if (!ready) return;
      const session = await fetch("/api/auth/session")
        .then((response) => response.json())
        .catch(() => null);
      if (!session?.user) {
        openAuth("sign-in");
        return;
      }
      applyServerUser(session.user);
    }
    setError(null);
    const parts = [text, ...attachments.map((u) => `[商品图] ${u}`)];
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
    const runSteps: { tool: string; summary: string }[] = [];

    // SSE:实时事件 → 填充 pending 消息
    const applyEvent = (type: string, data: Record<string, unknown>) => {
      if (type === "plan") {
        const items = Array.isArray(data.items) ? data.items.map(String) : [];
        const step = { tool: "任务计划", summary: items.join(" → ") };
        runSteps.push(step);
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.pending) copy[copy.length - 1] = { ...last, steps: [...runSteps] };
          return copy;
        });
      } else if (type === "tool_start") {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.pending) {
            copy[copy.length - 1] = {
              ...last,
              content: `🔧 正在调用 ${(data.tool as string) || "工具"}…`,
            };
          }
          return copy;
        });
      } else if (type === "tool_end") {
        runSteps.push({
          tool: (data.tool as string) || "工具",
          summary: (data.summary as string) || "执行完成",
        });
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.pending) {
            copy[copy.length - 1] = {
              ...last,
              content: `✓ ${(data.tool as string) || "工具"} 完成${data.summary ? ` — ${data.summary}` : ""}`,
              steps: [...runSteps],
            };
          }
          return copy;
        });
      } else if (type === "assistant" && typeof data.text === "string") {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last?.pending) copy[copy.length - 1] = { ...last, content: data.text as string };
          return copy;
        });
      }
    };

    try {
      const controller = new AbortController();
      streamAbortRef.current = controller;
      const res = await fetch("/api/agent", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          message: userMsg.content,
          sessionId: sessionIdRef.current || undefined,
          history,
        }),
        signal: controller.signal,
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
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const evLine = chunk.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!evLine || !dataLine) continue;
          const type = evLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
          if (type === "open" && typeof data.sessionId === "string") {
            setSessionId(data.sessionId);
            sessionIdRef.current = data.sessionId;
          } else if (type === "plan" || type === "assistant" || type === "tool_start" || type === "tool_end") {
            applyEvent(type, data);
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
        const steps = last?.steps ?? [];
        copy[copy.length - 1] = {
          role: "assistant",
          content: reply || "(无回复)",
          steps,
        };
        return copy;
      });
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Agent 执行失败");
      }
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: "(执行失败)" };
        return copy;
      });
    } finally {
      streamAbortRef.current = null;
      setBusy(false);
      setRunning(false);
      void refreshSessions();
    }
  }

  async function stopRun() {
    if (!sessionIdRef.current) return;
    const res = await fetch(
      `/api/agent?sessionId=${encodeURIComponent(sessionIdRef.current)}`,
      { method: "DELETE", headers: await authHeader() }
    ).catch(() => null);
    streamAbortRef.current?.abort();
    setRunning(false);
    setBusy(false);
    if (res && !res.ok) setError("停止任务失败，请重试");
  }

  async function sendInterject() {
    const text = interject.trim();
    if (!text || !running || !sessionIdRef.current) return;
    const res = await fetch("/api/agent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ sessionId: sessionIdRef.current, message: text }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error || "插话发送失败");
      return;
    }
    setInterject("");
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
          <span className="font-semibold text-c-text">Agent 任务模式</span>
        </nav>
      </div>

      <div className="relative flex h-[calc(100vh-190px)] min-h-[560px] flex-col overflow-hidden rounded-card border border-c-border bg-c-card shadow-card">
        {/* 头 */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <button
            type="button"
            onClick={() => setMobileSessionsOpen((open) => !open)}
            aria-label="打开历史会话"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-border text-c-text2 transition-colors hover:bg-secondary lg:hidden"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <span
            className="grid h-11 w-11 flex-none place-items-center rounded-[10px]"
            style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}
          >
            <Bot className="h-[21px] w-[21px]" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-bold text-c-text">Agent 任务模式</h1>
            <p className="truncate text-[12px] text-c-text3">
              {sessions.find((session) => session.id === sessionId)?.title || "新会话"}
            </p>
          </div>
          <button
            type="button"
            onClick={createSession}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-semibold text-c-text transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            新建会话
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* 历史会话 */}
          <aside
            className={cn(
              "absolute inset-y-0 left-0 z-20 w-[286px] flex-col border-r border-border bg-c-card pt-[76px] shadow-xl lg:static lg:z-auto lg:flex lg:w-[270px] lg:pt-0 lg:shadow-none",
              mobileSessionsOpen ? "flex" : "hidden"
            )}
          >
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <span className="flex items-center gap-2 text-[12px] font-semibold text-c-text2">
                <History className="h-3.5 w-3.5" />
                历史会话
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-c-text4">{sessions.length}</span>
                <button
                  type="button"
                  aria-label="关闭历史会话"
                  onClick={() => setMobileSessionsOpen(false)}
                  className="grid h-7 w-7 place-items-center text-c-text3 lg:hidden"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="nv-panel-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {sessionsLoading && sessions.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-4 text-xs text-c-text3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在读取
                </div>
              ) : sessions.length === 0 ? (
                <div className="px-3 py-4 text-xs leading-5 text-c-text3">暂无历史会话</div>
              ) : (
                sessions.map((session) => {
                  const active = session.id === sessionId;
                  const editing = editingSessionId === session.id;
                  const deleting = deleteSessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "group mb-1 border-l-2 px-2.5 py-2.5 transition-colors",
                        active
                          ? "border-primary bg-primary/[0.07]"
                          : "border-transparent hover:bg-secondary/70"
                      )}
                    >
                      {editing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void renameSession(session.id);
                              if (event.key === "Escape") setEditingSessionId("");
                            }}
                            maxLength={120}
                            aria-label="会话名称"
                            className="h-8 min-w-0 flex-1 border-b border-primary bg-transparent px-1 text-[12px] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void renameSession(session.id)}
                            aria-label="保存会话名称"
                            className="grid h-7 w-7 place-items-center text-primary"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : deleting ? (
                        <div className="space-y-2">
                          <p className="text-[11px] text-c-text2">删除这条会话记录？</p>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => void removeSession(session.id)}
                              className="h-7 bg-red-600 px-2.5 text-[11px] font-medium text-white"
                            >
                              删除
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteSessionId("")}
                              className="h-7 border border-border px-2.5 text-[11px] text-c-text2"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => void loadSession(session.id)}
                            disabled={busy || sessionLoadingId === session.id}
                            className="min-w-0 flex-1 text-left disabled:opacity-60"
                          >
                            <span className="flex items-center gap-1.5">
                              {sessionLoadingId === session.id ? (
                                <Loader2 className="h-3.5 w-3.5 flex-none animate-spin" />
                              ) : (
                                <MessageSquare className="h-3.5 w-3.5 flex-none text-c-text3" />
                              )}
                              <span className="truncate text-[12px] font-medium text-c-text">
                                {session.title || "未命名会话"}
                              </span>
                            </span>
                            <span className="mt-1 block pl-5 text-[10.5px] text-c-text4">
                              {formatSessionTime(session.updatedAt)} · {session.messageCount} 条消息
                            </span>
                          </button>
                          <div className="flex flex-none opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSessionId(session.id);
                                setEditingTitle(session.title);
                                setDeleteSessionId("");
                              }}
                              aria-label={`重命名 ${session.title}`}
                              className="grid h-7 w-7 place-items-center text-c-text3 hover:text-c-text"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteSessionId(session.id);
                                setEditingSessionId("");
                              }}
                              disabled={busy && active}
                              aria-label={`删除 ${session.title}`}
                              className="grid h-7 w-7 place-items-center text-c-text3 hover:text-red-600 disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {mobileSessionsOpen && (
            <button
              type="button"
              aria-label="关闭历史会话遮罩"
              onClick={() => setMobileSessionsOpen(false)}
              className="absolute inset-0 z-10 bg-black/10 lg:hidden"
            />
          )}

          <div className="flex min-w-0 flex-1 flex-col">
          {/* 消息区 */}
          <div ref={scrollRef} className="nv-panel-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span
                className="grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: "rgba(79,70,229,.12)", color: "#4F46E5" }}
              >
                <Bot className="h-7 w-7" />
              </span>
              <div>
                <h2 className="text-[17px] font-bold text-c-text">下达一个完整任务</h2>
                <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
                  例:「把这张商品图精修一遍,然后出 4 个换色版本」「用这张图生成一套亚马逊
                  A+ 详情页」——先上传商品图,再描述任务即可。
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
                {["AI 生图", "商品精修", "产品换色", "爆款复刻", "一键套图", "A+ 详情页"].map(
                  (x) => (
                    <span key={x} className="rounded-full border border-border px-2.5 py-1">
                      {x}
                    </span>
                  )
                )}
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
                  <Bot className="h-4.5 w-4.5" />
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
                      Agent 正在执行,可插话修正或停止
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
                                <div className="mt-0.5 line-clamp-2 opacity-80">{s.summary}</div>
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
          <div className="border-t border-border px-5 py-4">
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
                    onClick={() => setAttachments((prev) => prev.filter((x) => x !== u))}
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
              placeholder="描述任务,例如:把上传的商品图精修一遍,再生成一套淘宝套图"
              rows={1}
              className="max-h-32 min-h-[44px] flex-1 resize-y rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!ready || busy || !input.trim()}
              aria-label="发送任务"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-white shadow-btn [background:var(--grad-acc)] transition-all hover:brightness-95 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-c-text4">
            Agent 会调用站内工具完成任务,每次工具调用按对应工具计费;复杂任务可能需要数分钟。
          </p>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cn(...cls: (string | false | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}
