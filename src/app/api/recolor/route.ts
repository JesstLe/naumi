import { NextResponse } from "next/server";
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
// AI 产品换色:单张商品原图 + 目标颜色(hex)+强度 → 图生图只换色。
// 硬性约束:产品形态/材质纹理/光影/品牌文字/背景全部不变,仅改颜色。
// 同步返回,积分预扣,失败全退。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 300;

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

// hex → 近似中文颜色名(帮助模型理解目标色)。
function colorName(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 0.08) return l > 0.85 ? "白色" : l > 0.55 ? "浅灰色" : l > 0.25 ? "深灰色" : "黑色";
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  let base = "红色";
  if (h < 15) base = "红色";
  else if (h < 40) base = "橙色";
  else if (h < 70) base = "黄色";
  else if (h < 100) base = "黄绿色";
  else if (h < 160) base = "绿色";
  else if (h < 200) base = "青色";
  else if (h < 255) base = "蓝色";
  else if (h < 290) base = "紫色";
  else if (h < 335) base = "粉紫色";
  else base = "玫红色";
  const light = l > 0.75 ? "浅" : l < 0.3 ? "深" : "";
  return light + base;
}

async function parseInput(request: Request) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const file = f.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  const rawColor = f.get("color");
  let color = (typeof rawColor === "string" ? rawColor : "").toString().trim();
  if (!HEX_RE.test(color)) color = "";
  const rawStrength = f.get("strength");
  const strength = Math.max(
    20,
    Math.min(100, parseInt(typeof rawStrength === "string" ? rawStrength : "100", 10) || 100)
  );
  return {
    image: {
      buf: Buffer.from(await file.arrayBuffer()),
      type: file.type || "image/png",
    },
    color: color.replace("#", "").toLowerCase(),
    strength,
    email: (f.get("email") ?? "").toString().trim(),
  };
}

export async function POST(request: Request) {
  const input = await parseInput(request).catch(() => null);
  if (!input) {
    return NextResponse.json({ error: "请上传一张商品原图" }, { status: 400 });
  }
  if (!input.color) {
    return NextResponse.json({ error: "请选择目标颜色" }, { status: 400 });
  }
  if (input.image.buf.length > 12 * 1024 * 1024) {
    return NextResponse.json(
      { error: "上传图片过大（请 < 12MB）" },
      { status: 400 }
    );
  }

  const { apiKey, model } = await getOpenAISettings();
  const ip = clientIp(request);
  if (!rateLimit(`recolor:${ip}`, 12, 600_000)) {
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
      return NextResponse.json({ error: "积分不足，请充值后重试" }, { status: 402 });
    }
  }

  try {
    const name = colorName(input.color);
    const hex = `#${input.color}`;
    const strengthNote =
      input.strength >= 90
        ? "完全替换为目标色"
        : `向目标色靠拢约 ${input.strength}%(保留部分原色调)`;
    const prompt =
      `对这张商品图做「产品换色」:把图中商品的主体颜色替换为${name}(十六进制 ${hex}),${strengthNote}。` +
      "硬性要求:商品的形状、结构、材质纹理(保留纹理细节)、明暗光影方向、品牌与标签文字、" +
      "背景与周围元素全部保持完全不变,只改变商品主体的颜色;换色后颜色均匀自然、光照真实,可直接上架。";

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
          `recolor/rec-${Date.now()}.png`
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
              id: `rec-${Date.now()}`,
              title: `产品换色·${name}`,
              category: "main",
              prompt: "",
              status: "completed",
              image: url,
              gradient: "from-violet-100 to-indigo-100",
              style: null,
              ratio: "1:1",
              resolution: "1K",
              source: "main",
            },
          ],
          `recolor-${Date.now()}`
        );
        await addLedgerEntry(input.email, -cost, `产品换色(${name}) 1 张`).catch(() => {});
      } catch {
        /* non-fatal */
      }
      const user = await getUser(input.email).catch(() => null);
      return NextResponse.json({ ok: true, url, cost, user });
    }
    return NextResponse.json({ ok: true, url, cost });
  } catch (e) {
    if (useDb) await refundCredits(input.email, cost).catch(() => {});
    console.error("[recolor] failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: safeError(e, "换色失败,请稍后重试") },
      { status: 502 }
    );
  }
}
