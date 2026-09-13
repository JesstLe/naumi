import { NextResponse } from "next/server";
import { resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getOpenAISettings } from "@/lib/settings";
import {
  appendSessionEvent,
  getOrCreateSession,
  getSession,
  persistAgentSession,
  refreshSessionCredentials,
} from "@/lib/agent/runtime";
import { buildTaskPlan, classifyAgentFailure } from "@/lib/agent/recovery";

// ---------------------------------------------------------------------------
// Naumi Agent API(常驻会话版):
//   POST   /api/agent  = 一次性执行(向后兼容入口)
//   PUT    /api/agent  = SSE 流式执行(推荐):实时推送工具进度事件
//   PATCH  /api/agent  = steering:向运行中的会话插话修正
//   DELETE /api/agent  = 中止运行中的会话
//   GET    /api/agent  = 轮询会话事件(SSE 不可用时的降级方案)
// 会话与事件存内存(TTL 1 小时);积分预检在 runtime.ts 的 beforeToolCall。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 800;

type ChatMsg = { role: string; content: string };

async function authedEmail(request: Request): Promise<string | null> {
  if (!dbEnabled) return null;
  return resolveUserEmail(request);
}

// ── SSE 流式执行 ───────────────────────────────────────────────────────────
export async function PUT(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录后再使用 Agent" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    message?: string;
    sessionId?: string;
    history?: ChatMsg[];
  } | null;
  const message = (body?.message ?? "").trim().slice(0, 4000);
  const sessionId =
    (body?.sessionId ?? "").trim().slice(0, 64) ||
    `ag-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  if (!message) {
    return NextResponse.json({ error: "请输入任务内容" }, { status: 400 });
  }
  if (!rateLimit(`agent:${email}`, 20, 600_000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
  const settings = await getOpenAISettings();
  if (!process.env.AGENT_API_KEY && !settings.apiKey) {
    return NextResponse.json({ error: "模型接口未配置" }, { status: 503 });
  }
  const history = Array.isArray(body?.history)
    ? body!.history
        .filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .slice(-10)
    : [];
  const session = await getOrCreateSession(email, sessionId, history, {
    cookie: request.headers.get("cookie") ?? "",
    authorization: request.headers.get("authorization") ?? "",
  });
  if (session.running) {
    return NextResponse.json(
      { error: "当前会话有任务正在执行,请等待完成或插话修正" },
      { status: 409 }
    );
  }
  const eventCursor = session.events.length;
  if (session.agent.state.messages.length === 0) {
    session.title = message.slice(0, 120) || session.title;
  }
  appendSessionEvent(session, "plan", { items: buildTaskPlan(message) });
  session.running = true;
  void persistAgentSession(session);

  const encoder = new TextEncoder();
  let cancelStream = () => {
    session.agent.abort();
    session.running = false;
  };
  const onRequestAbort = () => cancelStream();
  request.signal.addEventListener("abort", onRequestAbort, { once: true });

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      };
      let cursor = eventCursor;
      send("open", { sessionId });

      const pushEvents = setInterval(() => {
        for (; cursor < session.events.length; cursor++) {
          const e = session.events[cursor];
          send(e.type, e.data);
        }
      }, 700);

      const cleanup = () => {
        clearInterval(pushEvents);
        clearInterval(doneCheck);
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", onRequestAbort);
      };

      const doneCheck = setInterval(() => {
        if (!session.running && cursor >= session.events.length) {
          const lastAssistant = [...session.agent.state.messages]
            .reverse()
            .find((m) => m.role === "assistant");
          const reply = Array.isArray(lastAssistant?.content)
            ? (lastAssistant!.content as { type?: string; text?: string }[])
                .map((c) => (c.type === "text" ? c.text ?? "" : ""))
                .join("")
                .trim()
            : "";
          send("final", {
            sessionId,
            reply,
            turns: session.agent.state.messages.length,
          });
          void persistAgentSession(session);
          cleanup();
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }, 700);

      const timeout = setTimeout(() => session.agent.abort(), 780_000);
      cancelStream = () => {
        if (closed) return;
        session.agent.abort();
        session.running = false;
        cleanup();
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      session.agent
        .prompt(message)
        .catch((e) => send("error", classifyAgentFailure(e)))
        .finally(() => {
          clearTimeout(timeout);
          session.running = false;
          void persistAgentSession(session);
        });
    },
    cancel() {
      cancelStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// ── Steering 插话 ──────────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    sessionId?: string;
    message?: string;
  } | null;
  const sessionId = (body?.sessionId ?? "").trim();
  const message = (body?.message ?? "").trim().slice(0, 2000);
  if (!sessionId || !message) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  const session = getSession(email, sessionId);
  if (!session) {
    return NextResponse.json({ error: "会话不存在或已过期" }, { status: 404 });
  }
  if (!session.running) {
    return NextResponse.json({ error: "当前没有运行中的任务" }, { status: 409 });
  }
  refreshSessionCredentials(session, request);
  session.agent.steer({
    role: "user",
    content: `[用户插话] ${message}`,
    timestamp: Date.now(),
  });
  return NextResponse.json({ ok: true });
}

// ── 中止 ───────────────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const sessionId = (url.searchParams.get("sessionId") ?? "").trim();
  const session = getSession(email, sessionId);
  if (!session) {
    return NextResponse.json({ error: "会话不存在或已过期" }, { status: 404 });
  }
  refreshSessionCredentials(session, request);
  session.agent.abort();
  return NextResponse.json({ ok: true });
}

// ── 事件轮询(降级) ─────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const sessionId = (url.searchParams.get("sessionId") ?? "").trim();
  const since = Number(url.searchParams.get("since") || "0");
  const session = getSession(email, sessionId);
  if (!session) {
    return NextResponse.json({ error: "会话不存在或已过期" }, { status: 404 });
  }
  refreshSessionCredentials(session, request);
  return NextResponse.json({
    events: session.events.slice(since),
    running: session.running,
    total: session.events.length,
  });
}

// ── 一次性执行(向后兼容) ─────────────────────────────────────────────────────
export async function POST(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录后再使用 Agent" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    message?: string;
    history?: ChatMsg[];
  } | null;
  const message = (body?.message ?? "").trim().slice(0, 4000);
  if (!message) {
    return NextResponse.json({ error: "请输入任务内容" }, { status: 400 });
  }
  if (!rateLimit(`agent:${email}`, 20, 600_000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
  const tempId = `tmp-${Date.now()}`;
  const history = Array.isArray(body?.history)
    ? body!.history.filter((m) => typeof m.content === "string").slice(-10)
    : [];
  const session = await getOrCreateSession(email, tempId, history, {
    cookie: request.headers.get("cookie") ?? "",
    authorization: request.headers.get("authorization") ?? "",
  });
  if (session.running) {
    return NextResponse.json({ error: "任务正在执行中" }, { status: 409 });
  }
  const timeout = setTimeout(() => session.agent.abort(), 780_000);
  try {
    await session.agent.prompt(message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent 执行失败";
    return NextResponse.json({
      reply: `任务中断:${msg}`,
      steps: session.events
        .filter((e) => e.type === "tool_end")
        .map((e) => e.data),
      error: msg,
    });
  } finally {
    clearTimeout(timeout);
  }
  const lastAssistant = [...session.agent.state.messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const reply = Array.isArray(lastAssistant?.content)
    ? (lastAssistant!.content as { type?: string; text?: string }[])
        .map((c) => (c.type === "text" ? c.text ?? "" : ""))
        .join("")
        .trim()
    : "";
  return NextResponse.json({
    reply,
    steps: session.events
      .filter((e) => e.type === "tool_end")
      .map((e) => e.data),
    turns: session.agent.state.messages.length,
  });
}
