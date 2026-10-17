import assert from "node:assert/strict";
import { reduceAgentProgress, type AgentProgressEvent, toolDuration } from "../src/lib/canvas/agent-progress";
import { publicToolDetails, readPublicToolDetails } from "../src/lib/agent/tool-presentation";
import type { AgentOrbStep } from "../src/lib/canvas/agent-orb";

const canvas = { anchorId: "anchor", imageUrls: ["https://fixture.invalid/media/input.png?signature=private", "https://fixture.invalid/second"], ratio: "1:1", resolution: "2K", quality: "high" };
const details = publicToolDetails("recolor_product", { color: "#2E6FE0", strength: 100, ratio: "9:16", image_url: "https://wrong.invalid/?token=private", authorization: "Bearer private", prompt: "internal instructions" }, canvas);
assert.deepEqual(details, { parameters: [{ name: "color", value: "#2E6FE0" }, { name: "strength", value: "100" }, { name: "ratio", value: "1:1" }, { name: "resolution", value: "2K" }, { name: "quality", value: "high" }], targetId: "anchor", inputCount: 2 });
assert(!/signature|private|internal|https/.test(JSON.stringify(details)));
assert.deepEqual(readPublicToolDetails(details), details);
assert.deepEqual(publicToolDetails("unknown", { color: "<img>", strength: -1, count: Infinity, ratio: "URL", output_format: "exe", api_key: "secret" }), { parameters: [] });
assert.deepEqual(readPublicToolDetails({ parameters: [{ name: "token", value: "secret" }, { name: "color", value: "javascript:alert(1)" }], targetId: "https://private", inputCount: 999 }), { parameters: [] });
let checks = 5;
const events: AgentProgressEvent[] = [
  { type: "tool_start", id: "a", tool: "recolor_product", at: 1000, details },
  { type: "tool_start", id: "b", tool: "recolor_product", at: 1100, details: { parameters: [{ name: "color", value: "#FF0000" }] } },
  { type: "tool_start", id: "a", tool: "recolor_product", at: 1800, summary: "已提交，等待生成结果" },
  { type: "artifacts", toolCallId: "a", artifacts: [{ id: "blue" }], at: 3500 },
  { type: "artifacts", toolCallId: "b", artifacts: [{ id: "red" }], at: 4000 },
  { type: "tool_end", id: "a", tool: "recolor_product", at: 4600, isError: false },
  { type: "tool_end", id: "b", tool: "recolor_product", at: 5200, isError: false },
];
let live: AgentOrbStep[] = [], history: AgentOrbStep[] = [];
for (const event of events) { live = reduceAgentProgress(live, event); history = reduceAgentProgress(history, JSON.parse(JSON.stringify(event)), false, false); }
assert.deepEqual(live, history); checks++;
assert.equal(live[0].startedAt, 1000); assert.equal(toolDuration(live[0], false, 999999), 3600); checks += 2;
assert.deepEqual(live[0].resultIds, ["blue"]); assert.deepEqual(live[1].resultIds, ["red"]); checks += 2;
assert.deepEqual(live[0].details, details); checks++;
assert.deepEqual(reduceAgentProgress(live, { type: "artifacts", toolCallId: "a", artifacts: [{ id: "blue" }] }), live); checks++;
assert.deepEqual(reduceAgentProgress(live, { type: "artifacts", artifacts: [{ id: "legacy" }] }), live); checks++;
assert.deepEqual(reduceAgentProgress(live, { type: "tool_start", id: "a", tool: "recolor_product", at: 9999 }), live); checks++;
const running = reduceAgentProgress([], events[0]);
assert.equal(toolDuration(running[0], true, 2100), 1100); assert.equal(toolDuration(running[0], false, 2100), undefined); checks += 2;
const denied = reduceAgentProgress(running, { type: "attention", id: "a", kind: "restricted", code: "INTENT_REQUIRED", at: 1200 });
assert.equal(denied[0].attention, "restricted"); assert.equal(toolDuration(denied[0], true, 2100), undefined); checks += 2;
const ended = reduceAgentProgress(denied, { type: "tool_end", id: "a", tool: "recolor_product", at: 1300, isError: true });
assert.equal(ended[0].attention, "restricted"); assert.equal(ended[0].summary, denied[0].summary); checks += 2;
const waiting = reduceAgentProgress(running, { type: "attention", id: "a", kind: "waiting", message: "预计4积分，请确认报价" });
assert.equal(waiting[0].attention, "waiting"); assert.equal(waiting[0].summary, "预计4积分，请确认报价"); checks += 2;
const legacy = reduceAgentProgress([], { type: "tool_start", id: "legacy", tool: "get_balance" }, false, false);
assert.equal(toolDuration(legacy[0], false, 9999), undefined); assert.equal(legacy[0].status, "running"); checks += 2;
assert.equal(toolDuration({ ...live[0], endedAt: 500 }, false, 9999), undefined); checks++;
console.log(`AGENT_TOOL_TRACE=PASS checks=${checks} PUBLIC_PARAMS=WHITELIST LIVE_HISTORY=EXACT RESULT_CALL_IDS=ISOLATED UNKNOWN_DURATION=HIDDEN REAL_SUPPLIER_CALLS=0`);
