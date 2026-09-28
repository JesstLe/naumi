import { NextResponse } from "next/server";

import { scanVideoWorkerOnce } from "@/lib/video/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const configured = String(process.env.VIDEO_WORKER_SECRET || "");
  const supplied = request.headers.get("x-video-worker-secret") || "";
  if (!configured || supplied !== configured) {
    return NextResponse.json({ error: "worker authentication failed" }, { status: 401 });
  }
  const processed = await scanVideoWorkerOnce();
  return NextResponse.json({ ok: true, processed, at: new Date().toISOString() });
}
