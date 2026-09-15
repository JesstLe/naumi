import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import {
  NotSupportedError,
  type AgentBridge,
  type AgentSession,
  type HubAgentEvent,
  type NaumiToolDef,
} from "../bridge-types";

// ---------------------------------------------------------------------------
// CodexBridge —— codex-cli 底座桥接实现(探针实测结论的落地)。
//
// 链路:业务 NaumiToolDef → 内部回调端点(/internal/agent-tool)
//      → MCP server 子进程(scripts/mcp-tool-host.mjs,stdio)
//      → codex exec --json(spawn,JSONL 事件流解析)
//
// 能力映射(探针报告 docs/agent.md):
//   非交互执行 ✅ exec --json | 会话恢复 ✅ resume | steering ❌(降级 abort)
//   计费预检 ✅ 在回调端点内做 | 沙箱 --approve-for-me(自动审批)
// ---------------------------------------------------------------------------

const CALLBACK_PORT = Number(process.env.CODexBridge_PORT || 0) || 3987;

type CodexJsonlEvent = {
  type: string;
  thread_id?: string;
  item?: {
    id?: string;
    type?: string;
    text?: string;
    server?: string;
    tool?: string;
  };
  usage?: Record<string, number>;
  error?: string;
};

export class CodexBridge implements AgentBridge {
  readonly name = "codex";
  /** 工具回调注册表:sessionId → (toolName,args) → 执行 */
  private callbacks = new Map<
    string,
    (name: string, args: Record<string, unknown>) => Promise<{ text: string; error?: string }>
  >();
  private runningSpecs = new Map<string, { tools: NaumiToolDef[] }>();

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
    const sid = opts.sessionId;
    this.runningSpecs.set(sid, { tools: opts.tools });

    // 工具回调:执行业务 NaumiToolDef(含预检)
    this.callbacks.set(sid, async (name, args) => {
      const tool = opts.tools.find((t) => t.name === name);
      if (!tool) return { text: "", error: `未知工具 ${name}` };
      if (opts.beforeToolCall) {
        const reason = await opts.beforeToolCall(name, args);
        if (reason) return { text: "", error: `已被拦截: ${reason}` };
      }
      try {
        const r = await tool.execute(args, { signal: new AbortController().signal });
        return { text: r.text };
      } catch (e) {
        return { text: "", error: e instanceof Error ? e.message : "工具执行失败" };
      }
    });

    let running = false;
    let lastReplyText = "";
    let threadId = "";

    const session: AgentSession = {
      sessionId: sid,
      isRunning: () => running,
      run: (message, onEvent) =>
        this.runCodex(sid, message, opts, (t) => (threadId = t), (r) => (lastReplyText = r), (_e: unknown) => {}, onEvent, (flag) => (running = flag)),
      steer: async () => {
        throw new NotSupportedError("codex exec 无插话;请停止后发起新指令");
      },
      abort: async () => {
        running = false;
        this.proc?.kill();
      },
      lastReply: () => lastReplyText,
      turns: () => (threadId ? 1 : 0),
    };
    return session;
  }

  private proc: ChildProcess | null = null;

  /** 单次 codex exec:起临时 MCP server(经回调路由)→ spawn codex → 收 JSONL */
  private async runCodex(
    sid: string,
    message: string,
    opts: {
      systemPrompt: string;
      history: { role: string; content: string }[];
    },
    onThreadId: (t: string) => void,
    onReply: (r: string) => void,
    _unused: unknown,
    onEvent: (e: HubAgentEvent) => void,
    setRunning: (f: boolean) => void
  ): Promise<{ reply: string }> {
    setRunning(true);
    onEvent({ type: "agent_start", data: {} });

    const spec = this.runningSpecs.get(sid);
    if (!spec) throw new Error("会话已失效");

    // MCP server spec(工具回调指向本进程的 HTTP 回调端点)
    const specJson = JSON.stringify({
      callbackPort: CALLBACK_PORT,
      tools: spec.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    });

    // spawn codex exec(通过 CODEX_MCP_config 挂临时 server 太重;
    // 实测结论:用 -c mcp_servers 全局注册 + spec 经 env 传给宿主)
    const hostPath = path.join(process.cwd(), "scripts", "mcp-tool-host.mjs");
    const historyCtx = opts.history.length
      ? `\n[历史对话摘要]\n${opts.history.map((h) => `${h.role === "assistant" ? "AI" : "用户"}: ${h.content.slice(0, 200)}`).join("\n").slice(0, 3000)}\n`
      : "";

    const args = [
      "exec",
      "--skip-git-repo-check",
      "--approve-for-me",
      "--json",
      "-c",
      `mcp_servers.naumi-tools.command="node"`,
      "-c",
      `mcp_servers.naumi-tools.args=["${hostPath.replace(/\\/g, "/")}"]`,
      "-c",
      `mcp_servers.naumi-tools.env={"NAUMI_TOOLS_SPEC":"__SPEC__"}`,
      `${opts.systemPrompt.slice(0, 1500)}\n${historyCtx}\n[用户指令] ${message}`,
    ];

    return new Promise((resolve) => {
      const proc = spawn("codex", args, {
        shell: true,
        env: {
          ...process.env,
          NAUMI_TOOLS_SPEC: specJson,
        },
      });
      this.proc = proc;

      let buf = "";
      let reply = "";
      let pendingTool = "";

      proc.stdout?.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim().startsWith("{")) continue;
          let ev: CodexJsonlEvent;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "thread.started" && ev.thread_id) {
            onThreadId(ev.thread_id);
          } else if (ev.type === "item.completed") {
            const it = ev.item || {};
            if (it.type === "mcp_tool_call") {
              onEvent({
                type: "tool_end",
                data: {
                  tool: it.tool || "",
                  summary: "codex 工具完成",
                },
              });
              pendingTool = "";
            } else if (it.type === "agent_message" && it.text) {
              reply = it.text;
              onEvent({ type: "assistant", data: { text: it.text } });
            }
          } else if (ev.type === "error") {
            onEvent({ type: "tool_end", data: { tool: "error", summary: ev.error || "", isError: true } });
          }
        }
      });

      proc.on("close", () => {
        setRunning(false);
        onReply(reply);
        onEvent({ type: "agent_end", data: {} });
        resolve({ reply });
      });
    });
  }

  /** 内部回调:MCP 宿主进程转发工具调用到这 */
  handleToolCall(sid: string, name: string, args: Record<string, unknown>) {
    const cb = this.callbacks.get(sid);
    if (!cb) return Promise.resolve({ text: "", error: "会话不存在" });
    return cb(name, args);
  }
}
