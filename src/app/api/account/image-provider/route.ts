import { NextResponse } from "next/server";

import { dbEnabled } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { decryptFromClient, getPublicKeyPem } from "@/lib/settings";
import {
  clearUserImageProvider,
  discoverUserImageModels,
  getUserImageProviderViews,
  saveUserImageProvider,
  setActiveUserImageProvider,
  type UserImageProviderProtocol,
} from "@/lib/user-image-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function actor(request: Request) {
  if (!dbEnabled) return null;
  return authenticatedEmail(request);
}

export async function GET(request: Request) {
  const email = await actor(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const providers = await getUserImageProviderViews(email);
  return NextResponse.json({
    providers,
    activeId: providers.find((p) => p.isActive)?.id ?? null,
    publicKeyPem: await getPublicKeyPem(),
  });
}

export async function POST(request: Request) {
  const email = await actor(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as
    | {
        action?: string;
        id?: string;
        name?: string;
        activate?: boolean;
        protocol?: UserImageProviderProtocol;
        baseUrl?: string;
        encryptedApiKey?: string;
        apiKeyPlain?: string;
        models?: unknown;
        defaultModel?: string;
      }
    | null;
  if (!body) {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const providerId = String(body.id || "").trim() || undefined;
  try {
    let apiKey = "";
    if (body.encryptedApiKey?.trim()) {
      apiKey = (await decryptFromClient(body.encryptedApiKey)).trim();
    } else if (body.apiKeyPlain?.trim()) {
      apiKey = body.apiKeyPlain.trim();
    }
    if (body.action === "test") {
      const models = await discoverUserImageModels(email, {
        baseUrl: String(body.baseUrl || "").trim() || undefined,
        apiKey: apiKey || undefined,
        providerId,
      });
      return NextResponse.json({ ok: true, models });
    }
    if (body.action === "activate") {
      if (!providerId) {
        return NextResponse.json({ error: "缺少供应商 id" }, { status: 400 });
      }
      const providers = await setActiveUserImageProvider(email, providerId);
      return NextResponse.json({ ok: true, providers });
    }
    const result = await saveUserImageProvider({
      email,
      id: providerId,
      name: String(body.name || ""),
      activate: body.activate === true,
      protocol:
        body.protocol === "chat-completions" ? "chat-completions" : "openai-images",
      baseUrl: String(body.baseUrl || ""),
      apiKey: apiKey || undefined,
      models: body.models,
      defaultModel: String(body.defaultModel || ""),
    });
    return NextResponse.json({ ok: true, savedId: result.savedId, providers: result.views });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "保存图片接口失败" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const email = await actor(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id") || undefined;
  const providers = await clearUserImageProvider(email, id);
  return NextResponse.json({ ok: true, providers });
}
