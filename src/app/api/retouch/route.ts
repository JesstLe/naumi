import {withBillingRequest} from "@/lib/billing/synchronous";
import {configuredToolCost, synchronousChargedCredits} from "@/lib/billing/synchronous-operation";
import {withBiRequest} from "@/lib/bi/request";
import { requestImageQuality, imageQualityCost, settleToolImage } from "@/lib/image-quality-request";
import type { ResolvedImageQuality } from "@/lib/image-quality";
import { NextResponse } from "next/server";
import { insufficientCreditsMessage } from "@/lib/commerce";
import { editImage, isImageTimeout } from "@/lib/image-edit";
import { safeError } from "@/lib/api-error";
import {reserveCredits, refundCredits} from "@/lib/billing/legacy-credit-reservation";
import {dbEnabled} from "@/platform/db/pool";
import {addArtworks} from "@/lib/artworks/writer";
import {getUser} from "@/lib/accounts/session";
import {isBanned} from "@/lib/accounts/repository";
import { clientIp } from "@/lib/ip";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled, uploadImage } from "@/lib/storage";

// ---------------------------------------------------------------------------
// AI 商品精修:单张商品原图 + 快捷优化项(多选) + 补充要求 → 图生图精修。
// 保持商品与构图不变,只做质感层面优化。同步返回,积分预扣,失败全退。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

const OPTIONS: Record<string, string> = {
  gloss: "增强产品光泽(高光、反光与材质质感更高级)",
  blemish: "修复划痕、瑕疵与污渍,画面干净无杂物",
  clarity: "提升整体清晰度与细节锐度",
  color: "色彩校正(白平衡准确、饱和度自然舒适)",
  perspective: "修正透视变形(横平竖直,产品不歪斜)",
};

async function parseInput(request: Request) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const file = f.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  const rawOpts = (f.getAll("option") as string[]).map((o) => o.trim());
  const options = Array.from(new Set(rawOpts)).filter((o) => OPTIONS[o]);
  return {
    quality: requestImageQuality(request, f.get("quality") ?? undefined),
    image: {
      buf: Buffer.from(await file.arrayBuffer()),
      type: file.type || "image/png",
    },
    options: options.length > 0 ? options : ["gloss", "clarity"],
    extra: (f.get("text") ?? "").toString().trim().slice(0, 400),
    email: (f.get("email") ?? "").toString().trim(),
  };
}

async function handleObservedPost(request: Request) {
  const input = await parseInput(request).catch(() => null);
  if (!input) {
    return NextResponse.json({ error: "请上传一张商品原图" }, { status: 400 });
  }
  if (input.image.buf.length > 12 * 1024 * 1024) {
    return NextResponse.json(
      { error: "上传图片过大（请 < 12MB）" },
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
    const optDesc = input.options.map((o) => `- ${OPTIONS[o]}`).join(";");
    const extraNote = input.extra ? `\n用户补充要求:${input.extra}。` : "";
    const prompt =
      "对这张商品原图进行专业精修(AI 商品精修)。" +
      "硬性要求:商品本身(形状、品牌、标签文字、外观)与构图、视角、比例完全保持不变," +
      "只做质感与画面层面的优化。精修项:\n" +
      optDesc +
      extraNote +
      "\n输出一张可直接上架的精修成片,观感自然不过度处理。";

    const buf = await editImage({
      quality: input.quality,
      images: [input.image.buf],
      types: [input.image.type],
      prompt,
      size: "1024x1024",
    });

    let url: string;
    if (storageEnabled) {
      try {
        url = await uploadImage(
          new Uint8Array(buf),
          "image/png",
          `retouch/ret-${Date.now()}.png`
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
              id: `ret-${Date.now()}`,
              title: "商品精修",
              category: "main",
              prompt: "",
              status: "completed",
              image: url,
              gradient: "from-amber-100 to-orange-100",
              style: null,
              ratio: "1:1",
              resolution: "1K",
              source: "main",
            },
          ],
          `retouch-${Date.now()}`
        );
      } catch {
        /* Artwork history is optional; settlement is mandatory. */
      }
      await settleToolImage(input.email, cost, "商品精修 1 张", input.quality, undefined);
      const user = await getUser(input.email).catch(() => null);
      return NextResponse.json({ ok: true, url, cost, quality: input.quality, user });
    }
    return NextResponse.json({ ok: true, url, cost, quality: input.quality });
  } catch (e) {
    if (useDb) await refundCredits(input.email, cost).catch(() => {});
    console.error("[retouch] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: isImageTimeout(e) ? "生成服务响应超时，本次未生成成功，请稍后重试" : safeError(e, "精修失败,请稍后重试") },
      { status: isImageTimeout(e) ? 504 : 502 }
    );
  }
}

async function billingRoutePost(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){return withBillingRequest(request,"tool.retouch",()=>billingRoutePost(request));}
