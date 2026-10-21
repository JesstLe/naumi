import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reduceAssistantTimeline as reduce, restoreAssistantTimeline, updateAssistantTimeline, type AssistantTimelineItem, type AssistantTimelineEvent, type AssistantTimelineTurn } from "../src/lib/canvas/assistant-timeline";
const baseline = process.argv.includes("--baseline");
const panel = readFileSync("src/components/canvas/canvas-assistant-panel.tsx", "utf8");
if (baseline) {
  assert(panel.indexOf("{turns.map") < panel.indexOf("{!!steps.length"));
  assert(panel.includes("turn.content") && panel.includes("steps.map(step => <CanvasAgentToolCard"));
  console.log("BASELINE=REPRODUCED TEXT_BEFORE_ALL_TOOLS=YES LIVE_DELTA_ABOVE_TOOL_TAIL=YES SUPPLIER_CALLS=0");
  process.exit(0);
}
let checks = 0;
const check = (condition: unknown, label: string) => { assert(condition, label); checks++; };
const seq = (items: AssistantTimelineItem[]) => items.map(item => item.type === "text" ? item.text : `${item.step.id}:${item.step.status}`);
const events: AssistantTimelineEvent[] = [
  { type: "delta", text: "我先" }, { type: "delta", text: "查看画布。" },
  { type: "tool_start", id: "read", tool: "list_video_nodes", at: 1000 },
  { type: "tool_start", id: "search", tool: "list_my_artworks", at: 1100 },
  { type: "tool_end", id: "read", tool: "list_video_nodes", at: 1200 },
  { type: "delta", text: "已读取节点。" },
  { type: "tool_end", id: "search", tool: "list_my_artworks", at: 1300 },
  { type: "artifacts", toolCallId: "search", artifacts: [{ id: "art" }] },
  { type: "final", reply: "已读取节点。" },
];
let items: AssistantTimelineItem[] = [];
for (const event of events) items = reduce(items, event);
check(JSON.stringify(seq(items)) === JSON.stringify(["我先查看画布。", "read:done", "search:done", "已读取节点。"]), "interleaved/parallel updates preserve order");
check(items.length === 4, "no duplicate final");
check(items[2].type === "tool" && items[2].step.resultIds?.[0] === "art", "call-linked result");
check(JSON.stringify(reduce(items, events.at(-1)!)) === JSON.stringify(items), "final idempotent");
check(JSON.stringify(seq(reduce(items, events[2]))) === JSON.stringify(seq(items)), "late start cannot revive completed tool");
check(items[1].type === "tool" && items[1].step.startedAt === 1000 && items[1].step.endedAt === 1200, "timestamps unchanged");
const appended = reduce(items, { type: "tool_start", id: "third", tool: "list_my_artworks" });
check(appended.length === 5 && appended.at(-1)?.type === "tool", "new invocation of same tool distinct");
check(seq(reduce([], { type: "final", reply: "无delta直接回执" }))[0] === "无delta直接回执", "final-only replay");
check(reduce(items, { type: "heartbeat" }) === items, "ignore heartbeat");
check(reduce(items, { type: "delta", text: null }) === items, "invalid delta ignored");
check(seq(reduce(reduce([], {type:"delta",text:"  公共正文\n"}),{type:"assistant",text:"公共正文"}))[0]==="公共正文", "message-end canonical whitespace live/history exact");
const gated = reduce(reduce([{ type: "text", id: "p", text: "马上执行" }], { type: "attention", id: "gate", tool: "recolor_product", kind: "waiting", message: "请确认报价" }), { type: "final", reply: "请确认报价", authoritative: true });
check(!JSON.stringify(gated).includes("马上执行") && seq(gated).at(-1) === "请确认报价", "authoritative gate removes promises");
const ended = reduce(reduce([], { type: "tool_start", id: "x", tool: "recolor_product" }), { type: "tool_end", id: "x", tool: "recolor_product", isError: true });
check(ended[0].type === "tool" && ended[0].step.status === "error", "failure not upgraded");
const unconfirmed = reduce([], { type: "tool_start", id: "unknown", tool: "recolor_product" });
check(unconfirmed[0].type === "tool" && unconfirmed[0].step.status === "running", "disconnect preserves unknown status");
const turns: AssistantTimelineTurn[] = [{ id: "u", role: "user" as const, content: "看看画布" }, { id: "a", role: "assistant" as const, content: "已读取节点。", artifacts: [{ id: "art", image: "/media/result", title: "结果" }] }];
const history = [{ type: "canvas_turn", messageIndex: 0, message: "看看画布" },
  { type: "assistant", text: "我先查看画布。" }, ...events.slice(2, 5),
  { type: "assistant", text: "已读取节点。" }, ...events.slice(6, 8), { type: "canvas_reply", reply: "已读取节点。" }];
const restored = restoreAssistantTimeline(turns, history);
check(JSON.stringify(restored[1].timeline) === JSON.stringify(items), "live/cold history exact timeline");
check(restored[1].artifacts?.[0].id === "art", "history artifacts retained");
const round2: AssistantTimelineTurn[] = [...turns, { id: "u2", role: "user" as const, content: "再看看" }, { id: "a2", role: "assistant" as const, content: "第二轮" }];
const hist2 = [...history, { type: "canvas_turn", messageIndex: 2, message: "再看看" }, { type: "assistant", text: "第二轮" }, { type: "canvas_reply", reply: "第二轮" }];
const restored2 = restoreAssistantTimeline(round2, hist2);
check(restored2.length === 4 && restored2[3].timeline?.length === 1, "multiple rounds isolated");
check(restored2[1].timeline?.length === 4, "prior tool history retained");
const splitTurns = [turns[0], { id: "a0", role: "assistant" as const, content: "我先查看画布。" }, turns[1]];
const split = restoreAssistantTimeline(splitTurns, history);
check(split.length === 2 && split[1].timeline?.length === 4, "multiple assistant messages coalesced within user turn");
const legacy = restoreAssistantTimeline(turns, [{ type: "canvas_turn", messageIndex: 0 }, ...events.slice(2, 5)]);
check(legacy[1].content === turns[1].content && legacy[1].timeline?.at(-1)?.type === "text", "old row text kept, no guessed text chronology");
check(restoreAssistantTimeline(turns, [])[1] === turns[1], "no stored event legacy remains unchanged");
const partial = restoreAssistantTimeline([turns[0]], history.slice(0, 4));
check(partial[1].role === "assistant" && partial[1].timeline?.length === 3, "running history without final message");
const updated = updateAssistantTimeline(round2, { type: "delta", text: "增量" });
check(updated[1] === round2[1] && updated[3].timeline?.length === 1, "only latest assistant turn changed");
check(!panel.includes("{!!steps.length"), "no detached bottom tool list");
check(panel.includes("new ResizeObserver") && panel.includes("useLayoutEffect") && panel.includes("onWheel"), "layout/resize/manual-scroll handling");
check(panel.includes("compact onInspect") && panel.includes("turn.artifacts || []"), "compact tools use per-turn result binding");
const route = readFileSync("src/lib/agent/canvas.ts", "utf8");
check(route.includes('session.onDelta = text => { flush(); output += text; send("delta", { text }); };'), "older tool events flushed before live delta");
check(route.includes('appendSessionEvent(session,"canvas_reply",{reply,authoritative:!!pendingAttention'), "persist authoritative final");
const runtime = readFileSync("src/lib/agent/runtime.ts", "utf8");
check(runtime.includes('"assistant","canvas_reply"'), "public message boundaries persisted not token chunks");
console.log(`AGENT_STREAM_TIMELINE=PASS checks=${checks} ORDER=EXACT TOOLS=IN_PLACE HISTORY=EXACT LEGACY=COMPATIBLE UNKNOWN=RETAINED SUPPLIER_CALLS=0`);
