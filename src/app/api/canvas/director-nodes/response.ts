import { NextResponse } from "next/server";
import { ModelConfigError } from "@/lib/model-config/types";
import { TeamError } from "@/lib/teams/server";
export function directorFailure(error: unknown) {
  return error instanceof ModelConfigError || error instanceof TeamError
    ? NextResponse.json({ error: error.message, code: "code" in error ? error.code : undefined }, { status: error.status })
    : NextResponse.json({ error: "导演工程保存暂未完成，请重试" }, { status: 503 });
}
