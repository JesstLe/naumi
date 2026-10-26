import { modelAwareOpenAI } from "@/lib/model-config/clients";
import {withBillingRequest} from "@/lib/billing/synchronous";
import {configuredToolCost, synchronousChargedCredits} from "@/lib/billing/synchronous-operation";
import {observeOpenAI} from "@/lib/bi/model-calls";
import {withBiRequest} from "@/lib/bi/request";
import { requestImageQuality, imageQualityCost, withQualityFallback, sdkImageQuality, settleToolImage } from "@/lib/image-quality-request";
import type { ResolvedImageQuality } from "@/lib/image-quality";
import { NextResponse } from "next/server";
import { insufficientCreditsMessage } from "@/lib/commerce";
import OpenAI, { toFile } from "openai";
import {reserveCredits, refundCredits} from "@/lib/billing/legacy-credit-reservation";
import {dbEnabled} from "@/platform/db/pool";
import {addArtworks} from "@/lib/artworks/writer";
import {getUser} from "@/lib/accounts/session";
import {isBanned} from "@/lib/accounts/repository";
import { clientIp } from "@/lib/ip";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled } from "@/lib/object-storage/runtime";
import { uploadImage } from "@/lib/media-upload";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { safeError } from "@/lib/api-error";

// 去水印:gpt-image-2 擦除图中的水印/logo/文字叠层/时间戳/站标等标记,并自然补全被遮挡的底图,
// 其余(主体/颜色/构图/背景/光照)全保留。
export const runtime = "nodejs";
export const maxDuration = 200;


const BASE_PROMPT =
  "Remove ALL watermarks, logos, text overlays, timestamps, site/station marks and semi-transparent stamps from this image, and naturally reconstruct the underlying content behind them so the result looks clean and unmarked. Keep EVERYTHING ELSE strictly identical — the exact product/subject, colours, patterns, composition, background, lighting must stay the same. Only remove the watermark/overlay marks; do not restyle, recolor, crop or move anything.";

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

    const id = `dwm-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    let url = `data:image/png;base64,${out.toString("base64")}`;
    if (storageEnabled) {
      try {
        url = await uploadImage(new Uint8Array(out), "image/png", `dewatermark/${id}.png`);
      } catch (e) {
        console.error("[dewatermark] R2 upload failed:", e instanceof Error ? e.message : e);
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
          `dewatermark/src-${id}.${sext}`
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
              title: "去水印",
              category: "dewatermark",
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
          `dwm-${Date.now()}`
        );
      } catch (e) {
        console.error("[dewatermark] addArtworks failed:", e instanceof Error ? e.message : e);
      }
      await settleToolImage(input.email, cost, "去水印", input.quality, id);
      user = await getUser(input.email).catch(() => null);
    }

    return NextResponse.json({ ok: true, id, url, creditsUsed: useDb ? synchronousChargedCredits(cost) : 0, quality: input.quality, user });
  } catch (e) {
    return NextResponse.json(
      { error: safeError(e, "去水印服务暂时不可用,请稍后重试") },
      { status: 500 }
    );
  }
}

async function billingRoutePost(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){return withBillingRequest(request,"tool.dewatermark",()=>billingRoutePost(request));}
