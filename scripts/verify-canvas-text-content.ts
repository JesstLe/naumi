import assert from "node:assert/strict";
import {canvasTextContent, nextCanvasTextTimestamp} from "../src/lib/canvas/text-content";
import {buildTextImageRequests} from "../src/lib/canvas/text-image-inputs";

let checks = 0;
const future = new Date(Date.now() + 60_000).toISOString();
assert.equal(Date.parse(nextCanvasTextTimestamp(future)), Date.parse(future) + 1);
assert.ok(Date.parse(nextCanvasTextTimestamp()) >= Date.now() - 1000); checks++;

for (const status of ["completed", "failed", "generating"]) {
  assert.equal(canvasTextContent({content: "", prompt: "请润色", status}), "");
  assert.equal(canvasTextContent({content: "原文", prompt: "请润色", status}), "原文"); checks++;
}
assert.equal(canvasTextContent({content: "", prompt: "旧节点草稿", status: "idle"}), "旧节点草稿"); checks++;
assert.equal(canvasTextContent({content: "\n ", prompt: "不要复活", status: "completed"}), "\n "); checks++;
for (const status of ["completed", "failed"]) for (const mode of ["general", "pure", "replicate"] as const) {
  const source = {id: "text-one", projectKey: "p", content: "", prompt: "请润色", status, productIds: ["product"]};
  const input = {projectKey: "p", nodes: [source], textNodeIds: [source.id], imageIds: ["product"], mode, drafts: {[source.id]: "旧输入"}};
  assert.throws(() => buildTextImageRequests(input), (error: unknown) => (error as {code: string}).code === "EMPTY_TEXT");
  const result = buildTextImageRequests({...input, nodes: [{...source, content: "手写正文"}]})[0];
  assert.ok(result.prompt.startsWith("手写正文")); assert.ok(!result.prompt.includes("请润色")); checks++;
}
console.log(`CANVAS_TEXT_CONTENT=PASS CHECKS=${checks} CLEARED_BODY=AUTHORITATIVE LEGACY_IDLE=COMPATIBLE AI_INSTRUCTION_LEAKS=0 EXIT=0`);
