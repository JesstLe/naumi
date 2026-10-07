import "server-only";
import type { ModelExecutionScope } from "./context";
import type { ValidationOptions } from "./schema";
import { executionFetch } from "./clients";
import { procurementCny } from "./business";
import { ModelConfigError } from "./types";
import { beginExecutionStage, finishExecutionStage } from "./execution-audit";

function auditStream(response: Response, id: string) {
  const reader=response.body!.getReader(),decoder=new TextDecoder();
  let pending="",usage:unknown,completed=false;
  const parse=(line:string)=>{if(!line.startsWith("data:"))return;const data=line.slice(5).trim();if(data==="[DONE]"){completed=true;return;}try{const chunk=JSON.parse(data);if(chunk.usage)usage=chunk.usage;}catch{/* Non-JSON supplier event is not a usage receipt. */}};
  const body=new ReadableStream<Uint8Array>({
    async pull(controller){try{const part=await reader.read();if(part.done){if(pending)parse(pending);await finishExecutionStage(id,completed?"stream-completed":"unknown",response.status,usage);controller.close();return;}pending+=decoder.decode(part.value,{stream:true});let end;while((end=pending.indexOf("\n"))>=0){parse(pending.slice(0,end).replace(/\r$/,""));pending=pending.slice(end+1);}if(pending.length>131072)pending="";controller.enqueue(part.value);}catch(e){await finishExecutionStage(id,"unknown",response.status,usage);controller.error(e);}},
    async cancel(reason){await reader.cancel(reason);await finishExecutionStage(id,"unknown",response.status,usage);},
  });
  return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}

/** Timeouts, 5xx and lost responses never re-submit. */
export function stageRoutingFetch(scope: ModelExecutionScope, options: ValidationOptions): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init), policy = scope.routing?.policy;
    if (policy && request.method === "POST") {
      const body = request.headers.get("content-type")?.includes("multipart/form-data") ? Object.fromEntries(await request.clone().formData()) : await request.clone().json();
      if (body.n !== undefined && Number(body.n) !== 1) throw new ModelConfigError("INVALID_REQUEST", "阶段路由每次只提交一个输出；批量任务按独立输出执行", 400);
    }
    let active = scope, ruleId = scope.routing?.matchedRuleId;
    const visited = new Set<string>();
    for (let attempt = 1; attempt <= (policy?.maxAttempts || 1); attempt++) {
      visited.add(active.connection.providerId + ":" + active.connection.wireModel);
      if (policy) {
        const cost = procurementCny(active.procurement);
        if (!cost?.amountMicros || scope.routing!.spentMicros + BigInt(cost.amountMicros) > BigInt(policy.costCapCnyMicros)) throw new ModelConfigError("ROUTE_BUDGET", "路由采购成本上限不足，停止调用", 409);
        scope.routing!.spentMicros += BigInt(cost.amountMicros);
      }
      const id = await beginExecutionStage(active, attempt, ruleId);
      try {
        const prefix = new URL(scope.connection.baseUrl).pathname.replace(/\/$/, "");
        const path = new URL(request.url).pathname;
        if (!path.startsWith(prefix + "/")) throw new ModelConfigError("INVALID_ENDPOINT", "请求超出冻结接口路径", 400);
        const suffix = path.slice(prefix.length), headers = new Headers(request.headers);
        headers.set("authorization", `Bearer ${active.connection.apiKey}`);
        const copy = request.clone();
        const res = await executionFetch({ ...active, routing: undefined, audited: true }, options)(`${active.connection.baseUrl.replace(/\/$/, "")}${suffix}`, { method: request.method, headers, body: request.method === "POST" ? await copy.arrayBuffer() : undefined, signal: request.signal });
        const rejected = [400,401,403,404,422,429].includes(res.status);
        // Failure HTTP status alone does not prove a paid task was not accepted.
        const receipt = rejected && res.headers.get("content-type")?.includes("application/json") ? await res.clone().json().catch(() => null) : null;
        const definite = rejected && (receipt?.billing_status === "not_charged" || receipt?.error?.billing_status === "not_charged");
        let usage: unknown;
        if (res.ok && active.connection.protocol === "openai-chat" && res.headers.get("content-type")?.includes("application/json")) usage = (await res.clone().json().catch(() => ({}))).usage;
        await finishExecutionStage(id, res.ok ? "response-received" : definite ? "rejected-not-charged" : "unknown", res.status, usage);
        if (res.ok && res.body && res.headers.get("content-type")?.includes("text/event-stream")) return auditStream(res,id);
        if (!res.ok && !definite) {
          await res.body?.cancel();
          return Response.json({ error: { message: "供应商付费状态不明，已暂停；请查询原任务，不会重复提交", code: "UPSTREAM_BILLING_UNKNOWN" } }, { status: 409 });
        }
        if (res.ok || !policy || attempt === policy.maxAttempts) return res;
        const rule = [...policy.rules].sort((a,b) => b.priority-a.priority).find(r => r.stage === "failure" && (r.when.status as number[]).includes(res.status) && !visited.has(scope.routing!.targets[r.targetUpstreamId].connection.providerId + ":" + scope.routing!.targets[r.targetUpstreamId].connection.wireModel));
        if (!rule) return res;
        await res.body?.cancel(); active = { ...scope, ...scope.routing!.targets[rule.targetUpstreamId] }; ruleId = rule.id;
      } catch (e) { await finishExecutionStage(id, "unknown"); throw e; }
    }
    throw new ModelConfigError("ROUTE_EXHAUSTED", "路由尝试结束", 503);
  };
}
