import { NextResponse } from "next/server";
import { biAuthorize, biJson, sameSiteBiMutation } from "@/lib/bi/access";
import {
  manageBiUser,
  ManagementError,
  userCommandSchema,
} from "@/lib/bi/user-management";
import { supabaseEnabled } from "@/lib/auth-mode";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const auth = await biAuthorize(request);
  if (auth instanceof NextResponse) return auth;
  if (!sameSiteBiMutation(request))
    return biJson({ error: "不允许跨站更新" }, 403);
  const parsed = userCommandSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return biJson(
      { error: parsed.error.issues[0]?.message || "管理参数无效" },
      400,
    );
  if (
    supabaseEnabled &&
    ["create", "reset-password", "role"].includes(parsed.data.action)
  )
    return biJson(
      { error: "当前外部认证账户请在身份服务中管理凭据与权限" },
      409,
    );
  try {
    return biJson(await manageBiUser(parsed.data, auth.actor));
  } catch (error) {
    return error instanceof ManagementError
      ? biJson({ error: error.message }, error.status)
      : biJson(
          {
            error: "操作结果暂未确认，请使用同一操作编号重试",
            uncertain: true,
          },
          500,
        );
  }
}
