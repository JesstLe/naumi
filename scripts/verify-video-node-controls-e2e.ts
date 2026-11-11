import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createVideoFixture } from "./video-fusion/harness";
import { CAP_RICH } from "./video-fusion/profiles";

async function main() {
  let optimizerSource = "", corrupt = false;
  const h = await createVideoFixture({ startWorker: false, videoDefinition: { ...CAP_RICH, durationResolutionMap: [{ durations: [4, 8], resolutions: ["720p", "1080p"] }, { durations: [12], resolutions: ["720p"] }], aspectRatios: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] }, agentReply: body => {
    optimizerSource = body.messages.at(-1).content.replace(/^待优化的视频提示词：\n/, "");
    return { text: corrupt ? "错误的引用 {{ref 9}}" : optimizerSource + "\n镜头缓慢推进，动作连续自然。" };
  } });
  const evidence = `output/video-node-controls-20261022/${randomUUID()}`;
  await mkdir(evidence, { recursive: true });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const create = async (title: string) => {
      const id = `video-${randomUUID()}`;
      const response = await h.request<any>("a", "POST", "/api/canvas/video-nodes", { id, projectKey: `tree:${id}`, operationId: randomUUID(), expectedRevision: 0, title, x: 100, y: 120, width: 384, height: 216, config: { modelId: "video-a", providerId: "managed-video", mode: "text", prompt: "鹈鹕缓缓飞过海面", durationSeconds: 4, resolution: "720p", aspectRatio: "16:9", generateAudio: false, batchCount:4 }, inputs: [] });
      assert.equal(response.status, 201, JSON.stringify(response.body)); return response.body.node;
    };
    const node = await create("批量验收");
    const quote = await h.request<any>("a", "POST", "/api/billing/quote", { feature: "video.generate", quantity: 1, modelId: "video-a", providerId: "managed-video", resolution: "720p" });
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    const unit = quote.body.mode === "api-cost-plus" ? quote.body.authorizedCredits : quote.body.credits;
    const intent = { expectedRevision: node.revision, idempotencyKey: randomUUID(), count: 4, billingVersion: quote.body.version, billingCredits: unit * 4 };
    const url = `/api/canvas/video-nodes/${node.id}/batch`, beforeNodes = await h.dbCount("app_canvas_video_nodes");
    assert.equal((await h.request("b", "POST", url, intent)).status, 404);
    assert.equal((await h.request("a", "POST", url, { ...intent, billingCredits: unit * 4 + 1 })).status, 409);
    assert.equal(await h.dbCount("app_canvas_video_nodes"), beforeNodes);
    const started = await h.request<any>("a", "POST", url, intent);
    assert.equal(started.status, 202, JSON.stringify(started.body));
    assert.equal(started.body.nodeIds.length, 4); assert.equal(started.body.run.nodes.length, 4);
    assert.ok(started.body.run.nodes.every((n: any) => n.taskId), JSON.stringify(started.body.run.nodes));
    assert.equal(await h.dbCount("app_canvas_video_nodes"), beforeNodes + 3);
    const taskCount = await h.dbCount("app_video_tasks"), balance = await h.creditState("a");
    const replay = await h.request<any>("a", "POST", url, intent);
    assert.equal(replay.status, 202, JSON.stringify(replay.body)); assert.deepEqual(replay.body.taskIds.sort(), started.body.taskIds.sort());
    assert.equal(await h.dbCount("app_video_tasks"), taskCount); assert.deepEqual(await h.creditState("a"), balance);
    assert.equal((await h.request("a", "POST", url, { ...intent, count: 2 })).status, 409);
    assert.equal((await h.request("b", "GET", `${url}?batchId=${intent.idempotencyKey}`)).status, 404);
    assert.equal((await h.request("a", "GET", `${url}?batchId=${intent.idempotencyKey}`)).status, 200);
    for (const taskId of started.body.taskIds) {
      const task = await h.taskPersistence("a", taskId);
      assert.equal(task.parameters.request.batchCount, undefined); assert.equal(task.parameters.request.generateAudio, false); assert.equal(task.parameters.request.durationSeconds, 4);
      assert.equal(task.parameters.request.resolution, "720p"); assert.equal(task.parameters.request.prompt, node.config.prompt);
    }
    const long = "甲：完整对白不得省略。\n".repeat(70) + "{{ref 1}} 最后一句对白。";
    const optimized = await h.request<any>("a", "POST", "/api/prompt-assist", { tool: "canvas-video", mode: "optimize", idea: long });
    assert.equal(optimized.status, 200, JSON.stringify(optimized.body)); assert.equal(optimizerSource, long); assert.ok(optimized.body.prompt.includes(long));
    corrupt = true; assert.equal((await h.request("a", "POST", "/api/prompt-assist", { tool: "canvas-video", mode: "optimize", idea: long })).status, 502); corrupt = false;
    console.log("VIDEO_CONTROLS_API=PASS ownership price_preflight atomic_nodes repeat_submit frozen_parameters full_prompt_reference_guard");

    const ui = await create("视频参数验收"), errors: string[] = [];
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: "nv_user", value: h.cookies.a.slice("nv_user=".length), url: h.baseUrl, httpOnly: true, sameSite: "Lax" }, { name: "naumi_locale", value: "zh", url: h.baseUrl }]);
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${h.baseUrl}/canvas?node=${ui.id}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    const nodeElement = page.locator(`[data-id="${ui.id}"]`).getByTestId("canvas-video-node");
    await nodeElement.waitFor({ state: "visible", timeout: 180000 });
    await nodeElement.getByRole("button", { name: "视频节点设置", exact: true }).click({ force: true });
    const dock = page.getByTestId("video-node-dock"); await dock.waitFor();
    await dock.getByRole("button", { name: "视频生成参数", exact: true }).click();
    let panel = page.getByRole("dialog", { name: "视频生成参数", exact: true });
    await panel.getByRole("button", { name: "1080P", exact: true }).click();
    await panel.getByRole("slider", { name: "视频时长", exact: true }).focus();
    await panel.getByRole("slider", { name: "视频时长", exact: true }).press("End");
    await expect(panel.getByRole("button", { name: "1080P", exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "9:16", exact: true }).click();
    await panel.getByRole("button", { name: "关闭", exact: true }).last().click(); // Audio off (header uses a separate close button).
    await panel.getByRole("button", { name: "2 个视频", exact: true }).click();
    await page.screenshot({ path: `${evidence}/parameters-desktop.png` });
    await page.keyboard.press("Escape");
    await expect(dock.getByRole("button", { name: "视频生成参数", exact: true })).toContainText("9:16 · 720P · 12s · 2 个视频");
    await dock.getByRole("button", { name: "提示词优化", exact: true }).click();
    const optimizer = page.getByRole("dialog", { name: "提示词优化", exact: true });
    await expect(optimizer.getByLabel("优化预览", { exact: true })).toHaveValue(/镜头缓慢推进/);
    assert.equal(await dock.getByLabel("视频描述", { exact: true }).inputValue(), ui.config.prompt);
    await optimizer.getByRole("button", { name: "应用提示词", exact: true }).click();
    await expect(dock.getByLabel("视频描述", { exact: true })).toHaveValue(/镜头缓慢推进/);
    await page.setViewportSize({ width: 390, height: 680 });
    await dock.getByRole("button", { name: "视频生成参数", exact: true }).click();
    panel = page.getByRole("dialog", { name: "视频生成参数", exact: true });
    const bounds = await panel.boundingBox(); assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 680);
    await panel.getByRole("button", { name: "4 个视频", exact: true }).scrollIntoViewIfNeeded();
    await panel.getByRole("button", { name: "4 个视频", exact: true }).click();
    await page.screenshot({ path: `${evidence}/parameters-mobile.png` }); await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 900 });
    await dock.getByRole("button", {name:"保存设置",exact:true}).click();
    await expect(dock.getByTestId("video-composer-prompt")).toHaveValue(/镜头缓慢推进/);
    await expect.poll(async()=>(await h.request<any>("a","GET",`/api/canvas/video-nodes/${ui.id}`)).body.node.config.batchCount).toBe(4);
    await page.reload({waitUntil:"domcontentloaded"});
    await nodeElement.waitFor({state:"visible",timeout:180000});
    await nodeElement.getByRole("button", {name:"视频节点设置",exact:true}).click({force:true});
    await expect(dock.getByRole("button",{name:"视频生成参数",exact:true})).toContainText("4 个视频");
    const batchResponse = page.waitForResponse(r => r.url().endsWith(`/video-nodes/${ui.id}/batch`) && r.request().method() === "POST", { timeout: 180000 });
    await dock.getByRole("button", { name: "生成视频", exact: true }).click();
    const generated = await batchResponse; assert.equal(generated.status(), 202, await generated.text());
    const payload = await generated.json(); assert.equal(payload.nodeIds.length, 4);
    await expect(page.getByTestId("canvas-video-node")).toHaveCount(4, { timeout: 30000 });
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${evidence}/batch-nodes.png` });
    await writeFile(`${evidence}/result.json`, JSON.stringify({ fixture: true, realPaidSupplierCalls: 0, api: "passed", browser: "passed", desktopAndMobile: true, batchCount: 4, longPromptAndPreview: true }, null, 2));
    console.log(`VIDEO_CONTROLS_BROWSER=PASS ${evidence}`);
  } catch (error) {
    if (browser) for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: `${evidence}/failure.png` }).catch(() => {});
    console.error(h.logs.slice(-8).join("\n")); throw error;
  } finally { await browser?.close(); await h.stop(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
