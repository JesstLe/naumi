import OpenAI from "openai";
import { NextResponse } from "next/server";
import { resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/lib/db";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { rateLimit } from "@/lib/rate-limit";
import { getOpenAISettings } from "@/lib/settings";
import { toVisionDataUrl } from "@/lib/vision-image";

export const runtime = "nodejs";
export const maxDuration = 90;

type VisionResult = {
  passed: boolean;
  score: number;
  summary: string;
  issues: string[];
  retryAdvice: string;
};

export async function POST(request: Request) {
  const email = dbEnabled ? await resolveUserEmail(request) : null;
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  if (!rateLimit(`agent-vision:${email}`, 30, 600_000)) {
    return NextResponse.json({ error: "视觉检查过于频繁，请稍后再试" }, { status: 429 });
  }
  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  const goal = String(form?.get("goal") || "检查电商图片是否可交付").slice(0, 1200);
  if (!(image instanceof File) || image.size === 0 || image.size > 12 * 1024 * 1024) {
    return NextResponse.json({ error: "请提供 12MB 以内的商品图片" }, { status: 400 });
  }
  const settings = await getOpenAISettings();
  const apiKey = process.env.AGENT_API_KEY || settings.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: "模型接口未配置" }, { status: 503 });
  }
  const dataUrl = await toVisionDataUrl(
    Buffer.from(await image.arrayBuffer()),
    image.type || "image/png"
  );
  const client = new OpenAI({
    apiKey,
    baseURL:
      process.env.AGENT_BASE_URL || (await getOpenAIBaseUrl()) || undefined,
  });
  try {
    const response = await client.chat.completions.create({
      model: process.env.AGENT_VISION_MODEL || "qwen3.8-flash",
      messages: [
        {
          role: "system",
          content:
            "你是电商图片质检员。只检查可观察事实，不猜测。重点检查：商品主体是否完整露出且未被裁切、主体/包装/品牌是否明显变形、文字是否乱码或不可读、版式是否符合用户目标、是否有明显多余肢体/物体/水印。只输出 JSON：{\"passed\":boolean,\"score\":0到100整数,\"summary\":\"一句话\",\"issues\":[\"问题\"],\"retryAdvice\":\"需要重做时给具体修改建议，否则空串\"}。",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `用户目标：${goal}` },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 900,
    });
    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = parseJson(raw) as Partial<VisionResult>;
    const result: VisionResult = {
      passed: parsed.passed === true,
      score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
      summary: String(parsed.summary || "视觉检查已完成").slice(0, 300),
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map(String).map((item) => item.slice(0, 200)).slice(0, 8)
        : [],
      retryAdvice: String(parsed.retryAdvice || "").slice(0, 500),
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "视觉模型暂时不可用，未将本次图片标记为已验收" },
      { status: 502 }
    );
  }
}

function parseJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("视觉模型未返回 JSON");
  return JSON.parse(fenced.slice(start, end + 1));
}
