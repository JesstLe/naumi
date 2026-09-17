import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  dbEnabled,
  setArtworkCanvasGroups,
  type CanvasGroupAssignment,
} from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: "group" | "ungroup";
  ids?: string[];
  assignments?: CanvasGroupAssignment[];
};

export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  let assignments: CanvasGroupAssignment[] = [];
  if (Array.isArray(body.assignments)) {
    assignments = body.assignments;
  } else {
    const ids = Array.from(
      new Set((body.ids ?? []).map((id) => String(id).trim()).filter(Boolean))
    ).slice(0, 200);
    if (body.action === "group") {
      if (ids.length < 2) {
        return NextResponse.json({ error: "至少选择两个节点才能成组" }, { status: 400 });
      }
      const canvasGroupId = `canvas-group-${randomUUID()}`;
      assignments = ids.map((id) => ({ id, canvasGroupId }));
    } else if (body.action === "ungroup") {
      if (!ids.length) {
        return NextResponse.json({ error: "请选择需要解组的节点" }, { status: 400 });
      }
      assignments = ids.map((id) => ({ id, canvasGroupId: null }));
    }
  }

  if (!assignments.length) {
    return NextResponse.json({ error: "缺少分组参数" }, { status: 400 });
  }
  if (!dbEnabled) {
    return NextResponse.json({ ok: true, persisted: false, assignments });
  }
  try {
    const updated = await setArtworkCanvasGroups(email, assignments);
    return NextResponse.json({ ok: true, persisted: true, assignments: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "画布分组保存失败";
    const status = /不存在|无权|跨项目|同一画布/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
