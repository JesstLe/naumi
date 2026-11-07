import { gatewayJson, gatewayRoute } from "@/lib/agent-gateway/http";
import { GatewayError } from "@/lib/agent-gateway/errors";
import { MAX_UPLOAD_BYTES, saveAgentUpload, publicMediaUrl } from "@/lib/agent-gateway/media";
import { assertAgentToolAccess } from "@/lib/feature-access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reference images for tools. Stored like an agent attachment upload (owned, listed in works).
export function POST(request: Request) {
  return gatewayRoute(request, async caller => {
    if (!(request.headers.get("content-type") || "").includes("multipart/form-data")) throw new GatewayError("ARGUMENT_INVALID", "请用 multipart/form-data 上传 file 字段", 400);
    if (Number(request.headers.get("content-length") || 0) > MAX_UPLOAD_BYTES + 64 * 1024) throw new GatewayError("MEDIA_INVALID", "图片不能超过 12MB", 413);
    await assertAgentToolAccess(caller.email, "inspect_images");
    let form: FormData;
    try { form = await request.formData(); } catch { throw new GatewayError("ARGUMENT_INVALID", "上传内容无效", 400); }
    const file = form.get("file");
    if (!(file instanceof File)) throw new GatewayError("ARGUMENT_INVALID", "缺少 file 字段", 400);
    const saved = await saveAgentUpload(caller.email, file);
    return gatewayJson({ ...saved, url: publicMediaUrl(saved.url, caller.origin) }, 201);
  }, { creation: true });
}
