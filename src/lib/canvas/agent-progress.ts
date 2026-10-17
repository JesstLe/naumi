import { agentToolLabel, agentToolSummary } from "./agent-activity";
import { agentRestrictionMessage } from "../agent/public-status";
import type { AgentOrbStep } from "./agent-orb";

export type AgentProgressEvent = { type: string; id?: unknown; tool?: unknown; kind?: unknown; code?: unknown; message?: unknown; summary?: unknown; isError?: unknown };

/** The live stream and restored history use exactly the same public explanations. */
export function reduceAgentProgress(steps: AgentOrbStep[], event: AgentProgressEvent, english = false, running = true): AgentOrbStep[] {
  let tool = typeof event.tool === "string" ? event.tool : "";
  const id = typeof event.id === "string" ? event.id : "";
  const found = id ? steps.findIndex(step => step.id === id) : steps.findLastIndex(step => step.tool === tool);
  tool ||= steps[found]?.tool || "";
  if (event.type === "attention") {
    if (event.kind === "resolved") return steps.map((step, index) => index === found ? { ...step, attention: undefined, summary: undefined } : step);
    if (event.kind !== "waiting" && event.kind !== "restricted") return steps;
    const summary = agentRestrictionMessage(event.code, english) || (typeof event.message === "string" ? event.message.trim().slice(0, 1200) : "") || (event.kind === "waiting" ? english ? "Confirm this tool's quote before continuing." : "请确认本次工具报价后继续。" : english ? "This tool call was not authorized." : "本次工具调用未获授权。" );
    const previous = steps[found];
    const next: AgentOrbStep = { ...previous, id: previous?.id || id || `attention:${tool}`, tool, label: previous?.label || agentToolLabel(tool, english), status: event.kind === "restricted" ? "error" : "running", attention: event.kind, summary };
    return found < 0 ? [...steps, next] : steps.map((step, index) => index === found ? next : step);
  }
  if (event.type !== "tool_start" && event.type !== "tool_end") return steps;
  const previous = steps[found];
  const attention = event.type === "tool_end" && event.isError ? previous?.attention : undefined;
  const next: AgentOrbStep = { id: id || tool, tool, label: agentToolLabel(tool, english), status: event.type === "tool_start" ? running ? "running" : "error" : event.isError ? "error" : "done", attention,
    summary: agentToolSummary(event.summary) || (event.type === "tool_end" && event.isError ? previous?.summary || (english ? "Tool execution did not complete. Check history before retrying." : "工具执行未完成，请先在历史中核对已有结果。") : undefined) };
  return found < 0 ? [...steps, next] : steps.map((step, index) => index === found ? next : step);
}
