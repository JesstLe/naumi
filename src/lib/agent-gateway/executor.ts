import "server-only";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Errors } from "typebox/value";
import { HarnessError, validateToolArguments } from "@/lib/agent/harness";
import { describeNaumiTools } from "@/lib/agent/naumi-tools";
import { resultMediaUrls } from "@/lib/agent/execution-evidence";
import { agentBillingPrecheck } from "@/lib/billing/agent";
import { getUser } from "@/lib/accounts/session";
import { withFrozenExecutionBundle } from "@/lib/model-config/execution";
import { startAccountWork, endAccountWork, type AccountWork } from "@/lib/release-runtime/account-work";
import { withAcceptedExecution } from "@/lib/release-runtime/accepted-context";
import { currentCreationContext, withFrozenCreation } from "@/lib/saas/creation-scope";
import { bindCreationParent, assertCreationFeature } from "@/lib/saas/creation-access";
import { startCreation, finishCreation, recordAgentToolEvidence } from "@/lib/saas/creation-writer";
import { enterpriseCreationRead } from "@/lib/enterprise/server";
import { TeamError } from "@/lib/teams/errors";
import { assertAgentToolAccess, FeatureAccessError } from "@/lib/feature-access/server";
import { allows, TOOL_ACCESS } from "@/lib/feature-access/catalog";
import { userFeaturePolicy } from "@/lib/feature-access/repository";
import { requireAdmin } from "@/lib/admin-auth";
import { GatewayError } from "./errors";
import { argumentsDigest, budgetState, existingCall, finishCall, reserveCall, type CallFailure, type CallOutput, type CallState, type CallView } from "./calls";
import { createGatewayToolSession, gatewayToolViews, internalCookie, type GatewayToolSession, type GatewayToolView } from "./tool-session";
import { normalizeMediaArguments, publicMediaUrl } from "./media";
import type { AgentToken } from "./tokens";

// Executes one remote tool call with the same guarantees as an in-app agent tool call:
// account + tenant feature access, strict arguments, server quote and frozen billing,
// release drain accounting, creation records, and per-token idempotency and budget.

export type GatewayCaller = { token: AgentToken; email: string; origin: string; origins: string[]; internalOrigin: string };
export type CallInput = { tool: string; arguments: Record<string, unknown>; operationId: string; request?: string };
export type CallEvent =
  | { type: "accepted"; operationId: string; tool: string; credits: number; replayed: boolean }
  | { type: "progress"; summary: string; stage?: string }
  | { type: "result"; call: CallView };

function sessionId(caller: GatewayCaller): string {
  const scope = currentCreationContext()?.tenantId;
  return `gw-${caller.token.id.replaceAll("-", "").slice(0, 16)}-${scope ? scope.replaceAll("-", "").slice(0, 16) : "personal"}`;
}

function toolSession(caller: GatewayCaller, request?: string): GatewayToolSession {
  return createGatewayToolSession({ email: caller.email, sessionId: sessionId(caller), internalOrigin: caller.internalOrigin, request });
}

/** Tools visible to this token, with the owner's current feature access. */
export async function listGatewayTools(caller: GatewayCaller): Promise<(GatewayToolView & { available: boolean })[]> {
  const { tools } = toolSession(caller);
  const admin = await requireAdmin(new Request(caller.internalOrigin, { headers: { cookie: internalCookie(caller.email) } }));
  const policy = admin ? null : await userFeaturePolicy(caller.email);
  return gatewayToolViews(tools)
    .filter(view => caller.token.scopes.includes("write") || !view.write)
    .map(view => ({ ...view, available: admin || (!!policy && allows(policy, "agent") && !!TOOL_ACCESS[view.name] && allows(policy, TOOL_ACCESS[view.name])) }));
}

/** Human/agent readable reasons, so a remote caller can fix its arguments without guessing. */
function argumentProblems(tool: AgentTool, args: Record<string, unknown>): string {
  const schema = tool.parameters as unknown as { properties?: Record<string, unknown> };
  const unknown = Object.keys(args).filter(key => !schema.properties || !(key in schema.properties)).map(key => `不支持的参数 ${key}`);
  let reported: string[] = [];
  try { reported = [...Errors(tool.parameters, args)].slice(0, 5).map(error => `${error.instancePath || "参数"} ${error.message}`); } catch { /* schema walk failed */ }
  return [...unknown, ...reported].slice(0, 6).join("；") || "格式不正确";
}

type Prepared = { session: GatewayToolSession; tool: AgentTool; args: Record<string, unknown>; write: boolean; timeoutMs: number };

async function prepare(caller: GatewayCaller, input: Pick<CallInput, "tool" | "arguments" | "request">): Promise<Prepared> {
  const session = toolSession(caller, input.request);
  const tool = session.tools.find(candidate => candidate.name === input.tool);
  if (!tool) throw new GatewayError("TOOL_NOT_FOUND", `没有这个工具：${input.tool}`, 404);
  const view = describeNaumiTools([tool])[0];
  if (view.write && !caller.token.scopes.includes("write")) throw new GatewayError("SCOPE_DENIED", "该令牌只有只读权限，不能执行创作工具", 403);
  const args = await normalizeMediaArguments(input.arguments, caller.email, caller.origins);
  try {
    await assertAgentToolAccess(caller.email, tool.name, "workbench", new Request(caller.internalOrigin, { headers: { cookie: session.billing.cred.cookie } }));
    const creation = currentCreationContext();
    if (creation?.tenantId) await enterpriseCreationRead(caller.email, creation.tenantId, async (_tx, scope) => assertCreationFeature((scope as { entitlement: { featurePolicy: Record<string, boolean> } }).entitlement.featurePolicy, "/api/agent", "POST", tool.name));
  } catch (error) {
    if (error instanceof FeatureAccessError || error instanceof TeamError) throw new GatewayError("FEATURE_DENIED", error.message || "此功能尚未授权", (error as { status?: number }).status === 401 ? 401 : 403);
    throw error;
  }
  try { validateToolArguments(tool.parameters, args); }
  catch { throw new GatewayError("ARGUMENT_INVALID", `参数不符合 ${tool.name} 的 schema：${argumentProblems(tool, args)}（naumi tools ${tool.name} 查看）`, 400); }
  return { session, tool, args, write: view.write, timeoutMs: view.timeoutMs };
}

/** Prepares the server quote exactly as the in-app agent does; nothing is submitted. */
async function serverQuote(prepared: Prepared, callId: string): Promise<number> {
  const { session, tool, args } = prepared;
  const precheck = () => agentBillingPrecheck(session.billing, tool.name, args, callId);
  const blocked = session.harness.sanitize(await (session.bundle ? withFrozenExecutionBundle(session.bundle, precheck) : precheck()));
  if (blocked?.block) {
    const reason = String(blocked.reason || "报价暂不可用");
    if ("code" in blocked && blocked.code === "ARGUMENT_INVALID") throw new GatewayError("ARGUMENT_INVALID", reason, 400);
    if ("code" in blocked && typeof blocked.code === "string") throw new GatewayError("QUOTE_UNAVAILABLE", reason, 422);
    if ("terminate" in blocked && blocked.terminate) throw new GatewayError("INSUFFICIENT_CREDITS", reason, 402);
    throw new GatewayError("QUOTE_UNAVAILABLE", reason, 422);
  }
  return session.billing.preparedBilling?.billingCredits ?? 0;
}

export async function quoteGatewayCall(caller: GatewayCaller, input: Pick<CallInput, "tool" | "arguments">) {
  const prepared = await prepare(caller, input);
  const budget = await budgetState(caller.token);
  const user = await getUser(caller.email);
  const balance = user ? user.creditsTotal - user.creditsUsed : null;
  let credits = 0, refusal: CallFailure | undefined;
  try { credits = await serverQuote(prepared, `quote-${Date.now()}`); }
  catch (error) { if (!(error instanceof GatewayError)) throw error; refusal = { code: error.code, message: error.message, submitted: false }; }
  if (!refusal && budget.remainingToday !== null && credits > budget.remainingToday) refusal = { code: "BUDGET_EXCEEDED", message: `超出令牌每日积分预算：报价 ${credits}，今日剩余 ${budget.remainingToday}`, submitted: false };
  return { tool: prepared.tool.name, billed: gatewayToolViews([prepared.tool])[0].billed, credits, balance, budget, allowed: !refusal, ...(refusal ? { refusal } : {}) };
}

// ── results ────────────────────────────────────────────────────────────────
const UNTRUSTED = /^\[UNTRUSTED_TOOL_RESULT\]\n([\s\S]*)\n\[\/UNTRUSTED_TOOL_RESULT\]$/;
function absolutize(value: unknown, origin: string, depth = 0): unknown {
  if (depth > 12) return null;
  if (typeof value === "string") return value.startsWith("/media/") ? origin + value : value.replace(/(?<![\w/:.-])\/media\/[\w./%-]+/g, path => origin + path);
  if (Array.isArray(value)) return value.map(item => absolutize(item, origin, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, absolutize(item, origin, depth + 1)]));
  return value;
}
function toOutput(result: unknown, origin: string): CallOutput {
  const raw = (result || {}) as { content?: { type?: string; text?: string }[]; details?: Record<string, unknown> };
  const text = (raw.content || []).filter(part => part.type === "text").map(part => {
    const wrapped = UNTRUSTED.exec(String(part.text || ""));
    if (!wrapped) return String(part.text || "");
    try { return String(JSON.parse(wrapped[1])); } catch { return wrapped[1]; }
  }).join("\n");
  return {
    text: absolutize(text, origin) as string,
    media: resultMediaUrls(result).map(url => publicMediaUrl(url, origin)),
    details: absolutize(raw.details || {}, origin) as Record<string, unknown>,
  };
}
/** Failures before a supplier could be reached are refusals (no charge); anything later stays unknown. */
function failure(error: unknown): { state: Exclude<CallState, "running" | "succeeded">; error: CallFailure } {
  const message = error instanceof Error ? error.message : "工具执行失败";
  if (error instanceof HarnessError) {
    const before = ["ARGUMENT_INVALID", "TOOL_DENIED", "REPLAY_BLOCKED", "INPUT_INVALID", "BACKEND_DISABLED"].includes(error.code);
    return { state: before ? "rejected" : "failed", error: { code: error.code === "RUN_INACTIVE" ? "TOOL_TIMEOUT" : error.code, message: before ? message : `${message}；收费任务结果以作品库与账单为准，不要重复提交`, submitted: before ? false : "unknown" } };
  }
  if (error instanceof FeatureAccessError) return { state: "rejected", error: { code: "FEATURE_DENIED", message, submitted: false } };
  const detail = error as { deterministic?: boolean; status?: number; code?: string };
  if (detail?.deterministic && typeof detail.status === "number" && detail.status >= 400 && detail.status < 500 && detail.status !== 409) {
    return { state: "rejected", error: { code: detail.status === 402 ? "INSUFFICIENT_CREDITS" : typeof detail.code === "string" ? detail.code : "TOOL_REJECTED", message, submitted: false } };
  }
  return { state: "failed", error: { code: typeof detail?.code === "string" ? detail.code : "TOOL_FAILED", message, submitted: "unknown" } };
}

async function runReserved(caller: GatewayCaller, prepared: Prepared, input: CallInput, work: AccountWork | undefined, emit: (event: CallEvent) => void) {
  const { session, tool, args } = prepared;
  const sid = sessionId(caller);
  const controller = new AbortController();
  session.harness.begin(`gateway:${tool.name}`, () => controller.abort());
  try {
    session.harness.permit(tool.name, args, input.operationId);
    const context = currentCreationContext();
    const creation = context ? await bindCreationParent({ ...context, requestText: input.request || context.requestText }, sid) : undefined;
    return await withFrozenCreation(creation, async () => {
      const creationId = await startCreation("agent-turn", `${sid}:${input.operationId}`, caller.email, { prompt: input.request || `Agent 接口：${tool.name}` });
      let outcome: { state: Exclude<CallState, "running">; output?: CallOutput; error?: CallFailure };
      try {
        const result = await withAcceptedExecution(work?.parent, () => tool.execute(input.operationId, args, controller.signal, update => {
          const details = (update as { details?: { publicSummary?: string; stage?: string } } | undefined)?.details;
          if (details?.publicSummary) emit({ type: "progress", summary: session.harness.publicText(String(details.publicSummary), false), ...(details.stage ? { stage: String(details.stage) } : {}) });
        }));
        outcome = { state: "succeeded", output: toOutput(result, caller.origin) };
      } catch (error) { outcome = failure(error); }
      const summary = outcome.error?.message || outcome.output?.text.slice(0, 300) || "工具执行完成";
      const saved = await recordAgentToolEvidence(creationId || undefined, caller.email, [{ id: input.operationId, tool: tool.name, isError: outcome.state !== "succeeded", summary: summary.slice(0, 300), code: outcome.error?.code, ...(outcome.state === "rejected" ? { submissionState: "not_submitted" } : {}) }]);
      await finishCreation(creationId || undefined, caller.email, !saved ? "needs_review" : outcome.state === "succeeded" ? "succeeded" : outcome.error?.submitted === "unknown" ? "needs_review" : "failed", { text: outcome.output?.text.slice(0, 2000), eventKey: `gateway:${input.operationId}:finished` });
      return outcome;
    });
  } finally { session.harness.finish(); }
}

export type StartedCall = { replay: CallView } | { operationId: string; credits: number; run: (emit: (event: CallEvent) => void) => Promise<CallView> };

/**
 * Validates, quotes and reserves a call. Every refusal throws here, before anything is submitted,
 * so the HTTP layer can answer with a plain status code. The returned `run` executes the reserved call.
 */
export async function beginGatewayCall(caller: GatewayCaller, input: CallInput): Promise<StartedCall> {
  const prepared = await prepare(caller, input);
  const digest = argumentsDigest(prepared.tool.name, prepared.args);
  const prior = await existingCall(caller.token, input.operationId, prepared.tool.name, digest);
  if (prior) return { replay: prior };
  const credits = await serverQuote(prepared, input.operationId);
  // Release admission first: a draining slot refuses before any budget is reserved. The call is
  // tracked as accepted work, so a blue-green drain waits for it instead of cutting it off.
  const work = await startAccountWork(caller.email, `agent-gateway:${prepared.tool.name}`);
  let reservation: Awaited<ReturnType<typeof reserveCall>>;
  try { reservation = await reserveCall(caller.token, { operationId: input.operationId, tool: prepared.tool.name, digest, credits, timeoutMs: prepared.timeoutMs }); }
  catch (error) { await endAccountWork(work, true).catch(() => undefined); throw error; }
  if ("replay" in reservation) { await endAccountWork(work, true).catch(() => undefined); return { replay: reservation.replay }; }
  return {
    operationId: input.operationId, credits,
    run: async emit => {
      // Only a reserved call whose outcome could not be recorded leaves the activity unknown.
      let recorded = false;
      try {
        let outcome: Awaited<ReturnType<typeof runReserved>>;
        try { outcome = await runReserved(caller, prepared, input, work, emit); }
        catch (error) { outcome = failure(error); }
        const call = await finishCall(caller.token, input.operationId, outcome);
        recorded = true;
        return call;
      } finally { await endAccountWork(work, recorded).catch(() => undefined); }
    },
  };
}
