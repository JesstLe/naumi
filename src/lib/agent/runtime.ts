
import { agentRestrictionMessage } from "./public-status";
import { publicToolDetails } from "./tool-presentation";
import { FeatureAccessError, assertAgentToolAccess } from "@/lib/feature-access/server";
import type { Agent } from "@earendil-works/pi-agent-core";
import { currentModelExecution, currentExecutionBundle } from "@/lib/model-config/context";
import { signAcceptedModelContext } from "@/lib/model-config/accepted-context";
import { withFrozenExecutionBundle } from "@/lib/model-config/execution";
import { configuredPiModels } from "@/lib/model-config/pi";
import { supplierCostFetch } from "@/lib/supplier-cost/collect";
import { legacyAgentVision } from "@/lib/model-config/legacy-vision";
import type { ImageContent, AssistantMessage, Model, createModels } from "@earendil-works/pi-ai";
import type { UserMessage } from "@earendil-works/pi-ai";
import {
  dbEnabled,
  getAgentSession,
  getUser,
  creditMeteringEnabled,
  saveAgentSession,
} from "@/lib/db";
import { AGENT_SYSTEM_PROMPT, createNaumiTools } from "@/lib/agent/naumi-tools";
import { getImageJob } from "@/lib/image-job-repository";
import { recordBiModelCompletion, modelExecutionTelemetry } from "@/lib/bi/model-observer";
import {agentBillingPrecheck} from "@/lib/billing/agent";
import type {BillingQuote} from "@/lib/billing/types";
import {fingerprint} from "@/lib/billing/fingerprint";
import type { CanvasAgentContext } from "./canvas-context";
import { buildAgentSystemPrompt, latestUserText, pelicanPromptSection } from "./response-policy";
import { imageSkillPrompt, type ImageSkill } from "@/lib/image-skills/catalog";
import { readPelicanArtifact } from "./pelican-artifact";
import { AgentHarness, HarnessError, PublicOutputBuffer, explicitQuoteConsent, untrustedAgentData, validateHarnessHistory } from "./harness";
import { assertMediaUrl, publicImageBytes, readBoundedBytes } from "./harness-network";
import { describeNaumiTools } from "./naumi-tools";
import { releaseProcessRegistry } from "@/lib/release-runtime/identity";
import { startAgentActivity, endAgentActivity, type AgentActivity } from "@/lib/release-runtime/agent-activity";
import { withAcceptedExecution } from "@/lib/release-runtime/accepted-context";
import { accountKey, releaseIdentity } from "@/lib/release-runtime/identity";

// ---------------------------------------------------------------------------
// Naumi Agent 运行时:常驻 Agent 会话管理器。
//   - 每个 (email, sessionId) 一个常驻 Agent 实例,支持多轮 + steering 插话
//   - POST /api/agent/stream = SSE 事件流(实时进度)
//   - POST /api/agent/steer  = 向运行中的会话插话
//   - POST /api/agent/stop   = 中止运行中的会话
//   - 积分预检:beforeToolCall 按工具单价查余额,不足直接拦截
// 工具计费/鉴权仍由各站内 API 自行完成,这里只做"提前告知"级别的预检。
// ---------------------------------------------------------------------------

const MODEL_ID = process.env.AGENT_MODEL || "qwen3.8-flash";
const MAX_TURNS = 24;
const SESSION_TTL = 60 * 60 * 1000; // 空闲会话 1 小时后回收
// 大额计费确认闸:单次工具调用预计 ≥ 此积分时,第一次调用被拦截,
// 模型须先向用户报价,用户同意后带 confirm=true 重调(见 beforeToolCall)。


/** 视觉输入能力判定(默认自动):
 *  - AGENT_VISION=1 或 0 强制开或关(兜底,处理特殊中转站);
 *  - 否则按模型 id 家族正则识别(gpt-4o、gpt-5 系列、claude、gemini、qwen-vl 等天然多模态);
 *  - 运行时发图被 API 拒绝的模型记入证伪表,后续自动降级纯文本。
 *  误报是安全的:API 收了图但模型没真用时,消息里的「[商品图] url」文本行仍可走工具兜底。 */
const VISION_REJECT_RE =
  /image|vision|multimodal|多模态|图片|image_url|content[_ ]?type|modalit/i;
const visionRejectedModels = new Set<string>();

export function agentVisionEnabled(modelId: string): boolean {
  const scope = currentModelExecution("text") || currentModelExecution("vision");
  if (scope) return scope.capabilities.vision;
  const forced = (process.env.AGENT_VISION || "").trim();
  if (forced === "1") return true;
  if (forced === "0") return false;
  if (visionRejectedModels.has(modelId)) return false;
  return legacyAgentVision(modelId);
}

/** 发图后报错时调用:错误特征像"不接受图片输入"则记入证伪表并返回 true。 */
export function markVisionUnsupported(
  modelId: string,
  err: unknown
): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (!VISION_REJECT_RE.test(msg)) return false;
  visionRejectedModels.add(modelId);
  return true;
}

// 各工具的预估单价(积分),与站内 API 实际扣费保持一致(粗粒度预检用)。
export type Session = {
  releaseActivity?: AgentActivity;
  harness: AgentHarness;
  userConfirmedQuote?: boolean;
  lastPendingQuoteKey?: string;
  pendingQuoteExpires?: Map<string,number>;
  modelExecutionStamp?: string;
  agent: Agent;
  modelId: string;
  id: string;
  email: string;
  title: string;
  /** 凭证对(cookie+authorization),会话续期时刷新 */
  cred: { cookie: string; authorization: string; imageQuality?: string; canvas?: CanvasAgentContext;imageSkill?:Pick<ImageSkill,"id"|"revision"> };
  contextStamp?: string;
  onToolResult?: (result: unknown, tool: string, toolCallId: string) => Promise<void>;
  toolResultsPending?: Promise<void>;
  persistPending?: Promise<void>;
  turnId?: string;
  pendingQuoteTurns?: Map<string,string>;
  createdAt: number;
  lastUsedAt: number;
  /** 运行状态快照,给前端轮询/SSE 用 */
  events: {
    type: string;
    at: number;
    data: Record<string, unknown>;
  }[];
  running: boolean;
  canvasExecuting?: boolean;
  pendingQuotes?: Map<string,Pick<BillingQuote,"configVersion"|"requestedCredits">>;
  preparedBilling?: {billingVersion:number;billingCredits:number;billingOperationId:string};
  preparedImagegen?:import("../imagegen/types").ImagegenPlan;
  preparedVideoWorkflow?:import("../video/canvas-workflow").PreparedCanvasVideoWorkflow;
  repeatSignature: string;
  repeatCount: number;
  /**
   * 流式输出回调:assistant 文本增量(text_delta)不进 events 数组
   * (deltas 会冲垮 400 条事件上限并打乱轮询游标),由路由注册本回调直写 SSE。
   */
  onDelta?: (text: string) => void;
};

const SESSIONS = releaseProcessRegistry().sessions as Map<string, Session>;
const CREATING = releaseProcessRegistry().creating as Map<string, Promise<Session>>;
const providerModels = new Map<string, ReturnType<typeof createModels>>();

function gcSessions() {
  const now = Date.now();
  SESSIONS.forEach((s, k) => {
    if (!s.running && !s.canvasExecuting && now - s.lastUsedAt > SESSION_TTL) SESSIONS.delete(k);
  });
}

async function ensureModels(modelId = MODEL_ID) {
  const [{ createModels, createProvider }, { openAICompletionsApi }] = await Promise.all([import("@earendil-works/pi-ai"), import("@earendil-works/pi-ai/api/openai-completions.lazy")]);
  // 真实凭证来源:DB 配置(getOpenAISettings/getOpenAIBaseUrl,AES 落库)优先,
  // env 兜底。用闭包 auth 把实际 key/baseUrl 注入 pi-ai,而不是只读 env。
  const settings = await import("@/lib/settings").then((m) =>
    m.getOpenAISettings()
  );
  const baseUrl =
    process.env.AGENT_BASE_URL ||
    (await import("@/lib/openai-base").then((m) => m.getOpenAIBaseUrl())) ||
    "https://api.openai.com/v1";
  const cacheKey = `${baseUrl}\n${modelId}\n${agentVisionEnabled(modelId) ? "v" : "t"}`;
  const cached = providerModels.get(cacheKey);
  if (cached) return cached;
  const dbKey = settings.apiKey;
  const provider = createProvider({
    id: "naumi-relay",
    name: "Naumi Relay",
    baseUrl,
    auth: {
      apiKey: {
        name: "Naumi relay key",
        resolve: async () => {
          // 每次流式调用时动态解析:DB 配置变更即时生效,无需重启
          const cur = await import("@/lib/settings").then((m) =>
            m.getOpenAISettings()
          );
          const key =
            process.env.AGENT_API_KEY ||
            cur.apiKey ||
            process.env.OPENAI_API_KEY ||
            "";
          if (!key) throw new Error("模型接口未配置 API Key");
          return { auth: { apiKey: key } };
        },
      },
    },
    models: [
      {
        id: modelId,
        name: modelId,
        api: "openai-completions" as const,
        provider: "naumi-relay",
        baseUrl,
        reasoning: false,
        input: (agentVisionEnabled(modelId)
          ? ["text", "image"]
          : ["text"]) as ("text" | "image")[],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 16384,
      },
    ],
    api: openAICompletionsApi(),
  });
  const models = createModels();
  models.setProvider(provider);
  providerModels.set(cacheKey, models);
  void dbKey;
  return models;
}

/** 把用户历史转成 pi-agent 的 UserMessage 序列。 */
export function toUserMessages(
  history: { role: string; content: string }[]
): UserMessage[] {
  return history.map(
    (m): UserMessage => ({
      role: "user",
      content:
        m.role === "assistant"
          ? `[ previous assistant reply ] ${m.content}`
          : m.content,
      timestamp: Date.now(),
    })
  );
}

function conversationMessages(history: {role:string;content:string}[], modelId:string): (UserMessage|AssistantMessage)[] {
  return history.map(message => message.role === "assistant" ? {
    role:"assistant",content:[{type:"text",text:message.content}],api:"openai-completions",provider:"naumi-relay",model:modelId,
    usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:Date.now(),
  } : {role:"user",content:message.content,timestamp:Date.now()});
}

/** 鹈鹕主题命中时把站内成品代码补挂进系统提示词。在 prompt 入口调用：
 *  会话创建时新消息尚未到达（history 不含本次消息），只能在此时机按消息内容注入。幂等。 */
export function primeAgentSystemPrompt(session: Session, message: string) {
  const section = pelicanPromptSection(message);
  if (!section) return;
  const current = session.agent.state.systemPrompt;
  if (current.includes(readPelicanArtifact())) return;
  session.agent.state.systemPrompt = `${current}\n${section}`;
}

export async function getOrCreateSession(
  ...args: Parameters<typeof createRuntimeSession>
): Promise<Session> {
  const sessionKey=key(args[0].trim().toLowerCase(),args[1]);
  const pending=CREATING.get(sessionKey);if(pending)return pending;
  const promise=createRuntimeSession(...args);CREATING.set(sessionKey,promise);
  try{return await promise;}finally{if(CREATING.get(sessionKey)===promise)CREATING.delete(sessionKey);}
}

async function createRuntimeSession(
  email: string,
  sessionId: string,
  history: { role: string; content: string }[],
  cred: { cookie: string; authorization: string; imageQuality?: string } = { cookie: "", authorization: "" },
  modelId = MODEL_ID,
  options?: { systemPrompt: string; canvas: CanvasAgentContext; onToolResult: (result: unknown, tool: string, toolCallId: string) => Promise<void> },
  imageSkill?: ImageSkill | null
): Promise<Session> {
  email = email.trim().toLowerCase();
  validateHarnessHistory(history);
  gcSessions();
  const scope = currentModelExecution("text") || currentModelExecution("vision");
  const managed = scope ? await configuredPiModels(scope,{userEmail:email,feature:options ? 'canvas.assistant' : 'agent.text'}) : null;
  const contextStamp = JSON.stringify({ canvas: options?.canvas, billingVersion: currentExecutionBundle()?.billingVersion, imageSkill: imageSkill ? { id: imageSkill.id, revision: imageSkill.revision } : null });
  const existing = SESSIONS.get(key(email, sessionId));
  if (existing && (existing.running || existing.canvasExecuting || existing.modelId === modelId && existing.modelExecutionStamp === managed?.stamp && existing.contextStamp === contextStamp)) {
    existing.lastUsedAt = Date.now();
    // 凭证刷新:token/会话可能已轮换,常驻实例必须用最新凭证
    if (!existing.running && !existing.canvasExecuting) existing.cred = { ...cred, canvas: options?.canvas,imageSkill:imageSkill?{id:imageSkill.id,revision:imageSkill.revision}:undefined };
    if (!existing.running && !existing.canvasExecuting) existing.onToolResult = options?.onToolResult;
    return existing;
  }

  // A skill/context switch must rebuild the prompt from the latest persisted history.
  await existing?.persistPending;
  if (existing) SESSIONS.delete(key(email, sessionId));
  const models = managed?.models || await ensureModels(modelId);
  const model = models.getModel("naumi-relay", managed?.wireModel || modelId);
  if (!model) throw new Error("模型不可用");

  const persisted = dbEnabled
    ? await getAgentSession(email, sessionId)
    : null;
  const savedHistory = Array.isArray(persisted?.messages) ? persisted.messages.filter((turn:any)=>["user","assistant"].includes(turn?.role)&&typeof turn?.content==="string").map((turn:any)=>({role:String(turn.role),content:String(turn.content)})) : history;
  const session: Session = {
    harness: new AgentHarness(email, sessionId, event => appendSessionEvent(session, "harness", event)),
    id: sessionId,
    modelId,
    modelExecutionStamp: managed?.stamp,
    email,
    title: persisted?.title || history[0]?.content.slice(0, 120) || "Agent 任务",
    cred: { ...cred, canvas: options?.canvas,imageSkill:imageSkill?{id:imageSkill.id,revision:imageSkill.revision}:undefined },
    contextStamp,
    onToolResult: options?.onToolResult,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    events: Array.isArray(persisted?.steps) ? persisted.steps.map((step: any) => ({type:String(step.type),at:typeof step.at === "number" && Number.isFinite(step.at) ? step.at : 0,data:Object.fromEntries(Object.entries(step).filter(([key])=>key!=="type" && key!=="at"))})) : [],
    running: false,
    repeatSignature: "",
    repeatCount: 0,
    agent: null as unknown as Agent,
  };
  const { Agent } = await import("@earendil-works/pi-agent-core");
  // Renew only the signature lifetime: every child call retains this session's accepted versions.
  const acceptedBundle = currentExecutionBundle();
  session.harness.registerSecret(cred.cookie); session.harness.registerSecret(cred.authorization);
  session.harness.registerSecret(scope?.connection.apiKey);
  const settings = await import("@/lib/settings").then(m => m.getOpenAISettings());
  session.harness.registerSecret(settings.apiKey);
  const tools = createNaumiTools(
    new Request(process.env.INTERNAL_APP_ORIGIN || "http://127.0.0.1:3012/"), email,
    () => ({...session.cred,...session.preparedBilling,imagegenPlan:session.preparedImagegen,videoWorkflow:session.preparedVideoWorkflow}),
    acceptedBundle ? () => signAcceptedModelContext(email, acceptedBundle) : undefined,
    options?.canvas, session.harness,
  );
  session.harness.configure(describeNaumiTools(tools));
  const agent = new Agent({
    initialState: {
      systemPrompt: buildAgentSystemPrompt(AGENT_SYSTEM_PROMPT, "", latestUserText({ messages: savedHistory })),
      model: model as Model<"openai-completions">,
      tools,
      messages: conversationMessages(savedHistory,managed?.wireModel||modelId),
    },
    streamFn: (model, context, options) => { session.harness.requireActive(); return models.streamSimple(model, context, { ...options, fetch: managed?.fetch || supplierCostFetch(fetch,{providerId:'legacy-agent',baseUrl:model.baseUrl,protocol:'openai-chat',wireModel:model.id,actor:{userEmail:email,feature:'agent.text'}}), maxRetries: 0 }); },
    toolExecution: "sequential",
    transformContext: async messages => {
      // Personal workflows and artwork metadata stay outside the system role.
      const data = (options?.systemPrompt || "") + imageSkillPrompt(imageSkill || null);
      return data ? [{role:"user" as const,content:untrustedAgentData("canvas-and-skill",data),timestamp:Date.now()}, ...messages] : messages;
    },
    // 积分预检:工具执行前查余额,不足直接拦截(硬门禁,不靠提示词自觉)
    beforeToolCall: async ({ toolCall, args, context }) => {
      try { await assertAgentToolAccess(email, toolCall.name, options ? "canvas" : "workbench", new Request("http://internal", { headers: { cookie: session.cred.cookie, authorization: session.cred.authorization } })); session.harness.check(toolCall.name, args); }
      catch (error) {
        const failure = error instanceof HarnessError ? error : new HarnessError("ARGUMENT_INVALID");
        const code = error instanceof FeatureAccessError ? "FEATURE_ACCESS_DENIED" : failure.code;
        const message = agentRestrictionMessage(code) || failure.message;
        appendSessionEvent(session, "attention", {id:toolCall.id,kind:"restricted",tool:toolCall.name,message,code});
        return {block:true,terminate:true,reason:message};
      }
      const signature = `${toolCall.name}:${stableJson(args)}`;
      if (signature === session.repeatSignature) session.repeatCount += 1;
      else {
        session.repeatSignature = signature;
        session.repeatCount = 1;
      }
      if (session.repeatCount >= 3) {
        appendSessionEvent(session, "attention", { id: toolCall.id, kind: "restricted", tool: toolCall.name, message: "相同参数已连续调用多次，请先检查已有结果。", code: "REPLAY_BLOCKED" });
        return {
          block: true,
          reason:
            "检测到连续重复的同参数工具调用。请停止重复执行，检查已有结果并向用户说明下一步。",
          terminate: true,
        };
      }
      const precheck = () => agentBillingPrecheck(session,toolCall.name,args as Record<string,unknown>,toolCall.id);
      const result = session.harness.sanitize(await (acceptedBundle ? withFrozenExecutionBundle(acceptedBundle, precheck) : precheck()));
      // Typed presentation signal only; billing decisions and public reply stay intact.
      if (result && "attention" in result && result.attention) appendSessionEvent(session, "attention", { id: toolCall.id, kind: result.attention, tool: toolCall.name, message: result.reason });
      else if (!result?.block) {
        const pending = session.events.findLast(event => event.type === "attention");
        if (pending?.data.tool === toolCall.name && pending.data.kind !== "resolved") appendSessionEvent(session, "attention", { id: toolCall.id, kind: "resolved", tool: toolCall.name });
      }
      if (!result?.block) {
        try { session.harness.permit(toolCall.name, args, toolCall.id); }
        catch (error) { return {block:true,terminate:true,reason:error instanceof HarnessError ? error.message : "工具授权失败"}; }
      }
      return result;
    },
  });

  let modelStartedAt = 0;
  let publicOutput: PublicOutputBuffer | undefined;
  agent.subscribe(async (event) => {
    if (event.type === "message_start" && event.message.role === "assistant") {
      modelStartedAt = Date.now();
      publicOutput = new PublicOutputBuffer(session.harness, text => session.onDelta?.(text));
    }
    const push = (type: string, data: Record<string, unknown>) => {
      session.events.push({ type, at: Date.now(), data: session.harness.sanitize(data) });
      if (session.events.length > 400) session.events.splice(0, 200);
    };
    if (event.type === "tool_execution_start") {
      const e = event as unknown as { toolCallId: string; toolName?: string; args?: unknown };
      push("tool_start", { id: e.toolCallId, tool: e.toolName ?? "", details: publicToolDetails(e.toolName || "", e.args, session.cred.canvas) });
    } else if (event.type === "tool_execution_end") {
      const e = event as unknown as {
        toolCallId: string;
        toolName?: string;
        isError?: boolean;
        result?: { content?: unknown[]; isError?: boolean };
      };
      // 轨迹对外只暴露公开摘要:details.publicSummary 优先(不含内部全文)
      const details = (e.result as { details?: { publicSummary?: string; verificationStatus?: string } } | undefined)
        ?.details;
      const toolFailed = !!(e.isError || e.result?.isError || details?.verificationStatus === "unavailable");
      if (!toolFailed && session.onToolResult) {
        const pending = session.onToolResult(e.result, e.toolName || "", e.toolCallId);
        session.toolResultsPending = Promise.all([session.toolResultsPending || Promise.resolve(),pending]).then(()=>undefined);
        void session.toolResultsPending.catch(()=>undefined);
        try { await pending; }
        catch { push("error", { message: "工具结果已生成，画布挂载需要恢复；请勿重新生成" }); }
      }
      push("tool_end", {
        id: e.toolCallId,
        tool: e.toolName ?? "",
        summary:
          details?.publicSummary ||
          (toolFailed
            ? "工具执行失败，请查看安全错误提示"
            : "工具执行完成"),
        isError: toolFailed,
      });
      void persistAgentSession(session).catch(()=>undefined);
    } else if(event.type === "tool_execution_update") {
      const update=event as unknown as {toolCallId:string;toolName?:string;partialResult?:{details?:{publicSummary?:string;stage?:string}}};
      if(update.partialResult?.details?.publicSummary)push("tool_start",{id:update.toolCallId,tool:update.toolName||"",summary:update.partialResult.details.publicSummary,stage:update.partialResult.details.stage});
    } else if (event.type === "message_update") {
      // 流式:text_delta 实时推给订阅了 onDelta 的路由(无订阅者时忽略)
      const e = event as unknown as {
        assistantMessageEvent?: { type?: string; delta?: string };
      };
      const delta = e.assistantMessageEvent;
      if (delta?.type === "text_delta" && delta.delta && session.onDelta) {
        publicOutput?.push(delta.delta);
      }
    } else if (event.type === "message_end") {
      const e = event as unknown as { message: { role: string; content: unknown[] } };
      if (e.message?.role === "assistant") {
        publicOutput?.finish(); publicOutput = undefined;
        for (const part of e.message.content || []) {
          if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part) part.text = session.harness.publicText(String(part.text));
        }
        const message = event.message as {model?: string; provider?: string; responseModel?: string; stopReason?: string; usage?: {input?: number; output?: number}};
        if (message.model && message.provider !== "naumi-local") void recordBiModelCompletion({
          email, operation: "agent", operationId: sessionId,
          model: message.model, responseModel: message.responseModel,
          state: message.stopReason === "error" ? "agent-error" : message.stopReason === "aborted" ? "agent-aborted" : message.stopReason === "deferred" ? "agent-deferred" : "agent-completed",
          durationMs: modelStartedAt ? Date.now() - modelStartedAt : 0,
          inputTokens: message.usage?.input, outputTokens: message.usage?.output,
          execution: modelExecutionTelemetry(scope),
        });
        const text = (e.message.content || [])
          .map((c) => {
            if (typeof c === "object" && c !== null) {
              const rec = c as Record<string, unknown>;
              if (rec.type === "text") return String(rec.text ?? "");
            }
            return "";
          })
          .join("")
          .trim();
        if (text) push("assistant", { text });
        void persistAgentSession(session).catch(()=>undefined);
      }
    } else if (event.type === "agent_start") {
      session.running = true;
      push("agent_start", {});
    } else if (event.type === "agent_end") {
      session.running = false;
      session.lastUsedAt = Date.now();
      push("agent_end", {});
      void persistAgentSession(session).catch(()=>undefined);
    }
  });

  session.agent = agent;
  session.harness.protectPrompt(agent.state.systemPrompt);
  const originalPrompt = agent.prompt.bind(agent);
  const originalAbort = agent.abort.bind(agent);
  let promptGeneration = 0;
  agent.abort = () => { promptGeneration++; session.harness.stop(); originalAbort(); };
  let lastPromptTurn = "";
  agent.prompt = (async (input: unknown, images?: ImageContent[]) => {
    if (typeof input !== "string") throw new HarnessError("INPUT_INVALID");
    const pendingGeneration = promptGeneration;
    await assertAgentToolAccess(email, "get_balance", options ? "canvas" : "workbench", new Request("http://internal", { headers: { cookie: session.cred.cookie, authorization: session.cred.authorization } }));
    // Cancellation during async authorization must not restart an aborted turn.
    if (pendingGeneration !== promptGeneration) throw new HarnessError("RUN_INACTIVE", 409);
    session.releaseActivity = await startAgentActivity(email, sessionId, !!options);
    if (pendingGeneration !== promptGeneration) { await completeAgentReleaseActivity(session); throw new HarnessError("RUN_INACTIVE", 409); }
    try {
      session.userConfirmedQuote = explicitQuoteConsent(input) && !!session.lastPendingQuoteKey && !!session.pendingQuotes?.has(session.lastPendingQuoteKey);
      if (!session.turnId || session.turnId === lastPromptTurn) session.turnId = crypto.randomUUID();
      lastPromptTurn = session.turnId;
      session.harness.begin(input, originalAbort, session.userConfirmedQuote ? [session.lastPendingQuoteKey!] : []);
      session.harness.modelStep();
      agent.prepareNextTurn=()=>{session.harness.modelStep();return undefined;};
      const identity=releaseIdentity(),activity=session.releaseActivity;
      return await withAcceptedExecution(activity?{id:activity.id,account:accountKey(email),instanceId:identity.instanceId,bootId:identity.bootId}:undefined,()=>originalPrompt(session.harness.publicText(input,false), images));
    }
    finally {
      session.userConfirmedQuote = false; session.harness.finish();
      // Canvas holds accepted-work ownership through result attachment/billing,
      // not merely until the model's final token or the client disconnect.
      if (!session.canvasExecuting) await completeAgentReleaseActivity(session);
    }
  }) as typeof agent.prompt;
  SESSIONS.set(key(email, sessionId), session);
  return session;
}

export function key(email: string, sessionId: string) {
  return `${email.trim().toLowerCase()}::${sessionId}`;
}

export async function completeAgentReleaseActivity(session: Session): Promise<void> {
  const activity = session.releaseActivity;
  if (!activity) return;
  let persisted = false;
  try { await session.toolResultsPending; await persistAgentSession(session); persisted = true; }
  finally { await endAgentActivity(activity, persisted); session.releaseActivity = undefined; }
}

export function getSession(email: string, sessionId: string): Session | null {
  return SESSIONS.get(key(email, sessionId)) ?? null;
}

export function renameRuntimeSession(
  email: string,
  sessionId: string,
  title: string
): void {
  const session = getSession(email, sessionId);
  if (session) session.title = title;
}

export function removeRuntimeSession(
  email: string,
  sessionId: string
): "removed" | "running" | "missing" {
  const sessionKey = key(email, sessionId);
  const session = SESSIONS.get(sessionKey);
  if (!session) return "missing";
  if (session.running || session.canvasExecuting) return "running";
  SESSIONS.delete(sessionKey);
  return "removed";
}

export function refreshSessionCredentials(
  session: Session,
  request: Request
): void {
  session.cred = {
    ...session.cred,
    cookie: request.headers.get("cookie") ?? "",
    authorization: request.headers.get("authorization") ?? "",
  };
  session.harness.registerSecret(session.cred.cookie); session.harness.registerSecret(session.cred.authorization);
  session.lastUsedAt = Date.now();
}

export function appendSessionEvent(
  session: Session,
  type: string,
  data: Record<string, unknown>
) {
  session.events.push({ type, at: Date.now(), data: session.harness.sanitize(data) });
  if (session.events.length > 400) session.events.splice(0, 200);
}

export async function persistAgentSession(session: Session): Promise<void> {
  if (!dbEnabled || session.id.startsWith("tmp-")) return;
  session.persistPending = (session.persistPending || Promise.resolve()).catch(() => undefined).then(async () => {
  const messages = session.agent.state.messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const content = Array.isArray(message.content)
      ? (message.content as { type?: string; text?: string }[])
          .map((part) => (part.type === "text" ? part.text ?? "" : ""))
          .join("")
          .trim()
      : typeof message.content === "string" ? message.content : "";
    return content ? [{ role: message.role, content: session.harness.publicText(content, message.role === "assistant") }] : [];
  });
  const steps = session.events
    .filter((event) => ["harness","plan","tool_start","tool_end","attention","canvas_turn","image_skill","artifacts","video_nodes","text_nodes","agent_start","agent_end","canvas_terminal","error"].includes(event.type))
    .map((event) => ({ ...event.data, type: event.type, at: event.at }));
  await saveAgentSession(
    session.email,
    session.id,
    session.harness.publicText(session.title,false),
    messages,
    steps
  );
  });
  await session.persistPending;
}

// ── 视觉输入:用户随消息附带的图片 URL → 多模态 ImageContent ────────────────
// 白名单与 naumi-tools 的图片拉取一致(同源放行 + 公网图床白名单,禁内网/禁重定向)。
// 单张失败静默跳过:消息里仍有「[商品图] <url>」文本行,无视觉能力的模型走工具兜底。
const VISION_MAX_BYTES = 8 * 1024 * 1024;
const VISION_MAX_IMAGES = 6;
const VISION_ALLOWED_HOST_RE =
  /(^|\.)(imgdd\.cc|youmind\.com|cms-assets\.youmind\.com)$/i;

export async function resolveVisionImages(
  urls: string[],
  cookie = ""
): Promise<ImageContent[]> {
  const out: ImageContent[] = [];
  for (const raw of urls.slice(0, VISION_MAX_IMAGES)) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const internal = new URL(
        process.env.INTERNAL_APP_ORIGIN || "http://127.0.0.1:3012/"
      );
      const u = new URL(raw.trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const host = u.hostname;
      const sameOrigin = u.origin === internal.origin;
      const isPrivate =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        host.endsWith(".local") ||
        host.endsWith(".internal");
      if (!sameOrigin && (isPrivate || !VISION_ALLOWED_HOST_RE.test(host))) {
        continue;
      }
      assertMediaUrl(raw, internal.origin);
      if (!sameOrigin) {
        const remote = await publicImageBytes(u, VISION_ALLOWED_HOST_RE, VISION_MAX_BYTES, AbortSignal.timeout(15_000));
        out.push({ type:"image", data:remote.bytes.toString("base64"), mimeType:remote.contentType }); continue;
      }
      const res = await fetch(u.toString(), {
        redirect: "error",
        headers: sameOrigin && cookie ? { cookie } : {},
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const mime = (res.headers.get("content-type") || "").split(";")[0];
      if (!/^image\/(png|jpe?g|webp)$/i.test(mime)) continue;
      const buf = await readBoundedBytes(res, VISION_MAX_BYTES);
      if (!buf.length || buf.length > VISION_MAX_BYTES) continue;
      out.push({ type: "image", data: buf.toString("base64"), mimeType: mime });
    } catch {
      /* 单张失败跳过 */
    }
  }
  return out;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export { MAX_TURNS, MODEL_ID };
