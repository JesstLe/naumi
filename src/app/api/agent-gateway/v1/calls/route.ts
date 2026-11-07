import { gatewayRoute, ndjsonStream, readJsonBody } from "@/lib/agent-gateway/http";
import { beginGatewayCall } from "@/lib/agent-gateway/executor";
import { parseCallBody } from "@/lib/agent-gateway/input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

// Refusals (auth, scope, arguments, quote, budget, conflicts) answer with a JSON status before
// anything is submitted. An accepted call streams NDJSON: accepted -> progress* -> result.
export function POST(request: Request) {
  return gatewayRoute(request, async caller => {
    const input = parseCallBody(await readJsonBody(request), { operationRequired: true });
    const started = await beginGatewayCall(caller, input);
    if ("replay" in started) {
      const call = started.replay;
      return ndjsonStream(async send => {
        send({ type: "accepted", operationId: call.operationId, tool: call.tool, credits: call.credits, replayed: true });
        send({ type: "result", call });
      });
    }
    return ndjsonStream(async send => {
      send({ type: "accepted", operationId: started.operationId, tool: input.tool, credits: started.credits, replayed: false });
      const call = await started.run(event => send(event));
      send({ type: "result", call });
    });
  }, { creation: true });
}
