import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatedEmail } from "@/lib/request-auth";
import { dbEnabled } from "@/lib/db";
import { featureRequestGate, ACCESS_HEADERS } from "@/lib/feature-access/server";
import { rateLimit } from "@/lib/rate-limit";
import { commandSchema, packagingMessages, parsePackagingResult, PackagingError } from "@/lib/packaging-strategy/contract";
import { beginPackagingCommand, finishPackagingCommand, getPackagingProject, listPackagingProjects } from "@/lib/packaging-strategy/server";
import { withBiRequest, observeOpenAI } from "@/lib/bi/model-observer";
import { modelAwareOpenAI } from "@/lib/model-config/clients";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { requestedTextModel } from "@/lib/text-models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: ACCESS_HEADERS});
async function actor(request: Request) {
  const blocked = await featureRequestGate(request);
  if (blocked) return blocked;
  const email = dbEnabled ? await authenticatedEmail(request) : null;
  return email || json({error: "请先登录"}, 401);
}
function failure(error: unknown) {
  if (error instanceof PackagingError) return json({error: error.message}, error.status);
  console.error("[packaging-strategy] request failed");
  return json({error: "包装策略服务暂时不可用，请稍后重试"}, 503);
}
export async function GET(request: Request) {
  try {
    const email = await actor(request); if (typeof email !== "string") return email;
    const id = new URL(request.url).searchParams.get("id");
    if (id && !z.string().uuid().safeParse(id).success) throw new PackagingError("项目标识无效");
    return json(id ? {project: await getPackagingProject(email, id)} : {projects: await listPackagingProjects(email)});
  } catch (error) { return failure(error); }
}
async function boundedCommand(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new PackagingError("请填写包装简报");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const value = await reader.read(); if (value.done) break;
    size += value.value.byteLength;
    if (size > 65536) { await reader.cancel(); throw new PackagingError("简报内容过大", 413); }
    chunks.push(value.value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new PackagingError("请求格式不正确"); }
  const parsed = commandSchema.safeParse(body);
  if (!parsed.success) throw new PackagingError("请检查简报字段、项目版本和修改要求");
  return parsed.data;
}
export async function POST(request: Request) {
  try {
    const email = await actor(request); if (typeof email !== "string") return email;
    const command = await boundedCommand(request.clone());
    if (!rateLimit(`packaging:${email}`, command.action === "save" ? 60 : 20, 600000)) return json({error: "操作频繁，请稍后重试"}, 429);
    if (command.action !== "save" && !command.brief.brand) throw new PackagingError("请先填写品牌与产品");
    // Save never resolves an upstream model; generation uses the same platform
    // text.generate binding and telemetry as the site's other text tools.
    const run = async () => {
      const claim = await beginPackagingCommand(email, command);
      if (!claim.runId) return json({project: claim.project});
      try {
        const settings = await getOpenAISettings();
        const apiKey = process.env.AGENT_API_KEY || settings.apiKey;
        if (!apiKey) throw new PackagingError("文字模型接口尚未配置", 503);
        const client = observeOpenAI(modelAwareOpenAI({apiKey, baseURL: process.env.AGENT_BASE_URL || await getOpenAIBaseUrl() || undefined, timeout: 120000, maxRetries: 0}));
        const response = await client.chat.completions.create({
          model: requestedTextModel(request, process.env.OPENAI_TEXT_MODEL || process.env.AGENT_MODEL || "gpt-5.6-luna"),
          messages: packagingMessages(command, claim.previous, claim.previousAnswers),
          response_format: {type: "json_object"}, max_tokens: 5500,
        }, {signal: request.signal});
        const result = parsePackagingResult(response.choices[0]?.message?.content || "", command.allowDraft);
        return json({project: await finishPackagingCommand(email, claim.project.id, claim.runId, result)});
      } catch (error) {
        const project = await finishPackagingCommand(email, claim.project.id, claim.runId, null);
        return json({error: error instanceof PackagingError ? error.message : "策略生成未完成，请检查网络或稍后重试", project}, error instanceof PackagingError ? error.status : 502);
      }
    };
    return command.action === "save" ? await run() : await withBiRequest(request, run);
  } catch (error) { return failure(error); }
}
