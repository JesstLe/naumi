import {withBiRequest} from "@/lib/bi/request";
import {generateToolImage} from "@/lib/tools/model-image";
import {requestImageQuality} from "@/lib/image-quality-request";
import type {ResolvedImageQuality} from "@/lib/image-quality";
import {withBillingRequest} from "@/lib/billing/synchronous";
import {configuredToolCost, synchronousChargedCredits} from "@/lib/billing/synchronous-operation";
import { NextResponse } from "next/server";
import {reserveCredits, refundCredits} from "@/lib/billing/legacy-credit-reservation";
import {addLedgerEntry} from "@/lib/billing/legacy-ledger";
import {dbEnabled} from "@/platform/db/pool";
import {addArtworks} from "@/lib/artworks/writer";
import {getUser} from "@/lib/accounts/session";
import {isBanned} from "@/lib/accounts/repository";
import { clientIp } from "@/lib/ip";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled } from "@/lib/object-storage/runtime";
import { uploadImage } from "@/lib/media-upload";
import { safeError } from "@/lib/api-error";

// Model-backed enhancement. The selected model/quality/resolution belong to the
// existing frozen execution; no dedicated Replicate token or local upscale.
export const runtime = "nodejs";
export const maxDuration = 280;

type UpscaleInput = {
  quality: ResolvedImageQuality;
  resolution: string;
  direction: string;
  bytes: Buffer;
  type: string;
  email: string;
  title: string;
  scale?: number; // Legacy callers' requested enhancement intent, not a resize.
  parentId: string;
};

async function parseInput(request: Request): Promise<UpscaleInput | null> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const s = (k: string) => (f.get(k) ?? "").toString();

  let bytes: Buffer | null = null;
  let type = "image/png";
  const file = f.get("image");
  if (file instanceof File && file.size > 0) {
    bytes = Buffer.from(await file.arrayBuffer());
    type = file.type || "image/png";
  } else {
    // 也支持传 sourceUrl(画布/作品页对已有图放大,不必先下载)
    const src = s("sourceUrl").trim();
    if (src) {
      const r = await fetch(src, { cache: "no-store" });
      if (r.ok) {
        bytes = Buffer.from(await r.arrayBuffer());
        type = r.headers.get("content-type") || "image/png";
      }
    }
  }
  if (!bytes) return null;

  return {
    bytes,
    type,
    quality: requestImageQuality(request,f.get("quality")??undefined),
    resolution: s("resolution") || "1K",
    direction: s("direction") || (s("faceEnhance")==="1"?"portrait":"general"),
    email: s("email").trim(),
    title: s("title").trim() || "高清放大",
    scale: s("scale") === "4" ? 4 : s("scale")==="2" ? 2 : undefined,
    parentId: s("parentId").trim(),
  };
}

async function billingRoutePost(request: Request) {
  let input: UpscaleInput | null;
  try {
    input = await parseInput(request);
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!input) {
    return NextResponse.json({ error: "缺少待放大的图片" }, { status: 400 });
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
    const cost = await configuredToolCost(input.resolution);

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

    let out: { buf: Buffer; contentType: string };
    try {
      const generated=await generateToolImage({tool:"upscale",bytes:input.bytes,type:input.type,quality:input.quality,direction:input.direction,scale:input.scale});
      const sharp=(await import("sharp")).default;
      out={buf:await sharp(generated).png().toBuffer(),contentType:"image/png"};
    } catch (e) {
      if (useDb && cost > 0)
        await refundCredits(input.email, cost).catch(() => {});
      throw e;
    }

    const ext = out.contentType.includes("jpeg") ? "jpg" : "png";
    const id = `up-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    let url = `data:${out.contentType};base64,${out.buf.toString("base64")}`;
    if (storageEnabled) {
      try {
        url = await uploadImage(
          new Uint8Array(out.buf),
          out.contentType,
          `upscales/${id}.${ext}`
        );
      } catch (e) {
        console.error(
          "[upscale] R2 upload failed, returning inline:",
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
          `upscales/src-${id}.${sext}`
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
              category: "upscale",
              prompt: "",
              status: "completed",
              image: url,
              gradient: "from-sky-100 to-slate-100",
              style: null,
              ratio: null,
              resolution: input.resolution,
              source: srcUrl,
              parentId: input.parentId || null,
              parentIds: [],
            },
          ],
          `up-${Date.now()}`
        );
      } catch (e) {
        console.error(
          "[upscale] addArtworks failed:",
          e instanceof Error ? e.message : e
        );
      }
      if (cost > 0) {
        await addLedgerEntry(input.email, -cost, "AI 变清晰").catch(() => {});
      }
      user = await getUser(input.email).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      id,
      url,
      creditsUsed: useDb ? synchronousChargedCredits(cost) : 0,
      user,
    });
  } catch (e) {
    console.error(
      "[upscale] failed:",
      e instanceof Error ? `${e.name}: ${e.message}` : e
    );
    return NextResponse.json(
      { error: safeError(e, "变清晰服务暂时不可用,请稍后重试") },
      { status: 500 }
    );
  }
}

export async function POST(request:Request){return withBillingRequest(request,"tool.upscale",()=>withBiRequest(request,()=>billingRoutePost(request)));}
