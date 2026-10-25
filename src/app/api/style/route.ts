import { modelAwareOpenAI } from "@/lib/model-config/clients";
import {withBillingRequest} from "@/lib/billing/synchronous";
import {configuredToolCost, synchronousChargedCredits} from "@/lib/billing/synchronous-operation";
import {observeOpenAI} from "@/lib/bi/model-calls";
import {withBiRequest} from "@/lib/bi/request";
import { requestImageQuality, imageQualityCost, withQualityFallback, sdkImageQuality, settleToolImage } from "@/lib/image-quality-request";
import type { ResolvedImageQuality } from "@/lib/image-quality";
import { NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import {reserveCredits, refundCredits} from "@/lib/billing/legacy-credit-reservation";
import {dbEnabled} from "@/platform/db/pool";
import {addArtworks} from "@/lib/artworks/writer";
import {getUser} from "@/lib/accounts/session";
import {isBanned} from "@/lib/accounts/repository";
import { clientIp } from "@/lib/ip";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { safeError } from "@/lib/api-error";

// ---------------------------------------------------------------------------
// 风格转换专用端点。
//
// gpt-image 图生图:保持主体/构图,只把画面整体重绘成目标艺术风格。
// 前端传风格指令(style)+ 可选补充描述,落库 category="style"。计费同生图。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 280;


const BASE_PROMPT =
  "Re-render the uploaded image into the target art style described below. Keep the main subject, overall composition, pose, layout and key recognizable elements intact — only change the artistic style, texture and rendering. Target style: ";

type StyleInput = {
  quality: ResolvedImageQuality;
  bytes: Buffer;
  type: string;
  email: string;
  style: string; // 目标风格的英文指令(前端预设)
  styleLabel: string; // 风格中文名(落库/标题用)
  prompt: string; // 用户补充描述
  title: string;
};

async function parseInput(request: Request): Promise<StyleInput | null> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const s = (k: string) => (f.get(k) ?? "").toString();

  const file = f.get("image");
  if (!(file instanceof File && file.size > 0)) return null;
  const style = s("style").trim();
  if (!style) return null;
  return {
    quality: requestImageQuality(request, f.get("quality") ?? undefined),
    bytes: Buffer.from(await file.arrayBuffer()),
    type: file.type || "image/png",
    email: s("email").trim(),
    style: style.slice(0, 400),
    styleLabel: s("styleLabel").trim().slice(0, 20) || "风格转换",
    prompt: s("prompt").trim(),
    title: s("title").trim() || "风格转换",
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
  let input: StyleInput | null;
  try {
    input = await parseInput(request);
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!input) {
    return NextResponse.json(
      { error: "缺少原图或风格" },
      { status: 400 }
    );
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
      const { apiKey, model: genModel } = await getOpenAISettings();
      if (!apiKey) throw new Error("未配置 OpenAI key");
      const client = observeOpenAI(modelAwareOpenAI({
        apiKey,
        baseURL: (await getOpenAIBaseUrl()) || undefined,
        timeout: 280_000,
        maxRetries: 0,
      }));
      const png = await toPng(input.bytes);
      const userHint = input.prompt ? ` Extra requirement: ${input.prompt}.` : "";
      const prompt = `${BASE_PROMPT}${input.style}.${userHint}`;
      const r = await withQualityFallback(input.quality, async executed => client.images.edit({
        quality: sdkImageQuality(executed),
        model: genModel || "gpt-image-2",
        image: await toFile(png, "image.png", { type: "image/png" }),
        prompt,
        n: 1,
        size: "auto" as "1024x1024",
      }), genModel || "gpt-image-2");
      const b64 = r.data?.[0]?.b64_json;
      if (!b64) throw new Error("未返回结果");
      out = Buffer.from(b64, "base64");
    } catch (e) {
      if (useDb && cost > 0)
        await refundCredits(input.email, cost).catch(() => {});
      throw e;
    }

    const id = `sty-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    let url = `data:image/png;base64,${out.toString("base64")}`;
    if (storageEnabled) {
      try {
        url = await uploadImage(
          new Uint8Array(out),
          "image/png",
          `styles/${id}.png`
        );
      } catch (e) {
        console.error(
          "[style] R2 upload failed, returning inline:",
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
          `styles/src-${id}.${sext}`
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
              category: "style",
              prompt: input.prompt,
              status: "completed",
              image: url,
              gradient: "from-fuchsia-100 to-slate-100",
              style: input.styleLabel,
              ratio: null,
              resolution: null,
              source: srcUrl,
              parentId: null,
              parentIds: [],
            },
          ],
          `sty-${Date.now()}`
        );
      } catch (e) {
        console.error(
          "[style] addArtworks failed:",
          e instanceof Error ? e.message : e
        );
      }
      await settleToolImage(input.email, cost, "风格转换", input.quality, id);
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
      { error: safeError(e, "风格转换服务暂时不可用,请稍后重试") },
      { status: 500 }
    );
  }
}

async function billingRoutePost(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){return withBillingRequest(request,"tool.style",()=>billingRoutePost(request));}
