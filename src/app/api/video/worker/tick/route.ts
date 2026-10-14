import { NextResponse } from "next/server";

import { scanVideoWorkerOnce } from "@/lib/video/worker";
import { recoverCanvasImageTasks } from "@/lib/canvas-image-tasks";
import { recoverDurableImageJobs, imageWorkerAuthorized } from "@/lib/durable-image-jobs";
import { scanSupplierCostsOnce } from "@/lib/supplier-cost/worker";
import {recoverMediaMirrors} from "@/lib/media-assets";
import {recoverMediaJobs} from "@/lib/video/media-jobs";

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
  await import("@/lib/reference-workbench/service").then(m=>m.recoverReferenceWorkbench());
  const supplierCostsProcessed = await scanSupplierCostsOnce();
  const mediaSaved = await recoverMediaMirrors().catch(()=>0);
  const mediaProcessed=await recoverMediaJobs();
  return NextResponse.json({
    ok: true,
    processed: videoProcessed + imageProcessed + generationProcessed + mediaProcessed,
    mediaProcessed,
    generationProcessed,
    supplierCostsProcessed,
    mediaSaved,
    videoProcessed,
    imageProcessed,
    at: new Date().toISOString(),
  });
}
