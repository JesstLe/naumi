import { agentToolLabel, agentToolSummary } from "../canvas/agent-activity";
import { agentMediaUrl } from "./media-policy";
import { readPublicToolDetails, type PublicToolDetails } from "./tool-presentation";
import { freezeCreationSettings } from "./creation-settings";
import type { WorkbenchMessage } from "./workbench-contract";

export type WorkbenchStep = {
  id?: string; tool: string; summary: string;
  kind?: "tool" | "skill" | "plan";
  status?: "running" | "done" | "error" | "stopped";
  details?: PublicToolDetails;
  progress?: { completed: number; total: number };
  outputs?: string[];
};
export type WorkbenchEvent = Record<string, unknown> & { type?: string; turnId?: string };
export function reduceWorkbenchActivity(previous: WorkbenchStep[], type: string, data: WorkbenchEvent): WorkbenchStep[] {
  if (!type && typeof data.tool === "string" && typeof data.summary === "string") type = "tool_end";
  // Legacy automatic quality reviews and internal harness/model bookkeeping are
  // not user-facing tools. No raw thinking stream is projected here.
  if (data.tool === "verify_image_output") return previous;
  if (type === "image_skill") return [...previous.filter(step => step.id !== `skill:${data.id}`), { id: `skill:${data.id}`, tool: "技能", summary: typeof data.name === "string" ? data.name : "创意技能", kind: "skill", status: "done" }];
  if (type === "plan") return [...previous.filter(step => step.id !== "plan"), { id: "plan", tool: "任务计划", summary: Array.isArray(data.items) ? data.items.filter(item => typeof item === "string").join(" → ") : "", kind: "plan", status: "done" }];
  if (!["tool_start", "tool_end"].includes(type) || typeof data.tool !== "string" || !data.tool) return previous;
  const id = typeof data.id === "string" ? data.id : previous.findLast(step => step.tool === data.tool && step.status === "running")?.id || `legacy:${previous.length}`;
  const index = previous.findIndex(step => step.id === id), old = index >= 0 ? previous[index] : undefined;
  if (old?.status === "done" && type === "tool_start") return previous;
  const rawProgress = data.progress as { completed?: unknown; total?: unknown } | undefined;
  const progress = rawProgress && Number.isInteger(rawProgress.completed) && Number.isInteger(rawProgress.total) && Number(rawProgress.total) > 0 && Number(rawProgress.completed) >= 0 && Number(rawProgress.completed) <= Number(rawProgress.total)
    ? { completed: Number(rawProgress.completed), total: Number(rawProgress.total) } : old?.progress;
  const step: WorkbenchStep = { ...old, id, tool: data.tool, kind: "tool", status: type === "tool_start" ? "running" : data.isError === true ? "error" : "done", summary: agentToolSummary(data.summary) || old?.summary || "", details: readPublicToolDetails(data.details) || old?.details, progress,
    outputs: Array.isArray(data.outputs) ? [...new Set(data.outputs.filter((url): url is string => typeof url === "string" && !!agentMediaUrl(url)))] : old?.outputs };
  return index < 0 ? [...previous, step] : previous.map((value, at) => at === index ? step : value);
}
export function workbenchStepLabel(step: WorkbenchStep) { return step.kind === "skill" ? `已加载技能：${step.summary}` : step.kind === "plan" ? "任务安排" : agentToolLabel(step.tool); }

export function restoreWorkbenchMessages(raw: WorkbenchMessage[], events: WorkbenchEvent[]): WorkbenchMessage[] {
  const messages: WorkbenchMessage[] = raw.map(message => {
    let snapshot;try{if(message.creationSettings)snapshot=freezeCreationSettings(message.creationSettings);}catch{/* invalid metadata is not an execution input */}
    return {role:message.role==="assistant"?"assistant":"user",content:message.content,creationSettings:snapshot,agentModel:typeof message.agentModel==="string"?message.agentModel:undefined,turnId:typeof message.turnId==="string"?message.turnId:undefined};
  });
  const turns = new Map<string, { events: WorkbenchEvent[]; index?: number; text?: string }>();
  for (const event of events) {
    const id = typeof event.turnId === "string" ? event.turnId : "legacy";
    const group = turns.get(id) || { events: [] };
    group.events.push(event);
    if (event.type === "turn_settings" && Number.isInteger(event.userIndex)) group.index = Number(event.userIndex);
    if (event.type === "assistant" && typeof event.text === "string" && event.text.trim()) group.text = event.text;
    turns.set(id, group);
  }
  const users = messages.flatMap((message, index) => message.role === "user" ? [index] : []);
  for (const [turnId, group] of turns) {
    let start = group.index === undefined ? -1 : users[group.index] ?? -1;
    let end = start < 0 ? -1 : (users[group.index! + 1] ?? messages.length) - 1;
    if (end < 0 && group.text) end = messages.findLastIndex(message => message.role === "assistant" && message.content === group.text);
    if (end < 0 && turnId === "legacy") end = messages.findLastIndex(message => message.role === "assistant");
    if (end < 0) continue;
    while (end >= 0 && messages[end]?.role !== "assistant") end--;
    if (end < 0) continue;
    const steps = group.events.reduce((items, event) => reduceWorkbenchActivity(items, event.type || "", event), [] as WorkbenchStep[]);
    const settings = group.events.find(event => event.type === "turn_settings");
    let snapshot; try { if (settings) snapshot = freezeCreationSettings(settings.settings); } catch { /* old invalid metadata is not execution input */ }
    messages[end] = { ...messages[end], steps, turnId, creationSettings: snapshot||messages[end].creationSettings, agentModel: typeof settings?.modelId === "string" ? settings.modelId : messages[end].agentModel };
    if (start >= 0) messages[start] = { ...messages[start], turnId, creationSettings: snapshot||messages[start].creationSettings, agentModel: messages[end].agentModel };
  }
  return messages;
}
