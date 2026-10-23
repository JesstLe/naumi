import assert from "node:assert/strict";
import {
  buildTextImageRequests,
  TextImageInputError,
  type TextImageInputErrorCode,
  type TextImageRequest,
  type TextImageSource,
} from "../src/lib/canvas/text-image-inputs";

// Source-only delivery: the parent runs this once after SOURCE STABLE.
type Input = Parameters<typeof buildTextImageRequests>[0];
const PROJECT = "project-a";
const GUARD = "\n产品必须完全取自第一张参考图（产品白底图），包装、品牌、文字保持不变；其余参考图仅作构图与风格参考，严禁照搬其中的竞品标识、品牌名与文案。";
const cases: Array<[string, () => void]> = [];
function test(name: string, run: () => void): void { cases.push([name, run]); }
function text(id: string, content = id, extra: Partial<TextImageSource> = {}): TextImageSource {
  return { id, projectKey: PROJECT, content, ...extra };
}
function input(nodes: readonly TextImageSource[], extra: Partial<Input> = {}): Input {
  return { projectKey: PROJECT, nodes, textNodeIds: nodes.map(node => node.id), imageIds: [], mode: "general", ...extra };
}
function one(nodes: readonly TextImageSource[], extra: Partial<Input> = {}): TextImageRequest {
  const requests = buildTextImageRequests(input(nodes, extra));
  assert.equal(requests.length, 1);
  return requests[0];
}
function fails(code: TextImageInputErrorCode, value: Input): void {
  assert.throws(() => buildTextImageRequests(value), error => {
    assert.ok(error instanceof TextImageInputError);
    assert.equal(error.name, "TextImageInputError");
    assert.equal(error.code, code);
    assert.ok(error.message.length > 0);
    return true;
  });
}
function legacy(content: string, extra: Partial<Input> = {}, nodeExtra: Partial<TextImageSource> = {}): TextImageRequest {
  return one([text("a", content, { productIds: ["product"], ...nodeExtra })], {
    mode: "pure", imageIds: ["product"], ...extra,
  });
}

test("general: plain text without product or image", () => {
  assert.deepEqual(one([text("a", "画一只猫")]), { anchorTextId: "a", textNodeIds: ["a"], imageIds: [], prompt: "画一只猫" });
});
test("general: natural leading @ remains unchanged", () => {
  assert.equal(one([text("a", "@夜晚的街角\n霓虹灯")]).prompt, "@夜晚的街角\n霓虹灯");
});
test("general: no e-commerce injection or product mention removal", () => {
  assert.equal(one([text("a", "@产品名\n自由创作")]).prompt, "@产品名\n自由创作");
});
test("body: completed content wins over draft and prompt", () => {
  assert.equal(one([text("a", " 输出 ", { prompt: "旧输入" })], { drafts: { a: "草稿" } }).prompt, "输出");
});
test("body: empty content falls back to node draft", () => {
  assert.equal(one([text("a", "", { prompt: "旧输入" })], { drafts: { a: " 当前草稿 " } }).prompt, "当前草稿");
});
test("body: blank content and draft fall back to prompt", () => {
  assert.equal(one([text("a", " \n", { prompt: " fallback " })], { drafts: { a: "  " } }).prompt, "fallback");
});
test("body: unrelated node drafts never leak", () => {
  assert.equal(one([text("a", "", { prompt: "自己的输入" })], { drafts: { other: "其他节点" } }).prompt, "自己的输入");
});
test("empty: whitespace-only text throws typed EMPTY_TEXT", () => {
  fails("EMPTY_TEXT", input([text("a", " \n\t ")]));
});
test("empty: combined all-empty graph throws EMPTY_TEXT", () => {
  fails("EMPTY_TEXT", input([text("a", ""), text("b", " ")], { combine: true }));
});
test("selection: no texts returns no requests even with stale images", () => {
  assert.deepEqual(buildTextImageRequests(input([], { combine: true, selectedImageIds: ["stale"] })), []);
});
test("selection: unknown and foreign text IDs are filtered", () => {
  const nodes = [text("foreign", "secret", { projectKey: "other" }), text("a")];
  assert.deepEqual(one(nodes, { textNodeIds: ["missing", "foreign", "a"] }).textNodeIds, ["a"]);
});
test("selection: invalid-only selection returns no requests", () => {
  assert.deepEqual(buildTextImageRequests(input([text("a")], { textNodeIds: ["missing"] })), []);
});
test("selection: dedupe preserves explicit selection order", () => {
  const result = buildTextImageRequests(input([text("a"), text("b")], { textNodeIds: ["b", "a", "b", "a"] }));
  assert.deepEqual(result.map(item => item.anchorTextId), ["b", "a"]);
});
test("combine: true joins texts with a double newline", () => {
  assert.deepEqual(one([text("a", "A"), text("b", "B")], { combine: true }), {
    anchorTextId: "a", textNodeIds: ["a", "b"], imageIds: [], prompt: "A\n\nB",
  });
});
test("combine: false produces one request per explicit text", () => {
  const requests = buildTextImageRequests(input([text("a", "A"), text("b", "B")], { combine: false }));
  assert.deepEqual(requests.map(item => item.prompt), ["A", "B"]);
});
test("combine: identical bodies on distinct nodes are preserved", () => {
  assert.equal(one([text("a", "same"), text("b", "same")], { combine: true }).prompt, "same\n\nsame");
});
test("combine: blank first root remains the anchor", () => {
  const result = one([text("a", ""), text("b", "B")], { combine: true });
  assert.equal(result.anchorTextId, "a"); assert.equal(result.prompt, "B");
  assert.deepEqual(result.textNodeIds, ["a", "b"]);
});
test("combine: separate blank request does not silently disappear", () => {
  fails("EMPTY_TEXT", input([text("a", "A"), text("b", "")]));
});
test("upstream: transitive text content is collected", () => {
  const nodes = [text("a", "A", { sourceIds: ["b"] }), text("b", "B", { sourceIds: ["c"] }), text("c", "C")];
  assert.equal(one(nodes, { textNodeIds: ["a"] }).prompt, "A\n\nB\n\nC");
});
test("upstream: blank root is rescued by nonblank dependency", () => {
  const result = one([text("a", "", { sourceIds: ["b"] }), text("b", "B")], { textNodeIds: ["a"] });
  assert.deepEqual(result.textNodeIds, ["a", "b"]); assert.equal(result.prompt, "B");
});
test("upstream: explicit roots precede breadth-first dependencies", () => {
  const nodes = [text("a", "A", { sourceIds: ["c"] }), text("b", "B"), text("c", "C", { sourceIds: ["d"] }), text("d", "D")];
  assert.deepEqual(one(nodes, { textNodeIds: ["a", "b"], combine: true }).textNodeIds, ["a", "b", "c", "d"]);
});
test("upstream: selected dependency expands without duplicating its body", () => {
  const nodes = [text("a", "A", { sourceIds: ["b"] }), text("b", "B", { sourceIds: ["c"] }), text("c", "C")];
  assert.deepEqual(one(nodes, { textNodeIds: ["a", "b"], combine: true }).textNodeIds, ["a", "b", "c"]);
});
test("cycle: self-reference terminates", () => {
  assert.deepEqual(one([text("a", "A", { sourceIds: ["a", "a"] })]).textNodeIds, ["a"]);
});
test("cycle: two-node cycle preserves each body once", () => {
  const nodes = [text("a", "A", { sourceIds: ["b"] }), text("b", "B", { sourceIds: ["a"] })];
  assert.equal(one(nodes, { textNodeIds: ["a"] }).prompt, "A\n\nB");
});
test("dedupe: diamond dependencies appear once per combined request", () => {
  const nodes = [text("a", "A", { sourceIds: ["b", "c"] }), text("b", "B", { sourceIds: ["d"] }), text("c", "C", { sourceIds: ["d"] }), text("d", "D")];
  assert.deepEqual(one(nodes, { textNodeIds: ["a"] }).textNodeIds, ["a", "b", "c", "d"]);
});
test("dedupe: shared dependency remains in each separate request", () => {
  const nodes = [text("a", "A", { sourceIds: ["c"] }), text("b", "B", { sourceIds: ["c"] }), text("c", "C")];
  const requests = buildTextImageRequests(input(nodes, { textNodeIds: ["a", "b"] }));
  assert.deepEqual(requests.map(item => item.textNodeIds), [["a", "c"], ["b", "c"]]);
});
test("project: foreign text is not traversed or busy-checked", () => {
  const nodes = [text("a", "A", { sourceIds: ["foreign", "text-missing"] }), text("foreign", "secret", { projectKey: "other", status: "generating", sourceIds: ["hidden-art"] })];
  assert.equal(one(nodes, { textNodeIds: ["a"] }).prompt, "A");
});
test("project: IDs need not use the text prefix when the text exists", () => {
  const nodes = [text("a", "A", { sourceIds: ["custom-upstream"] }), text("custom-upstream", "B")];
  assert.deepEqual(one(nodes, { textNodeIds: ["a"] }).textNodeIds, ["a", "custom-upstream"]);
});
test("busy: selected generating text is rejected", () => {
  fails("TEXT_BUSY", input([text("a", "partial", { status: "generating" })]));
});
test("busy: reachable generating text is rejected even with references off", () => {
  const nodes = [text("a", "A", { sourceIds: ["b"] }), text("b", "", { status: "generating" })];
  fails("TEXT_BUSY", input(nodes, { textNodeIds: ["a"], useReferences: false }));
});
test("busy: unrelated generating text is ignored", () => {
  assert.equal(one([text("a"), text("b", "", { status: "generating" })], { textNodeIds: ["a"] }).prompt, "a");
});
test("images: optional selected image works without a product", () => {
  assert.deepEqual(one([text("a")], { imageIds: ["ref"], selectedImageIds: ["ref"] }).imageIds, ["ref"]);
});
test("images: stable dedupe spans sources products and selection", () => {
  const nodes = [text("a", "A", { sourceIds: ["r2", "b", "r1", "r2"], productIds: ["product", "r1"] }), text("b", "B", { sourceIds: ["r3", "product"] })];
  assert.deepEqual(one(nodes, { textNodeIds: ["a"], imageIds: ["r4", "product", "r1", "r2", "r3"], selectedImageIds: ["r3", "r4", "r4"] }).imageIds, ["r2", "r1", "product", "r3", "r4"]);
});
test("images: invalid explicit selection fails refs-on", () => {
  fails("MISSING_REFERENCE", input([text("a")], { selectedImageIds: ["stale"] }));
});
test("images: invalid product binding fails refs-on", () => {
  fails("MISSING_REFERENCE", input([text("a", "A", { productIds: ["stale"] })]));
});
test("images: upstream invalid product also fails refs-on", () => {
  fails("MISSING_REFERENCE", input([text("a", "A", { sourceIds: ["b"] }), text("b", "B", { productIds: ["stale"] })], { textNodeIds: ["a"] }));
});
test("images: refs-off ignores stale selected product and source images", () => {
  const result = one([text("a", "A", { productIds: ["stale-product"], sourceIds: ["stale-art", "b"] }), text("b", "B", { productIds: ["stale-upstream-product"] })], {
    textNodeIds: ["a"], selectedImageIds: ["stale-selected"], useReferences: false, maxImages: 0,
  });
  assert.deepEqual(result.imageIds, []); assert.equal(result.prompt, "A\n\nB");
});
test("images: unavailable art or video source fails rather than losing reference", () => {
  for (const id of ["art-expired", "video-node", "unknown-id"]) {
    fails("MISSING_REFERENCE", input([text("a", "A", { sourceIds: [id] })]));
  }
});
test("images: known foreign text and missing text-prefixed links stay ignored", () => {
  const nodes = [text("a", "A", { sourceIds: ["foreign-id", "text-deleted"] }), text("foreign-id", "secret", { projectKey: "other" })];
  assert.deepEqual(one(nodes, { textNodeIds: ["a"] }).imageIds, []);
});
test("limit: exactly sixteen unique images pass", () => {
  const refs = Array.from({ length: 16 }, (_, i) => `r${i}`);
  assert.deepEqual(one([text("a")], { imageIds: refs, selectedImageIds: refs }).imageIds, refs);
});
test("limit: seventeen images fail without truncation", () => {
  const refs = Array.from({ length: 17 }, (_, i) => `r${i}`);
  fails("TOO_MANY_IMAGES", input([text("a")], { imageIds: refs, selectedImageIds: refs }));
});
test("limit: duplicate refs count only once", () => {
  assert.deepEqual(one([text("a", "A", { sourceIds: ["r", "r"], productIds: ["r"] })], { imageIds: ["r"], selectedImageIds: ["r", "r"], maxImages: 1 }).imageIds, ["r"]);
});
test("limit: maxImages override and zero are respected", () => {
  fails("TOO_MANY_IMAGES", input([text("a")], { imageIds: ["r"], selectedImageIds: ["r"], maxImages: 0 }));
  assert.deepEqual(one([text("a")], { maxImages: 0 }).imageIds, []);
});
test("limit: combined reference union is checked per request", () => {
  const nodes = [text("a", "A", { sourceIds: ["r1"] }), text("b", "B", { sourceIds: ["r2"] })];
  fails("TOO_MANY_IMAGES", input(nodes, { combine: true, imageIds: ["r1", "r2"], maxImages: 1 }));
  assert.equal(buildTextImageRequests(input(nodes, { combine: false, imageIds: ["r1", "r2"], maxImages: 1 })).length, 2);
});
test("limit: exactly 6000 prompt units pass", () => {
  assert.equal(one([text("a", "字".repeat(6000))]).prompt.length, 6000);
});
test("limit: 6001 prompt units fail without truncation", () => {
  fails("PROMPT_TOO_LONG", input([text("a", "字".repeat(6001))]));
});
test("limit: combined separators count toward 6000", () => {
  assert.equal(one([text("a", "a".repeat(2999)), text("b", "b".repeat(2999))], { combine: true }).prompt.length, 6000);
  fails("PROMPT_TOO_LONG", input([text("a", "a".repeat(3000)), text("b", "b".repeat(2999))], { combine: true }));
});
test("legacy: pure emits only the first product", () => {
  assert.deepEqual(legacy("Body", { imageIds: ["product", "p2", "r", "selected"], selectedImageIds: ["selected"] }, { productIds: ["product", "p2"], sourceIds: ["r"] }).imageIds, ["product"]);
});
test("legacy: required product cannot fall through to a later valid one", () => {
  fails("MISSING_PRODUCT", input([text("a", "Body", { productIds: ["stale", "valid"] })], { mode: "pure", imageIds: ["valid"] }));
});
test("legacy: absent product is typed MISSING_PRODUCT", () => {
  for (const mode of ["pure", "replicate"] as const) fails("MISSING_PRODUCT", input([text("a")], { mode }));
});
test("legacy: invalid additional product binding is not silently lost", () => {
  fails("MISSING_REFERENCE", input([text("a", "Body", { productIds: ["product", "stale"] })], { mode: "pure", imageIds: ["product"] }));
});
test("legacy: consecutive leading mention lines are stripped", () => {
  assert.equal(legacy("  @产品图\n@第二张\nBody").prompt, "Body");
});
test("legacy: a blank first line preserves the following mention", () => {
  assert.equal(legacy("\n@产品图\nBody").prompt, "@产品图\nBody");
});
test("legacy: blank separator stops mention stripping", () => {
  assert.equal(legacy("@产品图\n\n@自然语言\nBody").prompt, "@自然语言\nBody");
});
test("legacy: interior mentions remain", () => {
  assert.equal(legacy("Body\n@自然语言").prompt, "Body\n@自然语言");
});
test("legacy: mention-only content falls back to stripped draft", () => {
  assert.equal(legacy("@产品图", { drafts: { a: "@产品图\nDraft" } }, { prompt: "Prompt" }).prompt, "Draft");
});
test("legacy: empty content and draft fall back to stripped prompt", () => {
  assert.equal(legacy("", { drafts: { a: "@产品图" } }, { prompt: "@产品图\nPrompt" }).prompt, "Prompt");
});
test("legacy: content remains authoritative over input draft", () => {
  assert.equal(legacy("@产品图\nCompleted", { drafts: { a: "Draft" } }, { prompt: "Prompt" }).prompt, "Completed");
});
test("legacy: empty body is rejected before replicate guard", () => {
  fails("EMPTY_TEXT", input([text("a", "@产品图", { productIds: ["product"] })], { mode: "replicate", imageIds: ["product"] }));
});
test("legacy: replicate product-first references and exact guard", () => {
  const result = legacy("@产品图\nBody", { mode: "replicate", imageIds: ["r2", "product", "r1"] }, { sourceIds: ["r2", "product", "r1", "r2", "text-missing"] });
  assert.deepEqual(result.imageIds, ["product", "r2", "r1"]); assert.equal(result.prompt, "Body" + GUARD);
});
test("legacy: upstream text content and busy state are not consumed", () => {
  const nodes = [text("a", "Body", { productIds: ["product"], sourceIds: ["b"] }), text("b", "unfinished", { status: "generating" })];
  for (const mode of ["pure", "replicate"] as const) {
    const result = one(nodes, { textNodeIds: ["a"], mode, imageIds: ["product"] });
    assert.deepEqual(result.textNodeIds, ["a"]); assert.ok(!result.prompt.includes("unfinished"));
  }
});
test("legacy: combine and reference switch do not alter product requests", () => {
  const nodes = [text("a", "A", { productIds: ["product"] }), text("b", "B", { productIds: ["product"] })];
  for (const mode of ["pure", "replicate"] as const) {
    const requests = buildTextImageRequests(input(nodes, { mode, imageIds: ["product"], combine: true, useReferences: false }));
    assert.equal(requests.length, 2); assert.ok(requests.every(item => item.imageIds[0] === "product"));
  }
});
test("legacy: selected generating text is rejected", () => {
  fails("TEXT_BUSY", input([text("a", "partial", { productIds: ["product"], status: "generating" })], { mode: "pure", imageIds: ["product"] }));
});
test("legacy: image limit does not truncate replicate sources", () => {
  fails("TOO_MANY_IMAGES", input([text("a", "Body", { productIds: ["product"], sourceIds: ["r1", "r2"] })], { mode: "replicate", imageIds: ["product", "r1", "r2"], maxImages: 2 }));
});
test("legacy: pure prompt is bounded at 6000", () => {
  assert.equal(legacy("x".repeat(6000)).prompt.length, 6000);
  fails("PROMPT_TOO_LONG", input([text("a", "x".repeat(6001), { productIds: ["product"] })], { mode: "pure", imageIds: ["product"] }));
});
test("legacy: replicate guard is included in the 6000 total", () => {
  assert.equal(legacy("x".repeat(6000 - GUARD.length), { mode: "replicate" }).prompt.length, 6000);
  fails("PROMPT_TOO_LONG", input([text("a", "x".repeat(6001 - GUARD.length), { productIds: ["product"] })], { mode: "replicate", imageIds: ["product"] }));
});
test("purity: frozen input remains unchanged and results are independent", () => {
  const source = text("a", "Body", { sourceIds: Object.freeze(["r"]), productIds: Object.freeze(["r"]) });
  Object.freeze(source);
  const value = Object.freeze(input(Object.freeze([source]), {
    textNodeIds: Object.freeze(["a"]), imageIds: Object.freeze(["r"]), selectedImageIds: Object.freeze(["r"]), drafts: Object.freeze({ a: "draft" }),
  }));
  const before = JSON.stringify(value);
  const first = buildTextImageRequests(value); first[0].imageIds.push("mutated-result");
  const second = buildTextImageRequests(value);
  assert.equal(JSON.stringify(value), before); assert.deepEqual(second[0].imageIds, ["r"]);
});

let failures = 0;
for (const [name, run] of cases) {
  try { run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.error(`FAIL ${name}`, error); }
}
console.log(`TEXT_IMAGE_INPUTS=${failures ? "FAIL" : "PASS"} CASES=${cases.length} FAILED=${failures} PROVIDER_CALLS=0`);
if (failures) process.exitCode = 1;
