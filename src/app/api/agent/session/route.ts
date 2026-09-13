import { NextResponse } from "next/server";
import { resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/lib/db";
import {
  saveAgentSession,
  getAgentSession,
  listAgentSessions,
  deleteAgentSession,
  renameAgentSession,
} from "@/lib/db";
import {
  getSession,
  removeRuntimeSession,
  renameRuntimeSession,
} from "@/lib/agent/runtime";

// ---------------------------------------------------------------------------
// Agent 会话持久化:
//   GET    /api/agent/session                 = 列出我的历史会话
//   GET    /api/agent/session?id=             = 读单个会话(消息+轨迹)
//   POST   /api/agent/session                 = 保存/更新会话
//   PATCH  /api/agent/session                 = 修改会话名称
//   DELETE /api/agent/session?id=             = 删除会话
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authedEmail(request: Request): Promise<string | null> {
  if (!dbEnabled) return null;
  return resolveUserEmail(request);
}

export async function GET(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (id) {
    const s = await getAgentSession(email, id).catch(() => null);
    if (!s) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    return NextResponse.json({ session: s });
  }
  const sessions = await listAgentSessions(email, 50).catch(() => []);
  return NextResponse.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      title: session.title || "未命名会话",
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    })),
  });
}

export async function POST(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    title?: string;
    messages?: unknown[];
    steps?: unknown[];
  } | null;
  const id = (body?.id ?? "").trim().slice(0, 64);
  if (!id) {
    return NextResponse.json({ error: "缺少会话 id" }, { status: 400 });
  }
  const title = (body?.title ?? "").trim().slice(0, 120);
  const messages = Array.isArray(body?.messages) ? body!.messages.slice(-100) : [];
  const steps = Array.isArray(body?.steps) ? body!.steps.slice(-200) : [];
  await saveAgentSession(email, id, title, messages, steps);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as {
    id?: string;
    title?: string;
  } | null;
  const id = (body?.id ?? "").trim().slice(0, 64);
  const title = (body?.title ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!id) {
    return NextResponse.json({ error: "缺少会话 id" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "会话名称不能为空" }, { status: 400 });
  }
  const renamed = await renameAgentSession(email, id, title);
  if (!renamed) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  renameRuntimeSession(email, id, title);
  return NextResponse.json({ ok: true, title });
}

export async function DELETE(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "缺少会话 id" }, { status: 400 });
  }
  if (getSession(email, id)?.running) {
    return NextResponse.json(
      { error: "会话正在执行任务，请先停止后再删除" },
      { status: 409 }
    );
  }
  await deleteAgentSession(email, id);
  removeRuntimeSession(email, id);
  return NextResponse.json({ ok: true });
}
