import { modelAwareOpenAI } from "@/lib/model-config/clients";
import {withBillingRequest,configuredToolCost,synchronousChargedCredits} from "@/lib/billing/synchronous";
import { observeOpenAI, withBiRequest } from "@/lib/bi/model-observer";
import { requestImageQuality, imageQualityCost, withQualityFallback, sdkImageQuality, settleToolImage } from "@/lib/image-quality-request";
import type { ResolvedImageQuality } from "@/lib/image-quality";
import { NextResponse } from "next/server";
import { insufficientCreditsMessage } from "@/lib/commerce";
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
import { rateLimit } from "@/lib/rate-limit";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { safeError } from "@/lib/api-error";

// 服装去皱:gpt-image-2 把衣服上的褶皱/折痕抚平、面料平整如新,其余(版型/颜色/模特/背景)全保留。
export const runtime = "nodejs";
export const maxDuration = 200;


const BASE_PROMPT =
  "Remove ALL wrinkles, creases and folds from the clothing in this image, making the fabric look smooth, flat, neat and freshly ironed/steamed. Keep EVERYTHING ELSE strictly identical — the exact garment design, cut, colour, pattern, prints, text, logos, the person/model (face, body, pose) if present, the background, lighting and overall composition must stay the same. Only smooth out the wrinkles; do not restyle, recolor or move anything.";

type Input = {
  quality: ResolvedImageQuality; bytes: Buffer; type: string; email: string; prompt: string; ratio: string };

function sizeForRatio(ratio: string): "auto" | "1024x1024" | "1536x1024" | "1024x1536" {
  if (!ratio || ratio === "自动" || ratio === "auto") return "auto";
  const m = /^(\d+):(\d+)$/.exec(ratio);
  if (!m) return "auto";
  const r = Number(m[1]) / Number(m[2]);
  if (r > 1.1) return "1536x1024";
  if (r < 0.9) return "1024x1536";
  return "1024x1024";
}

async function parseInput(request: Request): Promise<Input | null> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const s = (k: string) => (f.get(k) ?? "").toString();
  const file = f.get("image");
  if (!(file instanceof File && file.size > 0)) return null;
  return {
    quality: requestImageQuality(request, f.get("quality") ?? undefined),
    bytes: Buffer.from(await file.arrayBuffer()),
    type: file.type || "image/png",
    email: s("email").trim(),
    prompt: s("prompt").trim(),
    ratio: s("ratio").trim(),
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

async function handleObservedPost(request: Request) {
  let input: Input | null;
  try {
    input = await parseInput(request);
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!input) return NextResponse.json({ error: "缺少图片" }, { status: 400 });
  if (input.bytes.length > 12 * 1024 * 1024)
    return NextResponse.json({ error: "图片过大(请 < 12MB)" }, { status: 400 });

  try {
    const ip = clientIp(request);
    if (!rateLimit(`dewrinkle:${ip}`, 40, 600_000))
      return NextResponse.json({ error: "请求过于频繁,请稍后再试" }, { status: 429 });

    if (dbEnabled) {
      const tokenEmail = await resolveUserEmail(request);
      if (!tokenEmail)
        return NextResponse.json({ error: "请先登录后再操作" }, { status: 401 });
      input.email = tokenEmail;
    }
    const useDb = dbEnabled && input.email.length > 0;
    const cost = await imageQualityCost(input.quality);

    if (dbEnabled && (await isBanned(input.email, ip)))
      return NextResponse.json({ error: "账号或 IP 已被封禁" }, { status: 403 });

    if (useDb && cost > 0) {
      const ok = await reserveCredits(input.email, cost);
      if (!ok)
        return NextResponse.json({ error: insufficientCreditsMessage }, { status: 402 });
    }

    let out: Buffer;
    try {
      const { apiKey, model: genModel } = await getOpenAISettings();
      if (!apiKey) throw new Error("未配置 OpenAI key");
      const client = observeOpenAI(modelAwareOpenAI({
        apiKey,
        baseURL: (await getOpenAIBaseUrl()) || undefined,
        timeout: 200_000,
        maxRetries: 0,
      }));
      const png = await toPng(input.bytes);
      const prompt = BASE_PROMPT + (input.prompt ? ` Extra: ${input.prompt}.` : "");
      const r = await withQualityFallback(input.quality, async executed => client.images.edit({
        model: genModel || "gpt-image-2",
        image: await toFile(png, "image.png", { type: "image/png" }),
        prompt,
        n: 1,
        size: sizeForRatio(input.ratio) as "1024x1024",
        quality: sdkImageQuality(executed),
      }), genModel || "gpt-image-2");
      const b64 = r.data?.[0]?.b64_json;
      if (!b64) throw new Error("未返回结果图");
      out = Buffer.from(b64, "base64");
    } catch (e) {
      if (useDb && cost > 0) await refundCredits(input.email, cost).catch(() => {});
      throw e;
    }

    const id = `dwk-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    let url = `data:image/png;base64,${out.toString("base64")}`;
    if (storageEnabled) {
      try {
        url = await uploadImage(new Uint8Array(out), "image/png", `dewrinkle/${id}.png`);
      } catch (e) {
        console.error("[dewrinkle] R2 upload failed:", e instanceof Error ? e.message : e);
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
          `dewrinkle/src-${id}.${sext}`
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
              title: "服装去皱",
              category: "dewrinkle",
              prompt: input.prompt,
              status: "completed",
              image: url,
              gradient: "from-sky-100 to-slate-100",
              style: null,
              ratio: input.ratio || null,
              resolution: null,
              source: srcUrl,
              parentId: null,
              parentIds: [],
            },
          ],
          `dwk-${Date.now()}`
        );
      } catch (e) {
        console.error("[dewrinkle] addArtworks failed:", e instanceof Error ? e.message : e);
      }
      await settleToolImage(input.email, cost, "服装去皱", input.quality, id);
      user = await getUser(input.email).catch(() => null);
    }

    return NextResponse.json({ ok: true, id, url, creditsUsed: useDb ? synchronousChargedCredits(cost) : 0, quality: input.quality, user });
  } catch (e) {
    return NextResponse.json(
      { error: safeError(e, "服装去皱服务暂时不可用,请稍后重试") },
      { status: 500 }
    );
  }
}

async function billingRoutePost(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){return withBillingRequest(request,"tool.dewrinkle",()=>billingRoutePost(request));}
