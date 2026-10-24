import { NextResponse } from "next/server";

import { dbEnabled } from "@/platform/db/pool";
import {deleteComfyEndpoint, listComfyEndpoints, saveComfyEndpoint} from "@/lib/comfyui/repository";
import { authenticatedEmail } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import {
  assertComfyEndpointAllowed,
  fetchObjectInfo,
} from "@/lib/comfyui/client";

// ---------------------------------------------------------------------------
// ComfyUI 端点管理(BYOC):GET 列表 / POST(test|activate|save) / DELETE。
// 端点密钥仅用于向端点转发 Bearer,不参与站内生图计费。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actor(request: Request) {
  if (!dbEnabled) return null;
  return authenticatedEmail(request);
}

export async function GET(request: Request) {
  const email = await actor(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const endpoints = await listComfyEndpoints(email);
  // 密钥不回传明文,只回传是否已配置
  return NextResponse.json({
    endpoints: endpoints.map((e) => ({
      id: e.id,
      name: e.name,
      baseUrl: e.baseUrl,
      hasKey: Boolean(e.apiKey),
      isActive: e.isActive,
    })),
  });
}

export async function POST(request: Request) {
  const email = await actor(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`comfyui-ep:${clientIp(request) || "0.0.0.0"}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        id?: string;
        name?: string;
        baseUrl?: string;
        apiKey?: string;
        activate?: boolean;
      }
    | null;
  if (!body) return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });

  try {
    if (body.action === "test") {
      const base = await assertComfyEndpointAllowed(String(body.baseUrl || ""));
      const nodes = await fetchObjectInfo({
        baseUrl: base,
        apiKey: body.apiKey?.trim() || "",
      });
      return NextResponse.json({ ok: true, nodeCount: nodes.length });
    }
    if (body.action === "activate") {
      if (!body.id) return NextResponse.json({ error: "缺少端点 id" }, { status: 400 });
      const endpoints = await saveComfyEndpoint(email, {
        id: body.id,
        baseUrl: (await listComfyEndpoints(email)).find((e) => e.id === body.id)?.baseUrl || "",
        activate: true,
      });
      return NextResponse.json({ ok: true });
    }
    const baseUrl = String(body.baseUrl || "").trim();
    if (!baseUrl) return NextResponse.json({ error: "请填写端点地址" }, { status: 400 });
    const clean = await assertComfyEndpointAllowed(baseUrl);
    await saveComfyEndpoint(email, {
      id: body.id,
      name: body.name,
      baseUrl: clean,
      apiKey: body.apiKey,
      activate: body.activate,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存端点失败" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const email = await actor(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少端点 id" }, { status: 400 });
  await deleteComfyEndpoint(email, id);
  return NextResponse.json({ ok: true });
}
