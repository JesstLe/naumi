import { NextResponse } from "next/server";
import { authenticatedEmail } from "@/lib/request-auth";
import {listGenchatSessions, getGenchatSession, saveGenchatSession, deleteGenchatSession} from "@/lib/db";
import {dbEnabled} from "@/platform/db/pool";

// History belongs to the authenticated account, never an email from query/body.

export async function GET(request: Request) {
  if (!dbEnabled) return NextResponse.json({ sessions: [] });
  const url = new URL(request.url);
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({error:"请先登录"},{status:401});
  if (url.searchParams.get("email") && url.searchParams.get("email")!.trim().toLowerCase() !== email) return NextResponse.json({error:"无权访问"},{status:403});
  const session = (url.searchParams.get("session") ?? "").trim();
  if (!email) return NextResponse.json({ sessions: [] });
  if (session) {
    const s = await getGenchatSession(email, session).catch(() => null);
    return NextResponse.json({ session: s });
  }
  const sessions = await listGenchatSessions(email).catch(() => []);
  return NextResponse.json({ sessions });
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
  await saveGenchatSession(email, id, body.title ?? "", body.turns ?? []).catch(
    () => {}
  );
  return NextResponse.json({ ok: true });
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
  await deleteGenchatSession(email, session).catch(() => {});
  return NextResponse.json({ ok: true });
}
