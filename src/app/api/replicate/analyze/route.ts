import { NextResponse } from "next/server";
import { competitorActor, competitorError, normalizeUpload, analyzeCompetitor, WorkspaceError } from "@/lib/competitor-server";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { requestedTextModel } from "@/lib/text-models";
import {withBiRequest} from "@/lib/bi/request";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Reuse the competitor workbench's vision compression, prompt and region analysis. */
async function handlePost(request: Request) {
  try {
    const email = await competitorActor(request);
    const rateLimitResult = await checkRateLimit(`replicate-analyze:${email}`, 30, 600_000);
    if (rateLimitResult instanceof Response) return rateLimitResult;
    if (!rateLimitResult) throw new WorkspaceError("分析过于频繁，请稍后重试", 429);
    const form = await request.formData().catch(() => null);
    const file = form?.get("ref");
    if (!(file instanceof File)) throw new WorkspaceError("请上传一张爆款参考图");
    const normalized = await normalizeUpload(file);
    const analysis = await analyzeCompetitor(normalized.data, requestedTextModel(request));
    return NextResponse.json({ ok: true, ...analysis });
  } catch (error) {
    return competitorError(error);
  }
}
export async function POST(request: Request) {
  return withBiRequest(request, () => handlePost(request));
}
