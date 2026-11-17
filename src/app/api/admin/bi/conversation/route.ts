import { NextResponse } from "next/server";
import { biAuthorize, biJson } from "@/lib/bi/access";
import { biConversation, logBiAccess } from "@/lib/bi/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await biAuthorize(request);
  if (auth instanceof NextResponse) return auth;
  const params = new URL(request.url).searchParams;
  const id = params.get("id") || "",
    email = params.get("email") || "",
    kind = params.get("kind"),
    page = Number(params.get("page") || 1);
  if (
    !id ||
    id.length > 200 ||
    !email ||
    email.length > 254 ||
    !["agent", "genchat"].includes(kind || "") ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100000
  )
    return biJson({ error: "对话参数无效" }, 400);
  try {
    request.signal.throwIfAborted();
    await logBiAccess(auth.actor, "view-conversation", "conversations", email);
    return biJson(
      await biConversation(id, email, kind as "agent" | "genchat", page, request.signal),
    );
  } catch {
    if (request.signal.aborted) return biJson({ error: "查询已取消" }, 499);
    return biJson({ error: "对话内容读取失败" }, 500);
  }
}
