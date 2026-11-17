import { gatewayJson, gatewayRoute } from "@/lib/agent-gateway/http";
import { listGatewayTools } from "@/lib/agent-gateway/executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return gatewayRoute(request, async caller => gatewayJson({ tools: await listGatewayTools(caller) }), {creation:true});
}
