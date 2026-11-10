import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Agent } from "@earendil-works/pi-agent-core";

type StreamMessage = { stopReason?: string; rawStopReason?: string; errorMessage?: string; content?: unknown; usage?: { input?: number; output?: number } };
export type StreamDiagnostic = {
  stopReason: string;
  rawStopReason?: string;
  category: "complete" | "length" | "aborted" | "timeout" | "network" | "missing_finish_reason" | "provider";
  emittedChars: number;
  inputTokens?: number;
  outputTokens?: number;
};
const knownReasons = new Set(["stop", "length", "error", "aborted", "toolUse", "deferred", "tool_calls", "max_tokens", "max_output_tokens", "end_turn", "content_filter"]);
/** Persist only bounded enums/counts, never upstream bodies, URLs or credentials. */
export function streamDiagnostic(message: StreamMessage, emittedChars: number): StreamDiagnostic {
  const stopReason = knownReasons.has(message.stopReason || "") ? message.stopReason! : "unknown";
  const error = String(message.errorMessage || "");
  const category = stopReason === "length" ? "length" : stopReason === "aborted" ? "aborted"
    : stopReason !== "error" ? "complete" : /without finish_reason/i.test(error) ? "missing_finish_reason"
    : /timeout|timed out|超时/i.test(error) ? "timeout" : /fetch|network|econn|socket|connection/i.test(error) ? "network" : "provider";
  const count = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  return { stopReason, category, emittedChars: count(emittedChars) || 0,
    ...(knownReasons.has(message.rawStopReason || "") ? { rawStopReason: message.rawStopReason } : {}),
    inputTokens: count(message.usage?.input), outputTokens: count(message.usage?.output) };
}

export class AgentStreamInterruption extends Error {
  readonly code: "OUTPUT_LENGTH" | "STREAM_INTERRUPTED";
  constructor(readonly diagnostic: StreamDiagnostic, readonly partial: boolean) {
    super(partial ? diagnostic.category === "length" ? "本次回复已达输出上限，内容已保留" : "回复中断，内容已保留" : "模型未返回完整回复，请重试");
    this.name = "AgentStreamInterruption";
    this.code = diagnostic.category === "length" ? "OUTPUT_LENGTH" : "STREAM_INTERRUPTED";
  }
}

export function streamInterruption(message: StreamMessage | undefined, output = "") {
  if (!message || !["error", "length"].includes(message.stopReason || "")) return undefined;
  const text = Array.isArray(message.content) ? message.content.map(part => part?.type === "text" ? String(part.text || "") : "").join("") : output;
  return new AgentStreamInterruption(streamDiagnostic(message, text.length), !!text.trim());
}

/** Both transports derive completion from the same model and tool facts. */
export function agentTurnOutcome(message: StreamMessage | undefined, events: {type:string;data:Record<string,unknown>}[], output = "") {
  if (message?.stopReason === "aborted") throw new DOMException("任务已停止", "AbortError");
  const interruption = streamInterruption(message, output);
  if (interruption) throw interruption;
  const attention = events.findLast(event => event.type === "attention");
  const authoritative = attention?.data.kind === "waiting" || attention?.data.kind === "restricted";
  const modelReply = Array.isArray(message?.content) ? message.content.filter(part => part?.type === "text").map(part => String(part.text || "")).join("").trim() : output.trim();
  const reply = authoritative ? String(attention!.data.message || "当前操作受限，请调整任务后继续。") : modelReply;
  if (!reply || events.some(event => event.type === "error")) throw new Error("Agent 执行未完成，已产出的结果保留，请勿重复提交收费任务");
  return {reply, attention, authoritative};
}

export function recordAuthoritativeReply(agent: Agent, reply: string, last: AgentMessage | undefined) {
  const current = last?.role === "assistant" ? last.content.filter(part => part.type === "text").map(part => part.text).join("").trim() : "";
  if (current === reply) return;
  const messages = agent.state.messages.map(turn => turn === last && turn.role === "assistant" ? {...turn, content: turn.content.filter(part => part.type !== "text")} : turn);
  agent.state.messages = [...messages, {role:"assistant",api:agent.state.model?.api||"openai-completions",provider:"naumi-local",model:"naumi-local-reply",content:[{type:"text",text:reply}],stopReason:"stop",timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}}];
}

type Step = { type: string; turnId?: unknown; status?: unknown; canContinue?: unknown };
/** A one-turn capability: stale/repeated continuation requests never restart a task. */
export function continuationTurn(steps: Step[], messages: { role: string; content?: unknown }[]): string | undefined {
  const turn = steps.findLast(step => step.type === "canvas_turn");
  const terminal = steps.findLast(step => step.type === "canvas_terminal");
  const last = messages.at(-1);
  const text = typeof last?.content === "string" ? last.content : Array.isArray(last?.content) ? last.content.map(p => p?.type === "text" ? p.text : "").join("") : "";
  return terminal?.turnId === turn?.turnId && terminal?.status === "failed" && terminal.canContinue === true && last?.role === "assistant" && text.trim() && typeof turn?.turnId === "string" ? turn.turnId : undefined;
}

export const TEXT_CONTINUATION_PROMPT = "继续输出";

/** Project text-only context for this call; retain the original tool transcript afterwards. */
export async function withTextOnlyContinuation<T>(session: { agent: Agent; textOnlyContinuation?: boolean }, run: () => Promise<T>): Promise<T> {
  const { agent } = session, tools = agent.state.tools, messages = agent.state.messages, systemPrompt = agent.state.systemPrompt;
  const projected: AgentMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      projected.push({ ...message, content: typeof message.content === "string" ? message.content : message.content.filter(part => part.type === "text") });
    } else if (message.role === "assistant") {
      const content = message.content.filter(part => part.type === "text");
      if (content.length) projected.push({ ...message, content, stopReason: "stop", rawStopReason: undefined, errorMessage: undefined });
    }
  }
  session.textOnlyContinuation = true;
  agent.clearAllQueues();
  agent.state.tools = [];
  agent.state.messages = projected;
  agent.state.systemPrompt = systemPrompt + "\n本轮仅续写上一条中断回复的文字。工具全部关闭，禁止声称执行了新操作。";
  try { return await run(); }
  finally {
    const additions = agent.state.messages.slice(projected.length);
    agent.state.messages = [...messages, ...additions];
    agent.state.tools = tools;
    agent.state.systemPrompt = systemPrompt;
    session.textOnlyContinuation = false;
  }
}
