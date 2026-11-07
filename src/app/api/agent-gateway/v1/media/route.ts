import { gatewayRoute } from "@/lib/agent-gateway/http";
import { GatewayError } from "@/lib/agent-gateway/errors";
import { ownedMediaResponse } from "@/lib/agent-gateway/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return gatewayRoute(request, async caller => {
    const url = new URL(request.url).searchParams.get("url");
    if (!url) throw new GatewayError("ARGUMENT_INVALID", "缺少 url 参数", 400);
    return ownedMediaResponse(url, caller.email, caller.origins, request.headers.get("range"));
  });
}
