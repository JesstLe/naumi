import { Agent } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { UserMessage } from "@earendil-works/pi-ai";
import {
  dbEnabled,
  getAgentSession,
  getUser,
  saveAgentSession,
} from "@/lib/db";
import { AGENT_SYSTEM_PROMPT, createNaumiTools } from "@/lib/agent/naumi-tools";
import { packaging3dCost, POINTS_PER_IMAGE } from "@/lib/mock-data";

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

// 各工具的预估单价(积分),与站内 API 实际扣费保持一致(粗粒度预检用)。
const TOOL_COST: Record<string, { cost: number; label: string }> = {
  generate_image: { cost: POINTS_PER_IMAGE, label: "AI 生图" },
  retouch_product: { cost: POINTS_PER_IMAGE, label: "商品精修" },
  recolor_product: { cost: POINTS_PER_IMAGE, label: "产品换色" },
  replicate_hot: { cost: POINTS_PER_IMAGE, label: "爆款复刻" },
  generate_suite: { cost: 13 * POINTS_PER_IMAGE, label: "一键套图" },
  continue_aplus_generation: { cost: 4 * POINTS_PER_IMAGE, label: "A+ 详情页" },
  generate_packaging_3d: { cost: 9, label: "模切线转 3D" },
};

export type Session = {
  agent: Agent;
  modelId: string;
  id: string;
  email: string;
  title: string;
  /** 凭证对(cookie+authorization),会话续期时刷新 */
  cred: { cookie: string; authorization: string };
  createdAt: number;
  lastUsedAt: number;
  /** 运行状态快照,给前端轮询/SSE 用 */
  events: {
    type: string;
    at: number;
    data: Record<string, unknown>;
  }[];
  running: boolean;
  repeatSignature: string;
  repeatCount: number;
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
  const cacheKey = `${baseUrl}\n${modelId}`;
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
        input: ["text"] as ("text" | "image")[],
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
  cred: { cookie: string; authorization: string } = { cookie: "", authorization: "" },
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
        () => session.cred // 可变引用:runtime 每次续期 cred 后工具即刻使用新凭证
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
      const baseMeta = TOOL_COST[toolCall.name];
      const meta =
        toolCall.name === "generate_packaging_3d"
          ? {
              cost: packaging3dCost(
                typeof (args as { resolution?: unknown })?.resolution === "string"
                  ? (args as { resolution: string }).resolution
                  : "1K"
              ),
              label: baseMeta?.label ?? "模切线转 3D",
            }
          : toolCall.name === "generate_suite"
            ? {
                cost:
                  (args as { structure?: unknown })?.structure === "custom" &&
                  Array.isArray((args as { shots?: unknown }).shots)
                    ? Math.max(
                        1,
                        Math.min(
                          20,
                          (args as { shots: unknown[] }).shots.length
                        )
                      ) * POINTS_PER_IMAGE
                    : 13 * POINTS_PER_IMAGE,
                label: baseMeta?.label ?? "一键套图",
              }
            : baseMeta;
      if (!meta || !dbEnabled) return undefined;
      const u = await getUser(email).catch(() => null);
      const balance = u ? u.creditsTotal - u.creditsUsed : Number.MAX_SAFE_INTEGER;
      if (balance < meta.cost) {
        return {
          block: true,
          reason: `余额不足:「${meta.label}」需要约 ${meta.cost} 积分,当前余额 ${balance}。请先充值或减少任务规模。`,
          terminate: true,
        };
      }
      return undefined;
    },
  });

  agent.subscribe(async (event) => {
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
    } else if (event.type === "message_end") {
      const e = event as unknown as { message: { role: string; content: unknown[] } };
      if (e.message?.role === "assistant") {
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

export { MAX_TURNS };
