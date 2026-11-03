import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authenticatedEmail } from "@/lib/request-auth";
import { sameSiteBiMutation } from "@/lib/bi/access";
import { withCreationRoute } from "@/lib/saas/creation-context";
import { TeamError } from "@/lib/teams/server";
import { ModelConfigError } from "@/lib/model-config/types";
import { readImagegenBody } from "@/lib/imagegen/body";
import { ORIGINAL_IMAGE_MAX_BYTES } from "@/lib/image-upload-policy";
import { browserPreviewsFromForm } from "@/lib/canvas-original-upload";
import { imageReferenceUploadSchema, saveCanvasPromptReferenceUpload } from "@/lib/canvas/image-reference-upload";

export const runtime = "nodejs", dynamic = "force-dynamic", maxDuration = 120;
const headers = { "cache-control": "private, no-store" };
async function upload(request: Request, actor: string) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) return NextResponse.json({ error: "上传格式无效" }, { status: 400, headers });
    if (Number(request.headers.get("content-length")) > ORIGINAL_IMAGE_MAX_BYTES + 9 * 1024 * 1024) return NextResponse.json({ error: "原图需在64MiB以内" }, { status: 413, headers });
    let body: Buffer;
    try { body = await readImagegenBody(request, ORIGINAL_IMAGE_MAX_BYTES + 9 * 1024 * 1024); }
    catch { return NextResponse.json({ error: "上传内容过大或已中断" }, { status: 413, headers }); }
    const form = await new Response(new Uint8Array(body), { headers: { "content-type": contentType } }).formData();
    const file = form.get("image");
    if (!(file instanceof File) || !file.size || file.size > ORIGINAL_IMAGE_MAX_BYTES) return NextResponse.json({ error: "原图需在64MiB以内" }, { status: 413, headers });
    const input = imageReferenceUploadSchema.parse({ operationId: form.get("operationId"), projectKey: form.get("projectKey"), parentId: form.get("parentId"), title: form.get("title") });
    const previews = await browserPreviewsFromForm(form);
    if (!previews && file.size > 12 * 1024 * 1024) return NextResponse.json({ error: "请通过画布上传原图" }, { status: 422, headers });
    const result = await saveCanvasPromptReferenceUpload(actor, input, Buffer.from(await file.arrayBuffer()), previews);
    return NextResponse.json({ ok: true, ...result }, { status: 201, headers });
  } catch (error) {
    if (error instanceof ModelConfigError || error instanceof TeamError) return NextResponse.json({ error: error.message, ...("code" in error ? { code: error.code } : {}) }, { status: error.status, headers });
    if (error instanceof ZodError) return NextResponse.json({ error: "上传参数无效" }, { status: 422, headers });
    return NextResponse.json({ error: "图片上传结果尚未核实，请重试原文件" }, { status: 503, headers });
  }
}
export async function POST(request: Request) {
  // Reject a cross-site write before scope binding can create any metadata.
  if (!sameSiteBiMutation(request)) return NextResponse.json({ error: "不允许跨站上传" }, { status: 403, headers });
  const actor = await authenticatedEmail(request);
  if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401, headers });
  return withCreationRoute(request, () => upload(request, actor));
}
