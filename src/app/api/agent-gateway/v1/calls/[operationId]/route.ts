import { gatewayJson, gatewayRoute } from "@/lib/agent-gateway/http";
import { readCall } from "@/lib/agent-gateway/calls";
import { GatewayError } from "@/lib/agent-gateway/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  return gatewayRoute(request, async caller => {
    const call = await readCall(caller.token, (await params).operationId.toLowerCase());
    if (!call) throw new GatewayError("OPERATION_NOT_FOUND", "该令牌下没有这个 operationId 的任务", 404);
    return gatewayJson(call);
  });
}
