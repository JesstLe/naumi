import { Agent } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  type ImageContent,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
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
import { recordBiModelCompletion } from "@/lib/bi/model-observer";
import {agentBillingPrecheck} from "@/lib/billing/agent";
import type {BillingQuote} from "@/lib/billing/types";
import {fingerprint} from "@/lib/billing/fingerprint";

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
const VISION_MODEL_RE =
  /(gpt-(4o|4\.1|4\.5|4-turbo|5)|chatgpt-4o|\bo[134]($|-)|claude|gemini|qwen.{0,8}vl|qvq|glm-\d(\.\d+)?v|doubao.{0,10}vision|grok-[45]|pixtral|deepseek-vl|llava|-vision|moonshot.{0,6}vision|kimi.{0,6}vision)/i;
const VISION_REJECT_RE =
  /image|vision|multimodal|多模态|图片|image_url|content[_ ]?type|modalit/i;
const visionRejectedModels = new Set<string>();

export function agentVisionEnabled(modelId: string): boolean {
  const forced = (process.env.AGENT_VISION || "").trim();
  if (forced === "1") return true;
  if (forced === "0") return false;
  if (visionRejectedModels.has(modelId)) return false;
  return VISION_MODEL_RE.test(modelId);
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
  agent: Agent;
  modelId: string;
  id: string;
  email: string;
  title: string;
  /** 凭证对(cookie+authorization),会话续期时刷新 */
  cred: { cookie: string; authorization: string; imageQuality?: string };
  createdAt: number;
  lastUsedAt: number;
  /** 运行状态快照,给前端轮询/SSE 用 */
  events: {
    type: string;
    at: number;
    data: Record<string, unknown>;
  }[];
  running: boolean;
  pendingQuotes?: Map<string,Pick<BillingQuote,"configVersion"|"requestedCredits">>;
  preparedBilling?: {billingVersion:number;billingCredits:number;billingOperationId:string};
  repeatSignature: string;
  repeatCount: number;
  /**
   * 流式输出回调:assistant 文本增量(text_delta)不进 events 数组
   * (deltas 会冲垮 400 条事件上限并打乱轮询游标),由路由注册本回调直写 SSE。
   */
  onDelta?: (text: string) => void;
};

const SESSIONS = new Map<string, Session>();
const providerModels = new Map<string, ReturnType<typeof createModels>>();

function gcSessions() {
  const now = Date.now();
  SESSIONS.forEach((s, k) => {
    if (!s.running && now - s.lastUsedAt > SESSION_TTL) SESSIONS.delete(k);
  });
}

async function ensureModels(modelId = MODEL_ID) {
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

export async function getOrCreateSession(
  email: string,
  sessionId: string,
  history: { role: string; content: string }[],
  cred: { cookie: string; authorization: string; imageQuality?: string } = { cookie: "", authorization: "" },
  modelId = MODEL_ID
): Promise<Session> {
  gcSessions();
  const existing = SESSIONS.get(key(email, sessionId));
  if (existing && (existing.running || existing.modelId === modelId)) {
    existing.lastUsedAt = Date.now();
    // 凭证刷新:token/会话可能已轮换,常驻实例必须用最新凭证
    existing.cred = cred;
    return existing;
  }

  if (existing) SESSIONS.delete(key(email, sessionId));
  const models = await ensureModels(modelId);
  const model = models.getModel("naumi-relay", modelId);
  if (!model) throw new Error("模型不可用");

  const persisted = dbEnabled
    ? await getAgentSession(email, sessionId).catch(() => null)
    : null;
  const session: Session = {
    id: sessionId,
    modelId,
    email,
    title: persisted?.title || history[0]?.content.slice(0, 120) || "Agent 任务",
    cred,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    events: [],
    running: false,
    repeatSignature: "",
    repeatCount: 0,
    agent: null as unknown as Agent,
  };
  const agent = new Agent({
    initialState: {
      systemPrompt: AGENT_SYSTEM_PROMPT,
      model: model as Model<"openai-completions">,
      tools: createNaumiTools(
        new Request(process.env.INTERNAL_APP_ORIGIN || "http://127.0.0.1:3012/"),
        email,
        () => ({...session.cred,...session.preparedBilling}) // 可变引用:runtime 每次续期 cred 后工具即刻使用新凭证
      ),
      messages: toUserMessages(history),
    },
    streamFn: models.streamSimple.bind(models),
    toolExecution: "sequential",
    // 积分预检:工具执行前查余额,不足直接拦截(硬门禁,不靠提示词自觉)
    beforeToolCall: async ({ toolCall, args }) => {
      const signature = `${toolCall.name}:${stableJson(args)}`;
      if (signature === session.repeatSignature) session.repeatCount += 1;
      else {
        session.repeatSignature = signature;
        session.repeatCount = 1;
      }
      if (session.repeatCount >= 3) {
        return {
          block: true,
          reason:
            "检测到连续重复的同参数工具调用。请停止重复执行，检查已有结果并向用户说明下一步。",
          terminate: true,
        };
      }
      return agentBillingPrecheck(session,toolCall.name,args as Record<string,unknown>,toolCall.id);
    },
  });

  let modelStartedAt = 0;
  agent.subscribe(async (event) => {
    if (event.type === "message_start" && event.message.role === "assistant") modelStartedAt = Date.now();
    const push = (type: string, data: Record<string, unknown>) => {
      session.events.push({ type, at: Date.now(), data });
      if (session.events.length > 400) session.events.splice(0, 200);
    };
    if (event.type === "tool_execution_start") {
      const e = event as unknown as { toolCallId: string; toolName?: string };
      push("tool_start", { id: e.toolCallId, tool: e.toolName ?? "" });
    } else if (event.type === "tool_execution_end") {
      const e = event as unknown as {
        toolCallId: string;
        toolName?: string;
        result?: { content?: unknown[]; isError?: boolean };
      };
      // 轨迹对外只暴露公开摘要:details.publicSummary 优先(不含内部全文)
      const details = (e.result as { details?: { publicSummary?: string } } | undefined)
        ?.details;
      push("tool_end", {
        id: e.toolCallId,
        tool: e.toolName ?? "",
        summary:
          details?.publicSummary ||
          (e.result?.isError
            ? "工具执行失败，请查看安全错误提示"
            : "工具执行完成"),
        isError: !!e.result?.isError,
      });
      void persistAgentSession(session);
    } else if (event.type === "message_update") {
      // 流式:text_delta 实时推给订阅了 onDelta 的路由(无订阅者时忽略)
      const e = event as unknown as {
        assistantMessageEvent?: { type?: string; delta?: string };
      };
      const delta = e.assistantMessageEvent;
      if (delta?.type === "text_delta" && delta.delta && session.onDelta) {
        session.onDelta(delta.delta);
      }
    } else if (event.type === "message_end") {
      const e = event as unknown as { message: { role: string; content: unknown[] } };
      if (e.message?.role === "assistant") {
        const message = event.message as {model?: string; responseModel?: string; stopReason?: string; usage?: {input?: number; output?: number}};
        if (message.model) void recordBiModelCompletion({
          email, operation: "agent", operationId: sessionId,
          model: message.model, responseModel: message.responseModel,
          state: message.stopReason === "error" ? "agent-error" : message.stopReason === "aborted" ? "agent-aborted" : message.stopReason === "deferred" ? "agent-deferred" : "agent-completed",
          durationMs: modelStartedAt ? Date.now() - modelStartedAt : 0,
          inputTokens: message.usage?.input, outputTokens: message.usage?.output,
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
        void persistAgentSession(session);
      }
    } else if (event.type === "agent_start") {
      session.running = true;
      push("agent_start", {});
    } else if (event.type === "agent_end") {
      session.running = false;
      session.lastUsedAt = Date.now();
      push("agent_end", {});
      void persistAgentSession(session);
    }
  });

  session.agent = agent;
  SESSIONS.set(key(email, sessionId), session);
  return session;
}

export function key(email: string, sessionId: string) {
  return `${email}::${sessionId}`;
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
  if (session.running) return "running";
  SESSIONS.delete(sessionKey);
  return "removed";
}

export function refreshSessionCredentials(
  session: Session,
  request: Request
): void {
  session.cred = {
    cookie: request.headers.get("cookie") ?? "",
    authorization: request.headers.get("authorization") ?? "",
  };
  session.lastUsedAt = Date.now();
}

export function appendSessionEvent(
  session: Session,
  type: string,
  data: Record<string, unknown>
) {
  session.events.push({ type, at: Date.now(), data });
  if (session.events.length > 400) session.events.splice(0, 200);
}

export async function persistAgentSession(session: Session): Promise<void> {
  if (!dbEnabled || session.id.startsWith("tmp-")) return;
  const messages = session.agent.state.messages.flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const content = Array.isArray(message.content)
      ? (message.content as { type?: string; text?: string }[])
          .map((part) => (part.type === "text" ? part.text ?? "" : ""))
          .join("")
          .trim()
      : "";
    return content ? [{ role: message.role, content }] : [];
  });
  const steps = session.events
    .filter((event) => event.type === "plan" || event.type === "tool_end")
    .map((event) => ({ type: event.type, ...event.data }));
  await saveAgentSession(
    session.email,
    session.id,
    session.title,
    messages,
    steps
  ).catch(() => undefined);
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
      const res = await fetch(u.toString(), {
        redirect: "error",
        headers: sameOrigin && cookie ? { cookie } : {},
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const mime = (res.headers.get("content-type") || "").split(";")[0];
      if (!/^image\/(png|jpe?g|webp)$/i.test(mime)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
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
