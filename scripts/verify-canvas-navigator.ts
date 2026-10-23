import assert from "node:assert/strict";
import { canvasOutlineEntries, canvasOutlineCounts, filterCanvasOutline } from "../src/lib/canvas/navigator";

let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }
const nodes = [
  { id: "art-a", type: "art", data: { title: "蓝色产品 主图", prompt: "玻璃瓶 棚拍", image: "/owned.png", settings: { locked: true } } },
  { id: "text-a", type: "text", data: { content: "文案标题\n第二段内容", nodeKind: "text" } },
  { id: "video-a", type: "videoGeneration", data: { title: "新品短片", prompt: "镜头推进", status: "running" } },
  { id: "pend-a", type: "pend", data: { label: "待创作1", generationFailure: { kind: "failure" } } },
  { id: "task-a", type: "art", data: { label: "处理中", pending: true, generating: true } },
  { id: "group-a", type: "workflowGroup", data: { title: "产品分组" } },
  { id: "art-a", type: "art", data: { title: "重复条目不覆盖原节点" } },
  { id: "", type: "art", data: {} },
];
const raw = JSON.stringify(nodes);
const entries = canvasOutlineEntries(nodes);
assert.equal(entries.length, 6); checks++;
check(JSON.stringify(nodes) === raw, "non-mutating index");
assert.deepEqual(canvasOutlineCounts(entries), { all: 6, image: 1, text: 1, video: 1, pending: 2, group: 1 }); checks++;
check(entries[0].locked, "locked state");
assert.equal(entries[1].title, "文案标题"); checks++;
assert.equal(entries[2].state, "running"); checks++;
assert.equal(entries[3].state, "failed"); checks++;
assert.equal(entries[4].state, "running"); checks++;
assert.equal(filterCanvasOutline(entries, "玻璃瓶 蓝色")[0]?.id, "art-a"); checks++;
assert.equal(filterCanvasOutline(entries, "第二段")[0]?.id, "text-a"); checks++;
assert.equal(filterCanvasOutline(entries, "", "pending").length, 2); checks++;
assert.equal(filterCanvasOutline(entries, "蓝色", "video").length, 0); checks++;
assert.equal(filterCanvasOutline(entries, "ART-A")[0]?.id, "art-a"); checks++;
assert.equal(filterCanvasOutline(entries, "ＡＲＴ－Ａ")[0]?.id, "art-a"); checks++;
assert.equal(filterCanvasOutline(entries, "不存在").length, 0); checks++;
assert.equal(filterCanvasOutline(entries, "  ").length, 6); checks++;
assert.deepEqual(canvasOutlineCounts([]), { all: 0, image: 0, text: 0, video: 0, pending: 0, group: 0 }); checks++;
const otherProject = canvasOutlineEntries([{ id: "another", data: { title: "另一个项目" } }]);
assert.equal(filterCanvasOutline(otherProject, "蓝色").length, 0); checks++;
assert.equal(canvasOutlineEntries([{ id: "draft", data: { title: 0, content: null } }])[0].title, "图片"); checks++;
check(entries.every(entry => !Object.keys(entry).some(key => ["token", "owner", "url", "image"].includes(key))), "outline carries no auth or original media");
const large = canvasOutlineEntries(Array.from({ length: 3000 }, (_, i) => ({ id: `node-${i}`, data: { title: `节点${i}`, prompt: `镜头${i}` } })));
assert.equal(large.length, 3000); checks++;
assert.equal(filterCanvasOutline(large, "镜头2999")[0]?.id, "node-2999"); checks++;
console.log(`CANVAS_NAVIGATOR=PASS CHECKS=${checks} CURRENT_CANVAS_ONLY=1 NETWORK=0 SUPPLIER_CALLS=0`);
