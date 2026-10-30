import { NextResponse } from "next/server";
import { authenticatedEmail } from "@/lib/request-auth";
import {getAgentSession} from "@/lib/agent/session-repository";
import {dbEnabled} from "@/platform/db/pool";
import {checkRateLimit} from "@/lib/rate-limit-http";
import { SkillError, conversationSkillDraft, validateSkillSelection } from "@/lib/image-skills/catalog";
import { listImageSkills, saveImageSkill, archiveImageSkill, imageSkillEnterprise } from "@/lib/image-skills/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  try {
    const email = dbEnabled ? await authenticatedEmail(request) : null;
    if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (request.method === "GET") return NextResponse.json({ skills: await listImageSkills(email), enterprise: await imageSkillEnterprise(email) }, { headers: { "Cache-Control": "private, no-store" } });
    const rateLimitResult = await checkRateLimit(`image-skills:${email}`, 60, 600000);
    if (rateLimitResult instanceof Response) return rateLimitResult;
    if (!rateLimitResult) return NextResponse.json({ error: "操作频繁，请稍后重试" }, { status: 429 });
    // Bound bytes as well as fields; a chunked request cannot bypass Content-Length checks.
    const reader = request.body?.getReader(); let raw = ""; let size = 0;
    if (!reader) throw new SkillError("缺少技能内容");
    const decoder = new TextDecoder();
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 32768) { await reader.cancel(); throw new SkillError("技能内容过大", 413); } raw += decoder.decode(part.value, { stream: true }); }
    raw += decoder.decode();
    let body: any; try { body = JSON.parse(raw); } catch { throw new SkillError("技能格式不正确"); }
    if (!body || typeof body !== "object") throw new SkillError("技能格式不正确");
    if (request.method === "DELETE") { await archiveImageSkill(email, body.selection); return NextResponse.json({ ok: true }); }
    if (body.action === "conversation-draft") {
      if (typeof body.sessionId !== "string" || body.sessionId.length > 80) throw new SkillError("请先完成一次对话");
      const session = await getAgentSession(email, body.sessionId);
      if (!session) throw new SkillError("会话不存在或无权访问", 404);
      return NextResponse.json({ instructions: conversationSkillDraft(Array.isArray(session.messages) ? session.messages : []) });
    }
    if (request.method === "PATCH" && !validateSkillSelection(body.selection)) throw new SkillError("缺少待编辑的技能版本");
    return NextResponse.json({ skill: await saveImageSkill(email, body.definition, request.method === "PATCH" ? body.selection : undefined, body.visibility) }, { status: request.method === "POST" ? 201 : 200 });
  } catch (error) {
    if (error instanceof SkillError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[image-skills] storage request failed");
    return NextResponse.json({ error: "技能保存服务暂时不可用，请重试" }, { status: 503 });
  }
}
export const GET = handle, POST = handle, PATCH = handle, DELETE = handle;
