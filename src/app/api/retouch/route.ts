import { NextResponse } from "next/server";
import { insufficientCreditsMessage } from "@/lib/commerce";
import OpenAI, { toFile } from "openai";
import { POINTS_PER_IMAGE } from "@/lib/mock-data";
import { safeError } from "@/lib/api-error";
import {
  dbEnabled,
  reserveCredits,
  refundCredits,
  addArtworks,
  addLedgerEntry,
  getUser,
  isBanned,
} from "@/lib/db";
import { clientIp } from "@/lib/ip";
import { rateLimit } from "@/lib/rate-limit";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";

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
    image: {
      buf: Buffer.from(await file.arrayBuffer()),
      type: file.type || "image/png",
    },
    options: options.length > 0 ? options : ["gloss", "clarity"],
    extra: (f.get("text") ?? "").toString().trim().slice(0, 400),
    email: (f.get("email") ?? "").toString().trim(),
  };
}

export async function POST(request: Request) {
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

  const { apiKey, model } = await getOpenAISettings();
  const ip = clientIp(request);
  if (!rateLimit(`retouch:${ip}`, 12, 600_000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  if (dbEnabled) {
    const tokenEmail = await resolveUserEmail(request);
    if (!tokenEmail) {
      return NextResponse.json({ error: "请先登录后再生成" }, { status: 401 });
    }
    input.email = tokenEmail;
  }
  const useDb = dbEnabled && input.email.length > 0;
  const cost = POINTS_PER_IMAGE;

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

    const client = new OpenAI({
      apiKey,
      baseURL: (await getOpenAIBaseUrl()) || undefined,
      timeout: 240_000,
      maxRetries: 1,
    });
    const file = await toFile(input.image.buf, "product.png", {
      type: input.image.type,
    });
    const r = await client.images.edit({
      model,
      image: file,
      prompt,
      n: 1,
      size: "1024x1024",
      quality: (process.env.OPENAI_IMAGE_QUALITY || "medium") as
        | "low"
        | "medium"
        | "high"
        | "auto",
    });
    const d = r.data?.[0];
    if (!d) throw new Error("空返回");
    const buf = d.b64_json
      ? Buffer.from(d.b64_json, "base64")
      : Buffer.from(await (await fetch(d.url!)).arrayBuffer());

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
        await addLedgerEntry(input.email, -cost, "商品精修 1 张").catch(() => {});
      } catch {
        /* non-fatal */
      }
      const user = await getUser(input.email).catch(() => null);
      return NextResponse.json({ ok: true, url, cost, user });
    }
    return NextResponse.json({ ok: true, url, cost });
  } catch (e) {
    if (useDb) await refundCredits(input.email, cost).catch(() => {});
    console.error("[retouch] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: safeError(e, "精修失败,请稍后重试") },
      { status: 502 }
    );
  }
}
