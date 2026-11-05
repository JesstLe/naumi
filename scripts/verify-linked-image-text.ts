import assert from "node:assert/strict";
import { resolveLinkedImageText, type LinkedImageTextNode } from "../src/lib/canvas/linked-image-text";

type FixtureNode = LinkedImageTextNode & { sourceIds?: string[]; canvasX?: number; canvasY?: number };
const projectKey = "project-a";
const targetId = "image-a";
const node = (id: string, content: string, extra: Partial<FixtureNode> = {}): FixtureNode => ({
  id, content, title: id, projectKey, status: "completed", targetIds: [], ...extra,
});
const resolve = (nodes: readonly FixtureNode[], extra: Partial<Parameters<typeof resolveLinkedImageText>[0]> = {}) =>
  resolveLinkedImageText({ nodes, targetId, projectKey, draft: "", ...extra });
let cases = 0;
function test(name: string, run: () => void) {
  run();
  cases++;
  console.log(`PASS ${name}`);
}

test("nearby nodes without an explicit edge are ignored", () => {
  assert.deepEqual(resolve([node("nearby", "not an input", { canvasX: 0, canvasY: 0 })], { draft: "draft" }), {
    sources: [], prompt: "draft", error: null,
  });
});

test("direct target edges follow node order without upstream traversal", () => {
  const result = resolve([
    node("upstream", "not direct"),
    node("second", "second body", { targetIds: [targetId], sourceIds: ["upstream"] }),
    node("first", "first body", { targetIds: ["other-image", targetId] }),
  ], { draft: "extra direction" });
  assert.deepEqual(result.sources.map(source => source.id), ["second", "first"]);
  assert.equal(result.prompt, "second body\n\nfirst body\n\nextra direction");
  assert.equal(result.error, null);
});

test("pending explicit IDs lead and duplicate IDs are read once", () => {
  const result = resolve([
    node("a", "A", { targetIds: [targetId] }),
    node("b", "B", { targetIds: [targetId] }),
    node("c", "C"),
  ], { explicitTextIds: ["c", "b", "c", "b"] });
  assert.deepEqual(result.sources.map(source => source.id), ["c", "b", "a"]);
  assert.equal(result.prompt, "C\n\nB\n\nA");
});

test("missing pending source fails the entire prompt", () => {
  const result = resolve([node("valid", "valid")], { explicitTextIds: ["valid", "deleted"], draft: "draft", fallback: "fallback" });
  assert.match(result.error ?? "", /已失效/);
  assert.equal(result.prompt, "");
});

test("cross-project explicit source is rejected and not exposed", () => {
  const result = resolve([node("foreign", "foreign body", { projectKey: "project-b" })], { explicitTextIds: ["foreign"] });
  assert.match(result.error ?? "", /不在当前画布/);
  assert.equal(result.prompt, "");
  assert.deepEqual(result.sources, []);
});

test("cross-project target edge is rejected", () => {
  const result = resolve([node("foreign", "foreign body", { projectKey: "project-b", targetIds: [targetId] })]);
  assert.match(result.error ?? "", /不在当前画布/);
  assert.equal(result.prompt, "");
});

test("generating sources block direct and pending generation", () => {
  for (const extra of [{ targetIds: [targetId] }, {}]) {
    const result = resolve([node("generating", "partial", { ...extra, status: "generating" })], {
      explicitTextIds: extra.targetIds ? [] : ["generating"],
    });
    assert.match(result.error ?? "", /仍在生成/);
    assert.equal(result.prompt, "");
  }
});

test("saving sources block generation", () => {
  for (const extra of [{ busy: true }, { status: "saving" }]) {
    const result = resolve([node("saving", "new draft", extra)], { explicitTextIds: ["saving"] });
    assert.match(result.error ?? "", /正在保存/);
    assert.equal(result.prompt, "");
  }
});

test("explicitly empty content never revives an AI prompt", () => {
  for (const status of ["completed", "idle", undefined]) {
    const result = resolve([node("empty", "", { status, prompt: "AI instruction", targetIds: [targetId] })]);
    assert.equal(result.prompt, "");
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].content, "");
  }
  assert.equal(resolve([node("null", "", { content: null, prompt: "AI instruction", targetIds: [targetId] })]).prompt, "");
});

test("legacy prompt-only idle nodes still use the shared reader", () => {
  const result = resolve([{ id: "legacy", projectKey, prompt: "legacy body", targetIds: [targetId] }]);
  assert.equal(result.prompt, "legacy body");
  assert.equal(result.sources[0].title, "文字节点");
});

test("blank sources remain visible and fallback is only used when all input is blank", () => {
  const nodes = [node("blank", "  \n ", { targetIds: [targetId] })];
  assert.equal(resolve(nodes, { draft: "  ", fallback: "fallback" }).prompt, "fallback");
  assert.equal(resolve(nodes, { draft: "draft", fallback: "fallback" }).prompt, "draft");
  assert.equal(resolve(nodes).sources[0].content, "  \n ");
  assert.equal(resolve([], { draft: "", fallback: "fallback" }).prompt, "fallback");
});

test("an explicit empty draft does not replace linked input with fallback", () => {
  assert.equal(resolve([node("a", "A", { targetIds: [targetId] })], { draft: "", fallback: "old image prompt" }).prompt, "A");
});

test("different source IDs with identical content are retained", () => {
  const result = resolve([node("a", "same"), node("b", "same")], { explicitTextIds: ["a", "a", "b"] });
  assert.equal(result.prompt, "same\n\nsame");
  assert.deepEqual(result.sources.map(source => source.id), ["a", "b"]);
});

test("only an exact whole-linked-body legacy draft is deduplicated", () => {
  const nodes = [node("a", "A", { targetIds: [targetId] }), node("b", "B", { targetIds: [targetId] })];
  assert.equal(resolve(nodes, { draft: "  A\n\nB  " }).prompt, "A\n\nB");
  assert.equal(resolve(nodes, { draft: "A" }).prompt, "A\n\nB\n\nA");
  assert.equal(resolve(nodes, { draft: "A\n\nB\n\nkeep my words" }).prompt, "A\n\nB\n\nA\n\nB\n\nkeep my words");
});

test("source edits are resolved fresh without dropping draft text", () => {
  const nodes = [node("a", "before", { targetIds: [targetId] })];
  assert.equal(resolve(nodes, { draft: "direction" }).prompt, "before\n\ndirection");
  nodes[0].content = "after";
  assert.equal(resolve(nodes, { draft: "direction" }).prompt, "after\n\ndirection");
  assert.equal(resolve(nodes, { draft: "before" }).prompt, "after\n\nbefore");
  nodes[0].targetIds = [];
  assert.equal(resolve(nodes, { draft: "direction" }).prompt, "direction");
});

test("long content and source display text are never truncated", () => {
  const body = `  ${"正文".repeat(12_000)}\nsecond paragraph  `;
  const result = resolve([node("long", body, { targetIds: [targetId] })], { draft: "direction" });
  assert.equal(result.sources[0].content, body);
  assert.equal(result.prompt, `${body.trim()}\n\ndirection`);
});

test("frozen caller objects and arrays remain unchanged", () => {
  const nodes = Object.freeze([Object.freeze(node("a", "A", { targetIds: Object.freeze([targetId]), prompt: "AI instruction" }))]);
  const explicitTextIds = Object.freeze(["a", "a"]);
  const before = JSON.stringify({ nodes, explicitTextIds });
  assert.equal(resolve(nodes, { explicitTextIds, draft: "draft" }).prompt, "A\n\ndraft");
  assert.equal(JSON.stringify({ nodes, explicitTextIds }), before);
});

console.log(`LINKED_IMAGE_TEXT=PASS CASES=${cases} MUTATION=NONE`);
