import { NextResponse } from "next/server";
import { ModelConfigError } from "@/lib/model-config/types";
import { TeamError } from "@/lib/teams/server";

export function sceneFailure(error: unknown) {
  if (error instanceof ModelConfigError || error instanceof TeamError) {
    return NextResponse.json({ error: error.message, code: "code" in error ? error.code : undefined }, { status: error.status });
  }
  if (error instanceof SyntaxError) return NextResponse.json({ error: "场景请求格式无效", code: "INVALID_SCENE_REQUEST" }, { status: 422 });
  return NextResponse.json({ error: "场景保存暂未完成，请重试" }, { status: 503 });
}
