import { reduceAgentProgress, type AgentProgressEvent } from "./agent-progress";
import type { AgentOrbStep } from "./agent-orb";

export type AssistantTimelineItem =
  | { type: "text"; id: string; text: string }
  | { type: "tool"; id: string; step: AgentOrbStep };
export type AssistantTimelineTurn = {
  id: string; role: "user" | "assistant"; content: string;
  artifacts?: { id: string; image: string; title: string }[];
  timeline?: AssistantTimelineItem[];
};
export type AssistantTimelineEvent = AgentProgressEvent & { text?: unknown; reply?: unknown; authoritative?: unknown };

/** Public text only. Tool completion changes its original row, never its position. */
export function reduceAssistantTimeline(items: AssistantTimelineItem[], event: AssistantTimelineEvent, english = false): AssistantTimelineItem[] {
  if (event.type === "delta") {
    if (typeof event.text !== "string" || !event.text) return items;
    const last = items.at(-1);
    return last?.type === "text"
      ? [...items.slice(0, -1), { ...last, text: last.text + event.text }]
      : [...items, { type: "text", id: `text:${items.length}`, text: event.text }];
  }
  if (event.type === "assistant") {
    if (typeof event.text !== "string" || !event.text.trim()) return items;
    const last = items.at(-1);
    return last?.type === "text" ? [...items.slice(0, -1), { ...last, text: event.text }] : [...items, { type: "text", id: `text:${items.length}`, text: event.text }];
  }
  if (event.type === "final") {
    if (typeof event.reply !== "string" || !event.reply.trim()) return items;
    // Quote/permission gates remain authoritative; do not revive earlier promises.
    const gated = event.authoritative === true || items.some(item => item.type === "tool" && !!item.step.attention);
    const base = gated ? items.filter(item => item.type === "tool") : items;
    const last = base.at(-1);
    return last?.type === "text"
      ? [...base.slice(0, -1), { ...last, text: event.reply }]
      : [...base, { type: "text", id: `text:${items.length}:final`, text: event.reply }];
  }
  const previous = items.flatMap(item => item.type === "tool" ? [item.step] : []);
  if (!["tool_start", "tool_end", "attention", "artifacts"].includes(event.type)) return items;
  const next = reduceAgentProgress(previous, event, english);
  if (next === previous) return items;
  const ids = new Set(previous.map(step => step.id));
  const byId = new Map(next.map(step => [step.id, step]));
  return [
    ...items.map(item => item.type === "tool" && byId.has(item.step.id) ? { ...item, step: byId.get(item.step.id)! } : item),
    ...next.filter(step => !ids.has(step.id)).map(step => ({ type: "tool" as const, id: `tool:${step.id}`, step })),
  ];
}

/** UI-only update; content and the frozen request/receipt remain separate contracts. */
export function updateAssistantTimeline<T extends AssistantTimelineTurn>(turns: T[], event: AssistantTimelineEvent, english = false): T[] {
  const index = turns.findLastIndex(turn => turn.role === "assistant");
  if (index < 0) return turns;
  return turns.map((turn, i) => i === index ? { ...turn, timeline: reduceAssistantTimeline(turn.timeline || [], event, english) } : turn);
}

type HistoryEvent = AssistantTimelineEvent & { messageIndex?: unknown; message?: unknown; turnId?: unknown };
/** Rebuild each canvas turn from existing public message-end events, not token logs. */
export function restoreAssistantTimeline<T extends AssistantTimelineTurn>(turns: T[], events: HistoryEvent[], english = false): T[] {
  const result: T[] = [];
  const contexts = events.flatMap((event, index) => event.type === "canvas_turn" ? [{ event, index }] : []);
  for (let index = 0; index < turns.length; index++) {
    const user = turns[index];
    if (user.role !== "user") { result.push(user); continue; }
    result.push(user);
    let end = index + 1;
    while (end < turns.length && turns[end].role === "assistant") end++;
    const replies = turns.slice(index + 1, end);
    const contextIndex = contexts.findIndex(({ event }) => Number.isInteger(event.messageIndex) ? event.messageIndex === index : event.message === user.content);
    if (contextIndex < 0) { result.push(...replies); index = end - 1; continue; }
    const context = contexts[contextIndex];
    const segment = events.slice(context.index + 1, contexts[contextIndex + 1]?.index);
    const hasTextEvents = segment.some(event => event.type === "assistant" || event.type === "canvas_reply");
    let timeline: AssistantTimelineItem[] = [];
    for (const event of segment) {
      if (event.type === "assistant") timeline = reduceAssistantTimeline(timeline, event, english);
      else if (event.type === "canvas_reply") timeline = reduceAssistantTimeline(timeline, { ...event, type: "final" }, english);
      else timeline = reduceAssistantTimeline(timeline, event, english);
    }
    if (!hasTextEvents) {
      // Old rows never stored text event positions. Keep their text intact; do not invent chronology.
      result.push(...replies);
      if (timeline.length) {
        const last = result.at(-1);
        if (last?.role === "assistant") result[result.length - 1] = { ...last, timeline: [...timeline, { type: "text", id: "legacy-text", text: last.content }] };
        else result.push({ id: `${user.id}:activity`, role: "assistant", content: "", timeline } as T);
      }
    } else {
      const last = replies.at(-1);
      const artifacts = [...new Map(replies.flatMap(reply => reply.artifacts || []).map(art => [art.id, art])).values()];
      result.push({ ...(last || { id: `${user.id}:activity`, role: "assistant" as const }), content: last?.content || "", artifacts, timeline } as T);
    }
    index = end - 1;
  }
  return result;
}
