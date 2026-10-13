import { resolveUserEmail } from "@/lib/admin-auth";
import { accessJson, requestFeaturePolicy } from "@/lib/feature-access/server";
export const runtime = "nodejs", dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!(await resolveUserEmail(request))) return accessJson({ error: "请先登录" }, 401);
    const access = await requestFeaturePolicy(request);
    return accessJson({ email: access.email, policy: access.policy });
  } catch { return accessJson({ error: "权限服务暂时不可用" }, 503); }
}
