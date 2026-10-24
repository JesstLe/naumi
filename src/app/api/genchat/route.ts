import { NextResponse } from "next/server";
import { authenticatedEmail } from "@/lib/request-auth";
import {listGenchatSessions, getGenchatSession, saveGenchatSession, deleteGenchatSession} from "@/lib/genchat/repository";
import {dbEnabled} from "@/platform/db/pool";

// History belongs to the authenticated account, never an email from query/body.
const historyUnavailable = () => NextResponse.json(
  {error:"对话记录暂时不可用，请稍后重试",code:"GENCHAT_STORAGE_UNAVAILABLE"},
  {status:503,headers:{"cache-control":"no-store"}},
);

export async function GET(request: Request) {
  if (!dbEnabled) return NextResponse.json({ sessions: [] });
  const url = new URL(request.url);
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({error:"请先登录"},{status:401});
  if (url.searchParams.get("email") && url.searchParams.get("email")!.trim().toLowerCase() !== email) return NextResponse.json({error:"无权访问"},{status:403});
  const session = (url.searchParams.get("session") ?? "").trim();
  if (!email) return NextResponse.json({ sessions: [] });
  try {
    if (session) return NextResponse.json({ session: await getGenchatSession(email, session) });
    return NextResponse.json({ sessions: await listGenchatSessions(email) });
  } catch { return historyUnavailable(); }
}

export async function POST(request: Request) {
  if (!dbEnabled) return NextResponse.json({ ok: true });
  let body: {
    email?: string;
    id?: string;
    title?: string;
    turns?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({error:"请先登录"},{status:401});
  if (body.email && (typeof body.email !== "string" || body.email.trim().toLowerCase() !== email)) return NextResponse.json({error:"无权访问"},{status:403});
  const id = (body.id ?? "").trim();
  if (!email || !id) {
    return NextResponse.json({ error: "missing email/id" }, { status: 400 });
  }
  try {
    const saved = await saveGenchatSession(email, id, body.title ?? "", body.turns ?? []);
    if (!saved) return NextResponse.json({error:"对话编号已被其他账号使用",code:"GENCHAT_SESSION_CONFLICT"},{status:409});
    return NextResponse.json({ ok: true });
  } catch { return historyUnavailable(); }
}

export async function DELETE(request: Request) {
  if (!dbEnabled) return NextResponse.json({ ok: true });
  const url = new URL(request.url);
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({error:"请先登录"},{status:401});
  if (url.searchParams.get("email") && url.searchParams.get("email")!.trim().toLowerCase() !== email) return NextResponse.json({error:"无权访问"},{status:403});
  const session = (url.searchParams.get("session") ?? "").trim();
  if (!email || !session) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }
  try {
    await deleteGenchatSession(email, session);
    return NextResponse.json({ ok: true });
  } catch { return historyUnavailable(); }
}
