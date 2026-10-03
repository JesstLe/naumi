import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type OpenAI from "openai";
import { dbEnabled, getPool } from "@/lib/db";
import { resolveUserEmail } from "@/lib/admin-auth";
import { currentImageOperationId } from "@/lib/image-gateway";
import { ensureBiSchema } from "./repository";
import {markBillingUpstream} from "@/lib/billing/synchronous";

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
export async function withBiRequest<T>(
  request: Request,
  run: () => Promise<T>,
) {
  const email = dbEnabled
    ? await resolveUserEmail(request).catch(() => null)
    : null;
  if (!email) return run();
  return context.run(
    { email, operation: new URL(request.url).pathname.slice(0, 100) },
    run,
  );
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
}) {
  if (!dbEnabled) return;
  try {
    await ensureBiSchema();
    await getPool().query(
      `INSERT INTO app_bi_model_calls(id,email,operation,operation_id,wire_model,response_model,state,duration_ms,input_tokens,output_tokens) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
      ],
    );
  } catch {
    /* Completed model telemetry cannot interrupt agent execution. */
  }
}
export async function observeModelCall<T>(
  wireModel: string,
  run: () => PromiseLike<T>,
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
    try {
      await ensureBiSchema();
      await getPool().query(
        `INSERT INTO app_bi_model_calls(id,email,operation,operation_id,wire_model,response_model,state,duration_ms,input_tokens,output_tokens) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          randomUUID(),
          actor.email,
          actor.operation,
          operationId,
          wireModel.slice(0, 200),
          responseModel,
          state,
          Math.min(2147483647, Date.now() - start),
          inputTokens,
          outputTokens,
        ],
      );
    } catch {
      /* Telemetry must never retry, fail or change billing for a paid operation. */
    }
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
      const body = args[0] as { model?: unknown };
      return observeModelCall(
        typeof body?.model === "string" ? body.model : "unrecorded",
        () => original(...args),
      );
    };
  }
  return client;
}
