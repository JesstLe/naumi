import { currentModelExecution } from "@/lib/model-config/context";
import { configuredPiModels } from "@/lib/model-config/pi";
import { supplierCostFetch } from "@/lib/supplier-cost/collect";
import type { createModels, Model } from "@earendil-works/pi-ai";
import type { UserMessage } from "@earendil-works/pi-ai";
import { getOpenAISettings } from "@/lib/settings";
import { getOpenAIBaseUrl } from "@/lib/openai-base";
import { AgentHarness, HarnessError, untrustedAgentData, validateHarnessHistory } from "../harness";
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
  isError?: boolean;
  toolCallId?: string;
  toolName?: string;
  result?: {
    content?: unknown[];
    isError?: boolean;
    details?: { publicSummary?: string; verificationStatus?: string };
  };
  message?: { role?: string; content?: unknown[] };
};

export class PiBridge implements AgentBridge {
  readonly name = "pi-agent";
  private models: ReturnType<typeof createModels> | null = null;

  private async ensureModels() {
    if (this.models) return this.models;
    const [{ createModels, createProvider }, { openAICompletionsApi }] = await Promise.all([import("@earendil-works/pi-ai"), import("@earendil-works/pi-ai/api/openai-completions.lazy")]);
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
  }): Promise<AgentSession> {
    validateHarnessHistory(opts.history);
    const harness = new AgentHarness(opts.email, opts.sessionId);
    harness.configure(opts.tools.map(t => ({...t, write:t.write !== false})));
    harness.protectPrompt(opts.systemPrompt);
    const credentials = opts.getCred(); harness.registerSecret(credentials.cookie); harness.registerSecret(credentials.authorization);
    harness.registerSecret((await getOpenAISettings()).apiKey);
    const scope = currentModelExecution("text") || currentModelExecution("vision");
    harness.registerSecret(scope?.connection.apiKey);
    const managed = scope ? await configuredPiModels(scope,{userEmail:opts.email,feature:'agent.text'}) : null;
    const models = managed?.models || await this.ensureModels();
    const model = models.getModel("naumi-relay", managed?.wireModel || MODEL_ID) as Model<typeof MODEL_API>;

    const { Agent } = await import("@earendil-works/pi-agent-core");
    const agent = new Agent({
      initialState: {
        systemPrompt: opts.systemPrompt,
        model,
        // Bridge definitions are adapted into the same enforced execution boundary.
        tools: opts.tools.map(tool => ({
          name:tool.name,label:tool.name,description:tool.description,parameters:tool.parameters,
          execute:async (id:string,args:Record<string,unknown>,signal?:AbortSignal) => harness.execute(tool.name,args,id,signal,async owned => {
            const result = harness.sanitize(await tool.execute(args,{signal:owned}));
            return {content:[{type:"text" as const,text:untrustedAgentData("tool-result",result.text)}],details:{...result.data,publicSummary:result.publicSummary}};
          }),
        })) as never,
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
      streamFn: (model, context, options) => { harness.requireActive(); return models.streamSimple(model, context, { ...options, fetch: managed?.fetch || supplierCostFetch(fetch,{providerId:'legacy-agent',baseUrl:model.baseUrl,protocol:'openai-chat',wireModel:model.id,actor:{userEmail:opts.email,feature:'agent.text'}}), maxRetries: 0 }); },
      toolExecution: "sequential",
      prepareNextTurn: () => { harness.modelStep(); return undefined; },
      beforeToolCall: async (context: unknown) => {
        const tc = (
          context as {
            toolCall?: { name?: string; arguments?: Record<string, unknown> };
          }
        ).toolCall;
        if (!tc) return {block:true,terminate:true,reason:"工具请求无效"};
        const actual = context as {toolCall:{id:string;name:string};args:Record<string,unknown>};
        try { harness.check(actual.toolCall.name, actual.args); }
        catch(error) { return {block:true,terminate:true,reason:error instanceof HarnessError ? error.message : "工具校验失败"}; }
        if (!opts.beforeToolCall && opts.tools.find(t => t.name === tc.name)?.write !== false) return {block:true,terminate:true,reason:"写工具缺少计费授权检查"};
        const reason = await opts.beforeToolCall?.(
          tc.name || "",
          actual.args
        );
        if (reason) return { block: true, reason, terminate: true };
        harness.permit(actual.toolCall.name,actual.args,actual.toolCall.id);
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
          | { publicSummary?: string; verificationStatus?: string }
          | undefined;
        const ok = !e.isError && !e.result?.isError && details?.verificationStatus !== "unavailable";
        // 轨迹脱敏:只对外暴露公开摘要,严禁内部全文/提示词
        events.push({
          type: "tool_end",
          data: {
            id: e.toolCallId,
            tool: e.toolName ?? "",
            summary:
              (details?.publicSummary ? harness.publicText(details.publicSummary) : "") ||
              (ok ? "工具执行完成" : "工具执行失败，请查看安全错误提示"),
            isError: !ok,
          },
        });
      } else if (e.type === "message_end" && e.message?.role === "assistant") {
        const text = (e.message.content || [])
          .map((c) => {
            const rec = c as Record<string, unknown>;
            return rec.type === "text" ? harness.publicText(String(rec.text ?? "")) : "";
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

    const session: AgentSession & { isRunning(): boolean } = {
      sessionId: opts.sessionId,
      isRunning: () => running,
      async run(message: string, onEvent: (e: HubAgentEvent) => void) {
        if (running) throw new HarnessError("RUN_INACTIVE",409);
        harness.begin(message,()=>agent.abort());
        harness.modelStep();
        lastReplyText="";
        running = true;
        cursor = events.length;
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
          harness.finish();
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
        harness.stop();
        agent.abort();
        running = false;
      },
      lastReply: () => lastReplyText,
      turns: () => agent.state.messages.length,
    } satisfies AgentSession;
    return session;
  }
}
