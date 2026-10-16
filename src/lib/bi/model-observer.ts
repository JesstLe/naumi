import "server-only";
import { withObservedCallId } from "./call-scope";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import { dbEnabled, getPool } from "@/lib/db";
import { resolveUserEmail } from "@/lib/admin-auth";
import { currentImageOperationId } from "@/lib/image-gateway";
import { ensureBiSchema } from "./repository";
import {markBillingUpstream, recordBillingUsage, currentSynchronousBilling} from "@/lib/billing/synchronous";
import { withArtworkCreation } from "@/lib/artwork-provenance-context";
import { provenanceEntry } from "@/lib/artwork-provenance";
import { withModelRequest } from "@/lib/model-config/requests";
import { ModelConfigError } from "@/lib/model-config/types";
import { currentModelExecution, type ModelExecutionScope } from "@/lib/model-config/context";
import { isManagedModelClient } from "@/lib/model-config/clients";

export function modelExecutionTelemetry(scope: ModelExecutionScope | null | undefined) {
  return scope ? { frontendModel: scope.frontendModel, publicModelId: scope.frozen.publicModelId, providerId: scope.connection.providerId, modelVersion: scope.frozen.modelVersion, billingVersion: scope.frozen.billingVersion, digest: scope.frozen.routerDigest || scope.frozen.modelDigest } : undefined;
}

type Context = { email: string; operation: string; id?: string };
const context = new AsyncLocalStorage<Context>();
export const currentBiOperationId = () => context.getStore()?.id;
export const currentBiContext = () => context.getStore();
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
  const path = new URL(request.url).pathname.slice(0, 100);
  try { return await context.run({ email, operation: path }, () => withArtworkCreation({ path, operationId: currentSynchronousBilling()?.id, entry: provenanceEntry(request.headers.get("x-naumi-client-entry"), path.startsWith("/api/canvas/") ? "canvas" : "toolbox") }, () => withModelRequest(request, run))); }
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
  id?: string;
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
      `INSERT INTO app_bi_model_calls(id,email,operation,operation_id,wire_model,response_model,state,duration_ms,input_tokens,output_tokens,public_model_id,provider_id,model_version,billing_version,config_digest,frontend_model_id,frontend_model_label) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        input.id || randomUUID(),
        input.email,
        input.operation,
        input.operationId,
        input.model.slice(0, 200),
        (input.responseModel || "").slice(0, 200),
        input.state,
        Math.max(0, Math.min(2147483647, input.durationMs)),
        token(input.inputTokens),
        token(input.outputTokens),
        input.execution?.publicModelId || "", input.execution?.providerId || "", input.execution?.modelVersion || null, input.execution?.billingVersion || null, input.execution?.digest || "", input.execution?.frontendModel?.id || "", input.execution?.frontendModel?.label || "",
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
  usageOptions?: { imageInput: boolean },
): Promise<T> {
  markBillingUpstream("started");
  const actor = context.getStore();
  const operationId = currentSynchronousBilling()?.id || actor?.id || currentImageOperationId() || "";
  const callId = randomUUID();
  const start = Date.now();
  let state = "failed",
    responseModel = "",
    inputTokens: number | null = null,
    outputTokens: number | null = null;
  try {
    const result = await withObservedCallId(callId, run);
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
    if (state === "succeeded" && usageOptions) recordBillingUsage(response?.usage, usageOptions.imageInput);
    markBillingUpstream(state==="succeeded"?"succeeded":state==="rejected"?"rejected":"unknown");
    if (state === "stream-opened") {
      const source = result as AsyncIterable<any>;
      const wrapped = Object.create(result as object);
      wrapped[Symbol.asyncIterator] = async function* () {
        let usage: ObservedResponse["usage"], model = "", completed = false, broken = false;
        try {
          for await (const chunk of source) {
            if (chunk?.usage) usage = chunk.usage;
            if (typeof chunk?.model === "string") model = chunk.model.slice(0, 200);
            yield chunk;
          }
          completed = true;
          if (usageOptions) recordBillingUsage(usage, usageOptions.imageInput);
        } catch (error) { broken = true; throw error; }
        finally {
          if (actor && dbEnabled) try {
            await getPool().query("UPDATE app_bi_model_calls SET response_model=$2,state=$3,input_tokens=$4,output_tokens=$5,duration_ms=$6 WHERE id=$1 AND email=$7", [callId,model,completed ? "stream-completed" : broken ? "stream-error" : "stream-cancelled",token(usage?.prompt_tokens),token(usage?.completion_tokens),Math.max(0,Math.min(2147483647,Date.now()-start)),actor.email]);
          } catch { /* Telemetry never changes streamed output or retries paid work. */ }
        }
      };
      return wrapped as T;
    }
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
    if (actor) await recordBiModelCompletion({ id: callId, email: actor.email, operation: actor.operation, operationId, model: wireModel, responseModel, state, durationMs: Date.now() - start, inputTokens, outputTokens, execution });
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
        key === "create" ? { imageInput: !!vision } : undefined,
      );
    };
  }
  return client;
}
