import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import { dbEnabled, getPool } from "@/lib/db";
import { resolveUserEmail } from "@/lib/admin-auth";
import { currentImageOperationId } from "@/lib/image-gateway";
import { ensureBiSchema } from "./repository";
import {markBillingUpstream} from "@/lib/billing/synchronous";
import { withModelRequest } from "@/lib/model-config/requests";
import { ModelConfigError } from "@/lib/model-config/types";
import { currentModelExecution, type ModelExecutionScope } from "@/lib/model-config/context";
import { isManagedModelClient } from "@/lib/model-config/clients";

export function modelExecutionTelemetry(scope: ModelExecutionScope | null | undefined) {
  return scope ? { publicModelId: scope.frozen.publicModelId, providerId: scope.connection.providerId, modelVersion: scope.frozen.modelVersion, billingVersion: scope.frozen.billingVersion, digest: scope.frozen.routerDigest || scope.frozen.modelDigest } : undefined;
}

type Context = { email: string; operation: string; id?: string };
const context = new AsyncLocalStorage<Context>();
export function withBiModelContext<T>(
  email: string,
  operation: string,
  id: string,
  run: () => Promise<T>,
) {
  return context.run({ email, operation, id }, run);
}
export async function withBiRequest<T extends Response>(
  request: Request,
  run: () => Promise<T>,
) {
  const email = dbEnabled
    ? await resolveUserEmail(request).catch(() => null)
    : null;
  if (!email) return run();
  try { return await context.run({ email, operation: new URL(request.url).pathname.slice(0, 100) }, () => withModelRequest(request, run)); }
  catch (error) { if (error instanceof ModelConfigError) return new Response(JSON.stringify({ error: error.message, code: error.code }), { status: error.status, headers: { "content-type": "application/json", "cache-control": "no-store" } }) as T; throw error; }
}

type ObservedResponse = {
  model?: unknown;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
};
function token(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export async function recordBiModelCompletion(input: {
  email: string;
  operation: string;
  operationId: string;
  model: string;
  responseModel?: string;
  state: string;
  durationMs: number;
  inputTokens?: unknown;
  outputTokens?: unknown;
  execution?: ReturnType<typeof modelExecutionTelemetry> | null;
}) {
  if (!dbEnabled) return;
  try {
    await ensureBiSchema();
    await getPool().query(
      `INSERT INTO app_bi_model_calls(id,email,operation,operation_id,wire_model,response_model,state,duration_ms,input_tokens,output_tokens,public_model_id,provider_id,model_version,billing_version,config_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        randomUUID(),
        input.email,
        input.operation,
        input.operationId,
        input.model.slice(0, 200),
        (input.responseModel || "").slice(0, 200),
        input.state,
        Math.max(0, Math.min(2147483647, input.durationMs)),
        token(input.inputTokens),
        token(input.outputTokens),
        input.execution?.publicModelId || "", input.execution?.providerId || "", input.execution?.modelVersion || null, input.execution?.billingVersion || null, input.execution?.digest || "",
      ],
    );
  } catch {
    /* Completed model telemetry cannot interrupt agent execution. */
  }
}
export async function observeModelCall<T>(
  wireModel: string,
  run: () => PromiseLike<T>,
  execution: ReturnType<typeof modelExecutionTelemetry> | null = modelExecutionTelemetry(currentModelExecution()),
): Promise<T> {
  markBillingUpstream("started");
  const actor = context.getStore();
  if (!dbEnabled || !actor) return await run();
  const operationId = currentImageOperationId() || actor.id || "";
  const start = Date.now();
  let state = "failed",
    responseModel = "",
    inputTokens: number | null = null,
    outputTokens: number | null = null;
  try {
    const result = await run();
    const response = result as ObservedResponse;
    // A streaming SDK response is accepted; its final outcome/tokens are not known here.
    state =
      result instanceof Response
        ? result.ok
          ? "response-received"
          : result.status < 500
            ? "rejected"
            : "unknown-result"
        : result && typeof result === "object" && Symbol.asyncIterator in result
          ? "stream-opened"
          : "succeeded";
    responseModel =
      typeof response?.model === "string" ? response.model.slice(0, 200) : "";
    inputTokens = token(response?.usage?.prompt_tokens);
    outputTokens = token(response?.usage?.completion_tokens);
    markBillingUpstream(state==="succeeded"?"succeeded":state==="rejected"?"rejected":"unknown");
    return result;
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    state =
      status === 400 ||
      status === 401 ||
      status === 403 ||
      status === 404 ||
      status === 422 ||
      status === 429
        ? "rejected"
        : "unknown-result";
    markBillingUpstream(state==="rejected"?"rejected":"unknown");
    throw error;
  } finally {
    await recordBiModelCompletion({ email: actor.email, operation: actor.operation, operationId, model: wireModel, responseModel, state, durationMs: Date.now() - start, inputTokens, outputTokens, execution });
  }
}

/** No request/response bodies, prompts, URLs, authorization or keys are persisted. */
export function observeOpenAI<T extends OpenAI>(client: T): T {
  for (const [resource, key] of [
    [client.images, "generate"],
    [client.images, "edit"],
    [client.chat.completions, "create"],
  ] as const) {
    const object = resource as unknown as Record<
      string,
      (...args: unknown[]) => PromiseLike<unknown>
    >;
    const original = object[key].bind(resource);
    object[key] = (...args: unknown[]) => {
      const body = args[0] as { model?: unknown; messages?: { content?: unknown }[] };
      const vision = body?.messages?.some(m => Array.isArray(m.content) && m.content.some(part => part?.type === "image_url" || part?.type === "input_image"));
      const scope = isManagedModelClient(client) ? currentModelExecution(key === "create" ? vision ? "vision" : "text" : "image") : null;
      return observeModelCall(
        scope?.connection.wireModel || (typeof body?.model === "string" ? body.model : "unrecorded"),
        () => original(...args),
        modelExecutionTelemetry(scope) || null,
      );
    };
  }
  return client;
}
