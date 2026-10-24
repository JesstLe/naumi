import {withBillingRequest,configuredToolCost,synchronousChargedCredits} from "@/lib/billing/synchronous";
import { withBiRequest } from "@/lib/bi/model-observer";
import { requestImageQuality, imageQualityCost, settleToolImage } from "@/lib/image-quality-request";
import type { ResolvedImageQuality } from "@/lib/image-quality";
import { NextResponse } from "next/server";
import { insufficientCreditsMessage } from "@/lib/commerce";
import { editImage, isImageTimeout } from "@/lib/image-edit";
import { safeError } from "@/lib/api-error";
import {dbEnabled, reserveCredits, refundCredits, addArtworks} from "@/lib/db";
import {getUser} from "@/lib/accounts/session";
import {isBanned} from "@/lib/accounts/repository";
import { clientIp } from "@/lib/ip";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled, uploadImage } from "@/lib/storage";

// ---------------------------------------------------------------------------
// 爆款图复刻:商品原图(1-3) + 爆款参考图(1) + 复刻程度 → 图生图单张出图。
// 复刻程度:
//   high  = 高度复刻:照参考图的构图/布光/配色/场景结构,替换成用户的产品与文案。
//   style = 参考风格:只取参考图的风格气质(色调/氛围/质感),构图自由发挥。
// 同步返回(单张 ~1 分钟),积分预扣,失败全退。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

const PLATFORM_LABELS: Record<string, string> = {
  amazon: "亚马逊(简约英文风,符合平台规范)",
  taobao: "淘宝/天猫(中文精品电商风格)",
  pdd: "拼多多(直白促销风)",
  independent: "独立站(现代品牌感,英文)",
};

async function parseInput(request: Request) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const products: { buf: Buffer; type: string }[] = [];
  for (const file of f.getAll("image")) {
    if (file instanceof File && file.size > 0) {
      products.push({
        buf: Buffer.from(await file.arrayBuffer()),
        type: file.type || "image/png",
      });
    }
    if (products.length >= 3) break;
  }
  const ref = f.get("ref");
  const refImg =
    ref instanceof File && ref.size > 0
      ? { buf: Buffer.from(await ref.arrayBuffer()), type: ref.type || "image/png" }
      : null;
  return {
    quality: requestImageQuality(request, f.get("quality") ?? undefined),
    products,
    ref: refImg,
    degree: (f.get("degree") ?? "high").toString().trim() === "style" ? "style" : "high",
    extra: (f.get("text") ?? "").toString().trim().slice(0, 400),
    reversePrompt: (f.get("reversePrompt") ?? "").toString().trim().slice(0, 8000),
    platform: (f.get("platform") ?? "amazon").toString().trim().slice(0, 20),
    lang: (f.get("lang") ?? "auto").toString().trim().slice(0, 10),
    email: (f.get("email") ?? "").toString().trim(),
  };
}

async function handleObservedPost(request: Request) {
  const input = await parseInput(request).catch(() => null);
  if (!input || input.products.length === 0 || !input.ref) {
    return NextResponse.json(
      { error: "请上传商品原图和一张爆款参考图" },
      { status: 400 }
    );
  }
  if ([...input.products, input.ref].some((im) => im.buf.length > 12 * 1024 * 1024)) {
    return NextResponse.json(
      { error: "单张上传图片过大（请 < 12MB）" },
      { status: 400 }
    );
  }

  const ip = clientIp(request);

  if (dbEnabled) {
    const tokenEmail = await resolveUserEmail(request);
    if (!tokenEmail) {
      return NextResponse.json({ error: "请先登录后再生成" }, { status: 401 });
    }
    input.email = tokenEmail;
  }
  const useDb = dbEnabled && input.email.length > 0;
  const cost = await imageQualityCost(input.quality);

  if (dbEnabled && (await isBanned(input.email, ip))) {
    return NextResponse.json(
      { error: "账号或 IP 已被封禁，请联系管理员" },
      { status: 403 }
    );
  }
  if (useDb) {
    const ok = await reserveCredits(input.email, cost);
    if (!ok) {
      return NextResponse.json({ error: insufficientCreditsMessage }, { status: 402 });
    }
  }

  try {
    const langNote =
      input.lang === "en"
        ? "画面文案用简约英文"
        : input.lang === "zh"
          ? "画面文案用精炼中文"
          : "画面文案语言跟随平台习惯";
    const degreeNote =
      input.degree === "high"
        ? "【高度复刻】最后一张参考图定义整张图的构图、布光、配色、场景结构与排版;把商品原图中的产品放进同款构图与场景中(产品位置/姿态对应参考图中的主体),场景细节可有轻微差异。"
        : "【参考风格】只借鉴参考图的风格气质(色调、氛围、质感、字体感觉),为商品原图的产品重新设计一张同风格电商图,构图可自由发挥。";
    const extraNote = input.extra ? `补充要求:${input.extra}。` : "";
    const prompt =
      `你要做「爆款图复刻」。图片说明:最后一张是爆款参考图,其余是商品原图(产品必须取自商品原图)。` +
      `${degreeNote}在完整保留商品原图产品(包装、品牌、文字、外观)完全不变的前提下生成一张电商图。` +
      `文案:${langNote},内容贴合该产品,清晰无错别字,排版精美。平台风格:${PLATFORM_LABELS[input.platform] ?? "通用电商"}。${extraNote}` +
      (input.reversePrompt ? `\n参考图逆向提示词（经用户确认或编辑）：${input.reversePrompt}\n上述提示词中的产品、品牌、文案以商品原图和用户补充要求为准，不照搬参考图的竞品标识。\n` : "") +
      `输出一张可直接上架的成品图。`;

    const images = [...input.products, input.ref];
    const buf = await editImage({
      quality: input.quality,
      images: images.map(im => im.buf),
      types: images.map(im => im.type),
      prompt,
      size: "1024x1024",
    });

    let url: string;
    if (storageEnabled) {
      try {
        url = await uploadImage(
          new Uint8Array(buf),
          "image/png",
          `replicate/rep-${Date.now()}.png`
        );
      } catch {
        url = `data:image/png;base64,${buf.toString("base64")}`;
      }
    } else {
      url = `data:image/png;base64,${buf.toString("base64")}`;
    }

    if (useDb) {
      try {
        await addArtworks(
          input.email,
          [
            {
              id: `rep-${Date.now()}`,
              title: input.degree === "high" ? "爆款复刻·高度" : "爆款复刻·风格",
              category: "main",
              prompt,
              status: "completed",
              image: url,
              gradient: "from-sky-100 to-teal-100",
              style: null,
              ratio: "1:1",
              resolution: "1K",
              source: "main",
            },
          ],
          `replicate-${Date.now()}`
        );
      } catch {
        /* Artwork history is optional; settlement is mandatory. */
      }
      await settleToolImage(input.email, cost, "爆款复刻 1 张", input.quality, undefined);
      const user = await getUser(input.email).catch(() => null);
      return NextResponse.json({ ok: true, url, cost, quality: input.quality, user });
    }
    return NextResponse.json({ ok: true, url, cost, quality: input.quality });
  } catch (e) {
    if (useDb) await refundCredits(input.email, cost).catch(() => {});
    console.error("[replicate] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: isImageTimeout(e) ? "生成服务响应超时，本次未生成成功，请稍后重试" : safeError(e, "复刻生成失败,请稍后重试") },
      { status: isImageTimeout(e) ? 504 : 502 }
    );
  }
}

async function billingRoutePost(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){return withBillingRequest(request,"tool.replicate",()=>billingRoutePost(request));}
