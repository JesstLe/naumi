import { NextResponse } from "next/server";
import OpenAI from "openai";
import { dbEnabled } from "@/lib/db";
import { resolveUserEmail } from "@/lib/admin-auth";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import { safeError } from "@/lib/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  if (dbEnabled && !(await resolveUserEmail(request))) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const ip = clientIp(request) || "0.0.0.0";
  if (!rateLimit(`canvas-text:${ip}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "操作过于频繁，请稍后再试" }, { status: 429 });
  }
  let prompt = "";
  try {
    const body = (await request.json()) as { prompt?: string };
    prompt = String(body.prompt || "").trim().slice(0, 4000);
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "请输入要生成的文字内容" }, { status: 400 });
  }

  const model = process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna";
  const settings = await getOpenAISettings();
  const apiKey = process.env.AGENT_API_KEY || settings.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: "文字模型接口未配置" }, { status: 503 });
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL:
        process.env.AGENT_BASE_URL || (await getOpenAIBaseUrl()) || undefined,
    });
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是电商创作画布里的文字生成助手。直接完成用户要求，可写标题、卖点、脚本、详情文案、提示词或结构化方案。内容要清晰、可直接复制使用；除非用户要求，不要解释过程，不要添加空泛口号。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.75,
      max_tokens: 1800,
    });
    const text = (response.choices[0]?.message?.content || "").trim();
    if (!text) {
      return NextResponse.json({ error: "文字生成没有返回内容，请重试" }, { status: 502 });
    }
    return NextResponse.json({ text, model });
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "文字生成失败，请稍后重试") },
      { status: 502 }
    );
  }
}
