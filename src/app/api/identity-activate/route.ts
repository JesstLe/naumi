import { redeemCentralInvite } from "@/lib/enterprise/identity/accounts";
import { teamJson, teamFailure, teamMutationOrigin } from "@/lib/teams/access";
import { checkRateLimit } from "@/lib/rate-limit-http";
import { clientIp } from "@/lib/ip";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!request.headers.get("origin") || !teamMutationOrigin(request))
    return teamJson({ error: "请求来源无效" }, 403);
  const rate = await checkRateLimit(
    "identity-activate:" + clientIp(request),
    15,
    60000,
  );
  if (rate instanceof Response) return rate;
  if (!rate) return teamJson({ error: "请稍后重试" }, 429);
  const body = await request.json().catch(() => null);
  if (typeof body?.token !== "string" || typeof body?.password !== "string")
    return teamJson({ error: "请填写密码" }, 400);
  try {
    return teamJson(await redeemCentralInvite(body.token, body.password));
  } catch (e) {
    return teamFailure(e);
  }
}
