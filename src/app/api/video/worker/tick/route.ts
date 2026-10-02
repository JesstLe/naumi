import { NextResponse } from "next/server";

import { scanVideoWorkerOnce } from "@/lib/video/worker";
import { recoverCanvasImageTasks } from "@/lib/canvas-image-tasks";
import { recoverDurableImageJobs, imageWorkerAuthorized } from "@/lib/durable-image-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!imageWorkerAuthorized(request)) {
    return NextResponse.json({ error: "worker authentication failed" }, { status: 401 });
  }
  const videoProcessed = await scanVideoWorkerOnce();
  const imageProcessed = await recoverCanvasImageTasks(2);
  const generationProcessed = await recoverDurableImageJobs();
  return NextResponse.json({
    ok: true,
    processed: videoProcessed + imageProcessed + generationProcessed,
    generationProcessed,
    videoProcessed,
    imageProcessed,
    at: new Date().toISOString(),
  });
}
