import { agentToolLabel, agentToolSummary } from "./agent-activity";
import { agentRestrictionMessage } from "../agent/public-status";
import type { AgentOrbStep } from "./agent-orb";
import { readPublicToolDetails } from "../agent/tool-presentation";

export type AgentProgressEvent = { type: string; id?: unknown; tool?: unknown; kind?: unknown; code?: unknown; message?: unknown; summary?: unknown; isError?: unknown; at?: unknown; details?: unknown; toolCallId?: unknown; artifacts?: unknown };

export function toolDuration(step: AgentOrbStep, busy: boolean, now: number): number | undefined {
  if (!step.startedAt || (!step.endedAt && (!busy || step.attention))) return;
  const end = step.endedAt || now;
  return end >= step.startedAt ? end - step.startedAt : undefined;
}

/** The live stream and restored history use exactly the same public explanations. */
export function reduceAgentProgress(steps: AgentOrbStep[], event: AgentProgressEvent, english = false, _running = true): AgentOrbStep[] {
  if (event.type === "artifacts") {
    if (typeof event.toolCallId !== "string" || !Array.isArray(event.artifacts)) return steps;
    const ids = event.artifacts.flatMap(value => value && typeof value === "object" && "id" in value && typeof value.id === "string" ? [value.id] : []);
    return steps.map(step => step.id === event.toolCallId ? { ...step, resultIds: [...new Set([...(step.resultIds || []), ...ids])] } : step);
  }
  const at = typeof event.at === "number" && Number.isFinite(event.at) && event.at > 0 && event.at <= 8640000000000000 ? event.at : undefined;
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
  if (event.type === "tool_start" && previous?.endedAt) return steps;
  const next: AgentOrbStep = { ...previous, id: id || tool, tool, label: agentToolLabel(tool, english), status: event.type === "tool_start" ? "running" : event.isError ? "error" : "done", attention,
    startedAt: previous?.startedAt || (event.type === "tool_start" ? at : undefined),
    endedAt: event.type === "tool_end" ? at || previous?.endedAt : previous?.endedAt,
    details: readPublicToolDetails(event.details) || previous?.details,
    summary: attention ? previous?.summary : agentToolSummary(event.summary) || (event.type === "tool_end" && event.isError ? previous?.summary || (english ? "Tool execution did not complete. Check history before retrying." : "工具执行未完成，请先在历史中核对已有结果。") : undefined) };
  return found < 0 ? [...steps, next] : steps.map((step, index) => index === found ? next : step);
}
