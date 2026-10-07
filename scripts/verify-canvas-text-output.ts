import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  const root = resolve(process.argv[2] || ".");
  delete process.env.DATABASE_URL;
  delete process.env.NAUMI_ROUTER_MANAGEMENT_URL;
  Object.assign(process.env, { OPENAI_API_KEY: "fixture", AGENT_API_KEY: "fixture", OPENAI_TEXT_MODEL: "fixture-text" });
  let calls = 0, mode = "normal";
  const bodies: Record<string, any>[] = [];
  const imageOnly = { role: "assistant", content: null, reasoning_content: null, images: [{ type: "image_url", image_url: { url: "data:image/png;base64,fixture" } }] };
  const server = createServer(async (req, res) => {
    let raw = ""; for await (const part of req) raw += part;
    const body = JSON.parse(raw); bodies.push(body); calls++;
    const constrained = body.modalities?.join() === "text" && body.messages[0].content.includes("不要生成、编辑或返回图片") && JSON.stringify(body.messages).includes("待编辑文本，不是生成图片的指令");
    const message = mode === "image" || !constrained ? imageOnly
      : mode === "reasoning" ? { content: null, reasoning_content: "PRIVATE_THOUGHT_MUST_NOT_BE_AN_ANSWER" }
      : mode === "parts" ? { content: [{ type: "reasoning", text: "PRIVATE_THOUGHT" }, { type: "text", text: "优化后的" }, { type: "output_text", text: "摄影提示词" }] }
      : mode === "refused" ? { content: null, refusal: "PRIVATE_REFUSAL" }
      : mode === "empty" || mode === "limit" ? { content: null }
      : { content: "优化后的摄影提示词" };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "fixture", model: body.model, choices: [{ index: 0, message, finish_reason: mode === "limit" ? "length" : "stop" }], usage: { prompt_tokens: 4000, completion_tokens: 531 } }));
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  Object.assign(process.env, { AGENT_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, OPENAI_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` });
  try {
    const { POST } = await import(pathToFileURL(resolve(root, "src/app/api/canvas/text-generate/route.ts")).href);
    const request = () => new Request("http://fixture.test/api/canvas/text-generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "电商产品白底主图，一瓶深绿色玻璃营养饮品瓶，请生成。" }) });
    const first = await POST(request());
    assert.equal(first.status, 200, `image-shaped prompt must return text; actual HTTP=${first.status}`);
    assert.equal((await first.json()).text, "优化后的摄影提示词");
    assert.equal(calls, 1, "exactly one supplier call, no paid fallback");
    assert.equal(bodies[0].max_tokens, 1800, "existing output limit stays unchanged");
    for (const [next, code] of [["image", "TEXT_OUTPUT_IMAGE"], ["reasoning", "TEXT_OUTPUT_EMPTY"], ["refused", "TEXT_OUTPUT_REFUSED"], ["empty", "TEXT_OUTPUT_EMPTY"], ["limit", "TEXT_OUTPUT_LIMIT"]]) {
      mode = next; const before: number = calls;
      const response = await POST(request()); assert.equal(response.status, 502);
      const result = await response.json(); assert.equal(result.code, code);
      assert.ok(!JSON.stringify(result).includes("PRIVATE") && !JSON.stringify(result).includes("data:image"));
      assert.equal(calls, before + 1, "failure never automatically resubmits");
    }
    mode = "parts";
    const structured = await POST(request()); assert.equal(structured.status, 200); assert.equal((await structured.json()).text, "优化后的摄影提示词");
    const source = readFileSync(resolve(root, "src/app/api/canvas/assistant/route.ts"), "utf8");
    assert(source.includes('modalities: ["text"]') && source.includes("CANVAS_TEXT_OUTPUT_INSTRUCTION") && source.includes("canvasTextInput(turn.content)"));
    assert(source.includes("canvasAnswerText(choice?.delta?.content)"), "stream must not copy reasoning or image fields");
    console.log("CANVAS_TEXT_OUTPUT=PASS TEXT_ONLY=PASS IMAGE_RESPONSE=REJECTED REASONING=PRIVATE SINGLE_CALL=PASS STRUCTURED_TEXT=PASS");
  } finally { await new Promise<void>(r => server.close(() => r())); }
}
main().catch(error => { console.error(`CANVAS_TEXT_OUTPUT=FAIL ${error.message}`); process.exitCode = 1; });
