import { NextResponse } from "next/server";

import { dbEnabled } from "@/lib/db";
import { authenticatedEmail } from "@/lib/request-auth";
import { decryptFromClient, getPublicKeyPem } from "@/lib/settings";
import {
  clearUserImageProvider,
  discoverUserImageModels,
  getUserImageProviderView,
  saveUserImageProvider,
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
  return NextResponse.json({
    ...(await getUserImageProviderView(email)),
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
        enabled?: boolean;
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
      });
      return NextResponse.json({ ok: true, models });
    }
    const view = await saveUserImageProvider({
      email,
      enabled: body.enabled === true,
      protocol:
        body.protocol === "chat-completions" ? "chat-completions" : "openai-images",
      baseUrl: String(body.baseUrl || ""),
      apiKey: apiKey || undefined,
      models: body.models,
      defaultModel: String(body.defaultModel || ""),
    });
    return NextResponse.json({ ok: true, ...view });
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
  await clearUserImageProvider(email);
  return NextResponse.json({ ok: true });
}
