import { modelAwareOpenAI } from "@/lib/model-config/clients";
import {withBillingRequest,configuredToolCost,synchronousChargedCredits} from "@/lib/billing/synchronous";
import { observeOpenAI, withBiRequest } from "@/lib/bi/model-observer";
import { requestImageQuality, imageQualityCost, withQualityFallback, sdkImageQuality, settleToolImage } from "@/lib/image-quality-request";
import type { ResolvedImageQuality } from "@/lib/image-quality";
import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import {
  dbEnabled,
  reserveCredits,
  refundCredits,
  addArtworks,
  getUser,
  isBanned,
} from "@/lib/db";
import { clientIp } from "@/lib/ip";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { getOpenAISettings, getCutoutSettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { safeError } from "@/lib/api-error";

// ---------------------------------------------------------------------------
// 抠头像专用端点。
//
// 从图里把主体(人物/宠物/卡通)的头部抠出来,做透明底大头贴。
// 走 gpt-image-1 的 images.edit(background:transparent)。落库 category="avatar"。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 200;


const BASE_PROMPT =
  "Cut out ONLY the head (with a little neck and shoulders) of the main subject in this image — a person, pet or cartoon character. Remove the body, any other subjects and the background completely. Output a clean, sharp head portrait in avatar / sticker style on a fully transparent background. Preserve the original face, hair, ears, expression and fine details exactly. No body, no extra subjects, no shadow, no border.";

type AvatarInput = {
  quality: ResolvedImageQuality;
  bytes: Buffer;
  type: string;
  email: string;
  prompt: string;
  title: string;
  bg: "transparent" | "white" | "black";
};

async function parseInput(request: Request): Promise<AvatarInput | null> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const s = (k: string) => (f.get(k) ?? "").toString();

  const file = f.get("image");
  if (!(file instanceof File && file.size > 0)) return null;
  const bgRaw = s("bg");
  return {
    quality: requestImageQuality(request, f.get("quality") ?? undefined),
    bytes: Buffer.from(await file.arrayBuffer()),
    type: file.type || "image/png",
    email: s("email").trim(),
    prompt: s("prompt").trim(),
    title: s("title").trim() || "抠头像",
    bg: bgRaw === "white" ? "white" : bgRaw === "black" ? "black" : "transparent",
  };
}

async function toPng(buf: Buffer): Promise<Buffer> {
  try {
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp");
    } & typeof import("sharp");
    const sharp = mod.default ?? mod;
    return await sharp(buf).rotate().png().toBuffer();
  } catch {
    return buf;
  }
}

async function applyBg(
  buf: Buffer,
  bg: "transparent" | "white" | "black"
): Promise<{ buf: Buffer; ext: string }> {
  if (bg === "transparent") return { buf, ext: "png" };
  try {
    const mod = (await import("sharp")) as unknown as {
      default?: typeof import("sharp");
    } & typeof import("sharp");
    const sharp = mod.default ?? mod;
    const out = await sharp(buf)
      .flatten({ background: bg === "white" ? "#ffffff" : "#000000" })
      .png()
      .toBuffer();
    return { buf: out, ext: "png" };
  } catch {
    return { buf, ext: "png" };
  }
}

async function handleObservedPost(request: Request) {
  let input: AvatarInput | null;
  try {
    input = await parseInput(request);
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!input) {
    return NextResponse.json({ error: "缺少图片" }, { status: 400 });
  }
  if (input.bytes.length > 12 * 1024 * 1024) {
    return NextResponse.json({ error: "图片过大(请 < 12MB)" }, { status: 400 });
  }

  try {
    const ip = clientIp(request);

    if (dbEnabled) {
      const tokenEmail = await resolveUserEmail(request);
      if (!tokenEmail) {
        return NextResponse.json({ error: "请先登录后再操作" }, { status: 401 });
      }
      input.email = tokenEmail;
    }
    const useDb = dbEnabled && input.email.length > 0;
    const cost = await imageQualityCost(input.quality);

    if (dbEnabled && (await isBanned(input.email, ip))) {
      return NextResponse.json({ error: "账号或 IP 已被封禁" }, { status: 403 });
    }

    if (useDb && cost > 0) {
      const ok = await reserveCredits(input.email, cost);
      if (!ok) {
        return NextResponse.json(
          { error: "积分不足,请升级方案后重试" },
          { status: 402 }
        );
      }
    }

    let out: Buffer;
    try {
      const { apiKey } = await getOpenAISettings();
      const { openaiModel } = await getCutoutSettings();
      if (!apiKey) throw new Error("未配置 OpenAI key");
      const client = observeOpenAI(modelAwareOpenAI({
        apiKey,
        baseURL: (await getOpenAIBaseUrl()) || undefined,
        timeout: 200_000,
        maxRetries: 0,
      }));
      const png = await toPng(input.bytes);
      const userHint = input.prompt
        ? ` Focus on this subject: ${input.prompt}.`
        : "";
      const prompt = BASE_PROMPT + userHint;
      const r = await withQualityFallback(input.quality, async executed => client.images.edit({
        quality: sdkImageQuality(executed),
        // 透明底只 gpt-image-1 支持(gpt-image-2 实测报错),抠头像必须用它。
        model: openaiModel || "gpt-image-1",
        image: await toFile(png, "image.png", { type: "image/png" }),
        prompt,
        n: 1,
        size: "auto" as "1024x1024",
        background: "transparent" as const,
      }), openaiModel || "gpt-image-1");
      const b64 = r.data?.[0]?.b64_json;
      if (!b64) throw new Error("未返回头像");
      out = Buffer.from(b64, "base64");
    } catch (e) {
      if (useDb && cost > 0)
        await refundCredits(input.email, cost).catch(() => {});
      throw e;
    }

    const final = await applyBg(out, input.bg);
    const id = `avt-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    let url = `data:image/png;base64,${final.buf.toString("base64")}`;
    if (storageEnabled) {
      try {
        url = await uploadImage(
          new Uint8Array(final.buf),
          "image/png",
          `avatars/${id}.${final.ext}`
        );
      } catch (e) {
        console.error(
          "[avatar] R2 upload failed, returning inline:",
          e instanceof Error ? e.message : e
        );
      }
    }

    // 输入原图也存一份(供作品记录「原图 / 成品对比」;失败不阻断主流程)。
    let srcUrl: string | null = null;
    if (storageEnabled) {
      try {
        const sext = input.type.includes("png")
          ? "png"
          : input.type.includes("webp")
            ? "webp"
            : "jpg";
        srcUrl = await uploadImage(
          new Uint8Array(input.bytes),
          input.type,
          `avatars/src-${id}.${sext}`
        );
      } catch {
        /* 原图存档失败,忽略 */
      }
    }

    let user: Awaited<ReturnType<typeof getUser>> = null;
    if (useDb) {
      try {
        await addArtworks(
          input.email,
          [
            {
              id,
              title: input.title,
              category: "avatar",
              prompt: input.prompt,
              status: "completed",
              image: url,
              gradient: "from-pink-100 to-slate-100",
              style: null,
              ratio: null,
              resolution: null,
              source: srcUrl,
              parentId: null,
              parentIds: [],
            },
          ],
          `avt-${Date.now()}`
        );
      } catch (e) {
        console.error(
          "[avatar] addArtworks failed:",
          e instanceof Error ? e.message : e
        );
      }
      await settleToolImage(input.email, cost, "抠头像", input.quality, id);
      user = await getUser(input.email).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      id,
      url,
      creditsUsed: useDb ? synchronousChargedCredits(cost) : 0, quality: input.quality,
      user,
    });
  } catch (e) {
    return NextResponse.json(
      { error: safeError(e, "抠头像服务暂时不可用,请稍后重试") },
      { status: 500 }
    );
  }
}

async function billingRoutePost(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){return withBillingRequest(request,"tool.avatar",()=>billingRoutePost(request));}
