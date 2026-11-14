import { NextResponse } from "next/server";
import {pingDb} from "@/platform/db/pool";
import {dbEnabled} from "@/platform/db/pool";
import { storageEnabled } from "@/lib/object-storage/runtime";
import { getOpenAISettings } from "@/lib/settings";
import {videoReleaseReadiness} from '@/lib/model-config/video-release-readiness';
import { authMode } from "@/lib/auth-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-service connectivity check for local "接真实服务" verification.
// Visit /api/health after filling .env.local to confirm each integration.
export async function GET() {
  const db = await pingDb();
  const oai = await getOpenAISettings();
  let videoExecution:{ready:boolean;modelVersion?:number;models?:number;channels?:number;issues?:number};
  try{const value=await videoReleaseReadiness();videoExecution={ready:value.ready,modelVersion:value.modelVersion,models:value.models,channels:value.channels,issues:value.issues.length};}catch{videoExecution={ready:false};}

  return NextResponse.json({
    db: { enabled: dbEnabled, ok: db.ok, error: db.error },
    storage: { enabled: storageEnabled },
    auth: { mode: authMode },
    openai: {
      enabled: !!oai.apiKey,
      model: oai.model,
      keySource: oai.source,
    },
    product: "Naumi",
    videoExecution,
  },{status:videoExecution.ready?200:503});
}
