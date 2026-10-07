import { NextResponse } from "next/server";

import { scanVideoWorkerOnce } from "@/lib/video/worker";
import { recoverCanvasImageTasks } from "@/lib/canvas-image-tasks";
import { recoverDurableImageJobs, imageWorkerAuthorized } from "@/lib/durable-image-jobs";
import { scanSupplierCostsOnce } from "@/lib/supplier-cost/worker";

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
  const supplierCostsProcessed = await scanSupplierCostsOnce();
  return NextResponse.json({
    ok: true,
    processed: videoProcessed + imageProcessed + generationProcessed,
    generationProcessed,
    supplierCostsProcessed,
    videoProcessed,
    imageProcessed,
    at: new Date().toISOString(),
  });
}
