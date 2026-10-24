import { NextResponse } from "next/server";
import { authenticatedEmail } from "@/lib/request-auth";
import { dbEnabled } from "@/platform/db/pool";
import { rateLimit } from "@/lib/rate-limit";
import { SkillError } from "@/lib/image-skills/catalog";
import { parseSkillImport, SKILL_IMPORT_MAX_REQUEST_BYTES } from "@/lib/image-skills/import";
import { importImageSkill } from "@/lib/image-skills/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const email = dbEnabled ? await authenticatedEmail(request) : null;
    if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!rateLimit(`image-skills-import:${email}`, 30, 600000)) return NextResponse.json({ error: "操作频繁，请稍后重试" }, { status: 429 });
    const contentType = request.headers.get("content-type") || "";
    if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new SkillError("请使用文件上传导入 Skill");
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > SKILL_IMPORT_MAX_REQUEST_BYTES) throw new SkillError("上传内容过大", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new SkillError("请选择要导入的技能文件");
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > SKILL_IMPORT_MAX_REQUEST_BYTES) { await reader.cancel(); throw new SkillError("上传内容过大", 413); }
      chunks.push(part.value);
    }
    let form: FormData;
    try { form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: Buffer.concat(chunks) }).formData(); }
    catch { throw new SkillError("文件上传格式不正确"); }
    const files = form.getAll("file");
    if (files.length !== 1 || typeof files[0] === "string" || [...form.entries()].some(([key, value]) => key !== "file" && typeof value !== "string")) throw new SkillError("每次请选择一个技能文件");
    // Client-supplied email/owner values never select a target account.
    const file = files[0], parsed = parseSkillImport(file.name, new Uint8Array(await file.arrayBuffer()));
    const result = await importImageSkill(email, parsed.definition);
    return NextResponse.json({ ...result, ...(parsed.warnings.length ? { warnings: parsed.warnings } : {}) }, { status: result.duplicate ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SkillError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[image-skills] file import failed");
    return NextResponse.json({ error: "技能导入服务暂时不可用，请重试" }, { status: 503 });
  }
}
