import { NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { authorizedTargetEmail } from "@/lib/request-auth";
import { listCanvasNodeSettings } from "@/lib/canvas-node-settings-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const email = await authorizedTargetEmail(request, new URL(request.url).searchParams.get("email"), true);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!dbEnabled) return NextResponse.json({ persisted: false, settings: {} });
  try { return NextResponse.json({ persisted: true, settings: await listCanvasNodeSettings(email) }); }
  catch { return NextResponse.json({ error: "属性读取失败，请刷新重试" }, { status: 503 }); }
}
