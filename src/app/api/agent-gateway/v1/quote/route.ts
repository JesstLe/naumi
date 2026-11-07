import { gatewayJson, gatewayRoute, readJsonBody } from "@/lib/agent-gateway/http";
import { quoteGatewayCall } from "@/lib/agent-gateway/executor";
import { parseCallBody } from "@/lib/agent-gateway/input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return gatewayRoute(request, async caller => {
    const input = parseCallBody(await readJsonBody(request), { operationRequired: false });
    return gatewayJson(await quoteGatewayCall(caller, input));
  }, { creation: true });
}
