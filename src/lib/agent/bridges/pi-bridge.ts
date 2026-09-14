import { Agent } from "@earendil-works/pi-agent-core";
import {
  createModels,
  createProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { UserMessage } from "@earendil-works/pi-ai";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import {
  NotSupportedError,
  type AgentBridge,
  type AgentSession,
  type HubAgentEvent,
  type NaumiToolDef,
} from "../bridge-types";

// ---------------------------------------------------------------------------
// PiBridge —— @earendil-works/pi-agent-core 底座桥接实现。
//
// 职责:
//   1. 业务 NaumiToolDef → pi-agent AgentTool 适配(工具业务逻辑零改动);
//   2. 驱动 Agent 循环(prompt → 工具 → 循环);
//   3. 抹平事件差异:tool_start/tool_end/assistant/agent_end 统一事件协议;
//   4. 透传 steering(agent.steer)与 abort(agent.abort);
//   5. 积分预检经 beforeToolCall 注入(block+terminate)。
//
// 会话快照(session.events/running/cred)是桥接内部状态,对外只暴露
// AgentSession 契约方法。
// ---------------------------------------------------------------------------

const MODEL_ID = process.env.AGENT_MODEL || "gpt-5.6-luna";
const MODEL_API = "openai-completions" as const;

type PiAgentEvent = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  result?: {
    content?: unknown[];
    isError?: boolean;
    details?: { publicSummary?: string };
  };
  message?: { role?: string; content?: unknown[] };
};

export class PiBridge implements AgentBridge {
  readonly name = "pi-agent";
  private models: ReturnType<typeof createModels> | null = null;

  private async ensureModels() {
    if (this.models) return this.models;
    const baseUrl = (await getOpenAIBaseUrl()) || "https://api.openai.com/v1";
    const provider = createProvider({
      id: "naumi-relay",
      name: "Naumi Relay",
      baseUrl,
      auth: {
        apiKey: {
          name: "Naumi relay key",
          resolve: async () => {
            // 动态解析:DB 配置即时生效(env 兜底)
            const cur = await getOpenAISettings();
            const key = cur.apiKey || process.env.OPENAI_API_KEY || "";
            if (!key) throw new Error("模型接口未配置 API Key");
            return { auth: { apiKey: key } };
          },
        },
      },
      models: [
        {
          id: MODEL_ID,
          name: MODEL_ID,
          api: MODEL_API,
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
    this.models = createModels();
    this.models.setProvider(provider);
    return this.models;
  }

  async createSession(opts: {
    sessionId: string;
    systemPrompt: string;
    tools: NaumiToolDef[];
    history: { role: string; content: string }[];
    beforeToolCall?: (
      toolName: string,
      args: Record<string, unknown>
    ) => Promise<string | undefined>;
    email: string;
    getCred: () => { cookie: string; authorization: string };
  }) /* RET-TYPE */ {
    const models = await this.ensureModels();
    const model = models.getModel("naumi-relay", MODEL_ID) as Model<typeof MODEL_API>;

    const agent = new Agent({
      initialState: {
        systemPrompt: opts.systemPrompt,
        model,
        // 业务工具经 naumi-tools 工厂产出,已是 pi-agent AgentTool 形态
        tools: opts.tools as never,
        messages: opts.history.map(
          (m): UserMessage => ({
            role: "user",
            content:
              m.role === "assistant"
                ? `[ previous assistant reply ] ${m.content}`
                : m.content,
            timestamp: Date.now(),
          })
        ),
      },
      streamFn: models.streamSimple.bind(models),
      toolExecution: "sequential",
      beforeToolCall: async (context: unknown) => {
        if (!opts.beforeToolCall) return undefined;
        const tc = (
          context as {
            toolCall?: { name?: string; arguments?: Record<string, unknown> };
          }
        ).toolCall;
        if (!tc) return undefined;
        const reason = await opts.beforeToolCall(
          tc.name || "",
          tc.arguments ?? {}
        );
        if (reason) return { block: true, reason, terminate: true };
        return undefined;
      },
    });

    let running = false;
    let lastReplyText = "";
    const events: { type: HubAgentEvent["type"]; data: Record<string, unknown> }[] = [];
    let cursor = 0;

    agent.subscribe(async (event) => {
      const e = event as unknown as PiAgentEvent;
      if (e.type === "agent_start") {
        running = true;
        events.push({ type: "agent_start", data: {} });
      } else if (e.type === "tool_execution_start") {
        events.push({
          type: "tool_start",
          data: { id: e.toolCallId, tool: e.toolName ?? "" },
        });
      } else if (e.type === "tool_execution_end") {
        const details = e.result?.details as
          | { publicSummary?: string }
          | undefined;
        const ok = !e.result?.isError;
        // 轨迹脱敏:只对外暴露公开摘要,严禁内部全文/提示词
        events.push({
          type: "tool_end",
          data: {
            id: e.toolCallId,
            tool: e.toolName ?? "",
            summary:
              details?.publicSummary ||
              (ok ? "工具执行完成" : "工具执行失败，请查看安全错误提示"),
            isError: !ok,
          },
        });
      } else if (e.type === "message_end" && e.message?.role === "assistant") {
        const text = (e.message.content || [])
          .map((c) => {
            const rec = c as Record<string, unknown>;
            return rec.type === "text" ? String(rec.text ?? "") : "";
          })
          .join("")
          .trim();
        if (text) {
          lastReplyText = text;
          events.push({ type: "assistant", data: { text } });
        }
      } else if (e.type === "agent_end") {
        running = false;
        events.push({ type: "agent_end", data: {} });
      }
    });

    const session = {
      sessionId: opts.sessionId,
      isRunning: () => running,
      async run(message: string, onEvent: (e: HubAgentEvent) => void) {
        running = true;
        cursor = 0;
        const forward = setInterval(() => {
          for (; cursor < events.length; cursor++) {
            const e = events[cursor];
            onEvent({ type: e.type, data: e.data });
          }
        }, 300);
        try {
          await agent.prompt(message);
        } finally {
          clearInterval(forward);
          running = false;
        }
        for (; cursor < events.length; cursor++) {
          const e = events[cursor];
          onEvent({ type: e.type, data: e.data });
        }
        onEvent({ type: "agent_end", data: {} });
        return { reply: lastReplyText };
      },
      async steer(message) {
        if (!running) throw new NotSupportedError("当前没有运行中的任务");
        agent.steer({
          role: "user",
          content: `[用户插话] ${message}`,
          timestamp: Date.now(),
        });
      },
      async abort() {
        agent.abort();
        running = false;
      },
      lastReply: () => lastReplyText,
      turns: () => agent.state.messages.length,
    } satisfies AgentSession;
    return session;
  }
}
