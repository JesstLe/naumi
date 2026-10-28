import { NextResponse } from "next/server";
import { ModelConfigError } from "@/lib/model-config/types";
import { TeamError } from "@/lib/teams/server";
import {ZodError} from "zod";

export function audioFailure(error: unknown) {
  if (error instanceof ModelConfigError || error instanceof TeamError) {
    return NextResponse.json({ error: error.message, code: "code" in error ? error.code : undefined }, { status: error.status });
  }
  if (error instanceof SyntaxError) return NextResponse.json({ error: "音频请求格式无效", code: "INVALID_AUDIO_REQUEST" }, { status: 422 });
  if (error instanceof ZodError) return NextResponse.json({error: "音频请求字段无效", code: "INVALID_AUDIO_REQUEST", fields: error.issues.map(issue => issue.path.join("."))}, {status: 422});
  return NextResponse.json({ error: "音频保存暂未完成，请重试" }, { status: 503 });
}
