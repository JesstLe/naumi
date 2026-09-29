// Isolated browser acceptance for the text -> image canvas workflow.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import pg from "pg";
import { chromium, request, expect } from "@playwright/test";

const output = path.resolve("output/canvas-text-node-smoke");
const distDir = `output/canvas-text-node-smoke/.next-${process.pid}`;
const tsconfigPath = path.resolve("tsconfig.json");
const originalTsconfig = await readFile(tsconfigPath);
await mkdir(output, { recursive: true });
const container = `naumi-text-node-${Date.now()}`;
const password = randomUUID();
const email = "canvas-text-node@local.test";
const generatedText = "标题：轻盈随行保温杯\n卖点：长效保温，单手轻松携带";
const generatedImage = await sharp({
  create: { width: 768, height: 768, channels: 4, background: "#e8f0ff" },
}).png().toBuffer();
const textRequests = [];
const imageRequests = [];
const report = [];
const appLog = [];
const pageErrors = [];
const normalizeLines = (value) => String(value).replace(/\r\n/g, "\n");
const pass = (message) => {
  report.push(`PASS ${message}`);
  console.log(report.at(-1));
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let app, fixture, pool, api, browser, page;

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

try {
  execFileSync("docker", [
    "run", "-d", "--name", container,
    "-e", "POSTGRES_USER=fixture",
    "-e", `POSTGRES_PASSWORD=${password}`,
    "-e", "POSTGRES_DB=fixture",
    "-p", "127.0.0.1::5432",
    "--tmpfs", "/var/lib/postgresql/data",
    "postgres:16-alpine",
  ], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", container, "5432"], { encoding: "utf8" }).trim();
  const database = `postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let i = 0; i < 60; i++) {
    try { await pool.query("select 1"); break; } catch { await sleep(300); }
  }

  fixture = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/chat/completions") {
      const body = JSON.parse(raw || "{}");
      textRequests.push(body);
      res.end(JSON.stringify({
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: generatedText } }],
      }));
      return;
    }
    if (req.url === "/v1/images/generations" || req.url === "/v1/images/edits") {
      let prompt = raw;
      try { prompt = JSON.parse(raw).prompt || raw; } catch {}
      imageRequests.push({ url: req.url, prompt, raw });
      res.end(JSON.stringify({ data: [{ b64_json: generatedImage.toString("base64") }] }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const provider = `http://127.0.0.1:${fixture.address().port}/v1`;
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: {
      ...process.env,
      DATABASE_URL: database,
      SETTINGS_SECRET: randomUUID(),
      ADMIN_EMAIL: email,
      NAUMI_EDITION: "cloud",
      NAUMI_MULTI_USER: "1",
      NAUMI_PUBLIC_COMMERCE: "0",
      MEDIA_DIR: path.join(output, "media"),
      STORAGE_DRIVER: "local",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      SMTP_HOST: "",
      AGENT_API_KEY: "fixture-agent-key",
      AGENT_BASE_URL: provider,
      AGENT_MODEL: "fixture-text-model",
      OPENAI_TEXT_MODEL: "",
      OPENAI_API_KEY: "fixture-image-key",
      OPENAI_BASE_URL: provider,
      OPENAI_IMAGE_MODEL: "gpt-image-2",
      OPENAI_IMAGE_MODELS: "gpt-image-2",
      NEW_API_IMAGE_BASE_URL: "",
      NEW_API_IMAGE_API_KEY: "",
      NEW_API_IMAGE_MODELS: "",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_DIST_DIR: distDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => appLog.push(chunk.toString()));
  app.stderr.on("data", (chunk) => appLog.push(chunk.toString()));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await sleep(500);
  }
  assert(ready, "Next.js did not become ready");

  api = await request.newContext({ baseURL: base, timeout: 120_000 });
  const registration = await api.post("/api/auth/register", {
    data: { email, password, name: "文字工作流验收" },
  });
  assert.equal(registration.status(), 200, await registration.text());

  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({
    storageState: await api.storageState(),
    viewport: { width: 1600, height: 1000 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  });
  await context.addCookies([{ name: "naumi_locale", value: "zh", url: base }]);
  page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${base}/canvas`);
  await page.getByRole("button", { name: /^营销文案/ }).click();

  const textNode = page.locator('.react-flow__node[data-id^="text-"]');
  await expect(textNode).toHaveCount(1, { timeout: 30_000 });
  const textPrompt = page.getByPlaceholder(/描述你的问题、文案或内容需求/);
  await expect(textPrompt).toHaveValue(/生成可直接使用的标题/);
  const initialPromptBox = await textPrompt.boundingBox();
  assert(initialPromptBox && initialPromptBox.height >= 108 && initialPromptBox.height <= 130);
  const composerDock = page.getByTestId("text-node-dock");
  await composerDock.evaluate((element) => {
    element.style.height = "150px";
  });
  await page.waitForTimeout(100);
  const protectedDockBox = await composerDock.boundingBox();
  const protectedPromptBox = await textPrompt.boundingBox();
  assert(protectedDockBox && protectedDockBox.height >= 210);
  assert(protectedPromptBox && protectedPromptBox.height >= 108);
  await composerDock.evaluate((element) => {
    element.style.height = "";
  });
  await page.waitForTimeout(100);
  await textPrompt.fill("长文本 ".repeat(180));
  await expect.poll(async () => (await textPrompt.boundingBox())?.height || 0).toBeGreaterThan(115);
  const cappedPromptBox = await textPrompt.boundingBox();
  assert(cappedPromptBox && cappedPromptBox.height <= 246);
  const dockBeforeResize = await composerDock.boundingBox();
  assert(dockBeforeResize, "text composer dock is missing");
  await composerDock.evaluate((element) => {
    (element).style.height = "360px";
  });
  await page.waitForTimeout(100);
  const dockAfterResize = await composerDock.boundingBox();
  const promptAfterResize = await textPrompt.boundingBox();
  assert(dockAfterResize && dockAfterResize.height >= 330);
  assert(
    promptAfterResize &&
      promptAfterResize.height >= 280 &&
      promptAfterResize.height >= cappedPromptBox.height + 40,
    `manual resize did not sufficiently expand prompt: capped=${cappedPromptBox.height}, resized=${promptAfterResize?.height}, dock=${dockAfterResize?.height}`,
  );
  await textPrompt.fill("根据商品信息生成可直接使用的标题、卖点与详情文案");
  await page.getByTitle("展开编辑窗口").click();
  await expect(page.getByTitle("收起编辑窗口")).toBeVisible();
  await page.getByTitle("收起编辑窗口").click();
  pass("macOS browser profile keeps at least five prompt lines, grows with content, protects the resize floor, and supports windowed expansion");

  await page.getByTitle(/文字模型/).click();
  await page.getByRole("button", { name: "自定义模型 ID" }).click();
  await page.getByPlaceholder("例如 gpt-5.6-luna").fill("fixture-custom-text");
  await page.getByRole("button", { name: "使用此模型" }).click();
  await page.getByTitle("文字生成").click();
  await expect(textNode).toContainText(generatedText, { timeout: 30_000 });
  assert.equal(textRequests.length, 1);
  assert.equal(textRequests[0].model, "fixture-custom-text");
  assert.match(textRequests[0].messages.at(-1).content, /商品信息/);
  pass("marketing-copy workflow creates a persisted text node and calls the configured text model");

  const sourceHandle = textNode.locator(".react-flow__handle.source");
  const handleBox = await sourceHandle.boundingBox();
  assert(handleBox, "text output handle is missing");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 150, handleBox.y - 120, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".menu-pop").getByRole("button", { name: "图形生成" })).toBeVisible();
  await page.locator(".menu-pop").getByRole("button").first().click();
  const pendingNode = page.locator('.react-flow__node[data-id^="pend-"]');
  await expect(pendingNode).toHaveCount(1);
  const imagePrompt = page.getByPlaceholder(/描述想生成的画面/);
  await expect(imagePrompt).toHaveValue(generatedText);
  await page.getByTitle("切换底色（黑/白）").evaluate((button) => button.click());
  await expect(pendingNode.locator(".canvas-ui-node-card")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByTestId("pending-node-dock")).toHaveCSS("background-color", "rgba(255, 255, 255, 0.96)");
  await page.getByTitle("切换底色（黑/白）").evaluate((button) => button.click());
  pass("dragging the text output to blank canvas creates an image node with generated copy as its prompt");

  await page.getByRole("button", { name: "↑", exact: true }).click();
  let generatedArtwork;
  await expect.poll(async () => {
    const account = await (await api.get(`/api/account?email=${email}`)).json();
    generatedArtwork = account.artworks.find((item) => item.origin === "canvas");
    return Boolean(generatedArtwork);
  }, { timeout: 120_000 }).toBe(true);
  assert(
    imageRequests.some((item) => normalizeLines(item.prompt).includes(generatedText)),
    JSON.stringify(imageRequests)
  );

  let textState;
  await expect.poll(async () => {
    textState = await (await api.get(`/api/canvas/text-nodes?email=${email}`)).json();
    return textState.nodes?.[0]?.targetIds?.includes(generatedArtwork.id) ?? false;
  }, { timeout: 30_000 }).toBe(true);
  assert.equal(textState.persisted, true);
  assert.equal(textState.nodes.length, 1);
  const persistedTextNode = textState.nodes[0];
  assert.equal(persistedTextNode.status, "completed");
  assert.equal(persistedTextNode.content, generatedText);
  assert.deepEqual(persistedTextNode.targetIds, [generatedArtwork.id]);
  assert.equal(generatedArtwork.groupId, persistedTextNode.projectKey.replace(/^tree:/, ""));
  assert.equal(normalizeLines(generatedArtwork.prompt), generatedText);
  pass("text-to-image generation keeps project ownership, prompt, and persistent target linkage");

  // 等生成完成后的单节点聚焦动画落稳，再适应全部节点，避免两个视口动画互相覆盖。
  await page.waitForTimeout(1000);
  await page.getByTitle("适应视图").click();
  await page.waitForTimeout(1200);
  for (let attempt = 0; attempt < 2 && !(await textNode.isVisible()); attempt++) {
    await page.getByTitle("适应视图").click();
    await page.waitForTimeout(1200);
  }
  await expect(textNode).toBeVisible();
  await textNode.click();
  const resizeHandle = textNode.locator(
    ".react-flow__resize-control.handle.bottom.right"
  );
  await expect(resizeHandle).toBeVisible();
  const resizeHandleBox = await resizeHandle.boundingBox();
  assert(resizeHandleBox, "text node resize handle is missing");
  await page.mouse.move(
    resizeHandleBox.x + resizeHandleBox.width / 2,
    resizeHandleBox.y + resizeHandleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(resizeHandleBox.x + 140, resizeHandleBox.y + 90, {
    steps: 16,
  });
  await page.mouse.up();
  let resizedTextNode;
  await expect.poll(async () => {
    textState = await (await api.get(`/api/canvas/text-nodes?email=${email}`)).json();
    resizedTextNode = textState.nodes?.find((node) => node.id === persistedTextNode.id);
    return Boolean(resizedTextNode?.width > 300 && resizedTextNode?.height > 176);
  }, { timeout: 30_000 }).toBe(true);
  assert(resizedTextNode.width <= 1200);
  assert(resizedTextNode.height <= 1200);
  pass("text node can be freely resized and persists its width and height");

  const editableOutput = textNode.getByLabel("编辑生成文本");
  await editableOutput.fill("已人工编辑的逆向提示词内容");
  await expect(editableOutput).toHaveValue("已人工编辑的逆向提示词内容");
  await page.waitForTimeout(150);
  await editableOutput.press("Tab");
  await expect.poll(async () => {
    const state = await (await api.get(`/api/canvas/text-nodes?email=${email}`)).json();
    return state.nodes?.find((node) => node.id === persistedTextNode.id)?.content;
  }, { timeout: 30_000 }).toBe("已人工编辑的逆向提示词内容");
  pass("generated and reverse-prompt node text is directly editable and persists on blur");

  const textToolbar = page.getByTestId("text-node-toolbar");
  const textDock = page.getByTestId("text-node-dock");
  const textDockFooter = page.getByTestId("text-node-dock-footer");
  const textNodeCard = textNode.getByTestId("text-node-card");
  const projectChrome = page.getByTestId("canvas-project-chrome");
  const topActions = page.getByTestId("canvas-top-actions");
  const mainToolbar = page.getByTestId("canvas-main-toolbar");
  const viewToolbar = page.getByTestId("canvas-view-toolbar");
  const textGenerateButton = textDock.getByTitle("文字生成");
  await expect(textToolbar).toBeVisible();
  await expect(textToolbar.getByRole("button", { name: "智能帮写" })).toBeVisible();
  await expect(textToolbar.getByRole("button", { name: "生成图片" })).toBeVisible();
  await expect(textToolbar.getByRole("button", { name: "添加图片引用" })).toBeVisible();
  await expect(textDock).toHaveCSS("background-color", "rgb(25, 27, 33)");
  await expect(textPrompt).toHaveCSS("color", "rgb(231, 233, 238)");
  await expect(textPrompt).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(textDockFooter).toHaveCSS("border-top-color", "rgb(42, 45, 54)");
  await expect(textGenerateButton).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(textToolbar).toHaveCSS("background-color", "rgba(25, 27, 33, 0.96)");
  await expect(textNodeCard).toHaveCSS("background-color", "rgb(25, 27, 33)");
  const textNodeTitle = textNode.getByTestId("text-node-title");
  await expect(textNodeTitle).toHaveCSS("color", "rgb(226, 230, 237)");
  await page.getByTitle("切换底色（黑/白）").evaluate((button) => button.click());
  await expect(textNodeTitle).toHaveCSS("color", "rgb(48, 54, 65)");
  await expect(textDock).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(textPrompt).toHaveCSS("color", "rgb(48, 54, 65)");
  await expect(textPrompt).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(textDockFooter).toHaveCSS("border-top-color", "rgb(237, 240, 243)");
  await expect(textGenerateButton).toHaveCSS("background-color", "rgb(32, 36, 44)");
  await expect(textToolbar).toHaveCSS("background-color", "rgba(255, 255, 255, 0.96)");
  await expect(textToolbar).toHaveCSS("border-color", "rgb(217, 223, 231)");
  await expect(textNodeCard).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(editableOutput).toHaveCSS("color", "rgb(37, 42, 51)");
  await expect(projectChrome).toHaveCSS("background-color", "rgba(255, 255, 255, 0.96)");
  await expect(mainToolbar).toHaveCSS("background-color", "rgba(255, 255, 255, 0.96)");
  await expect(viewToolbar).toHaveCSS("background-color", "rgba(255, 255, 255, 0.96)");
  await expect(topActions.locator("button").first()).toHaveCSS("background-color", "rgba(255, 255, 255, 0.96)");
  await page.getByRole("button", { name: /%$/ }).click();
  await expect(page.locator(".menu-pop-up").last()).toHaveCSS("background-color", "rgba(255, 255, 255, 0.96)");
  await page.locator("div.fixed.inset-0.z-40").last().click({ position: { x: 4, y: 4 } });
  await page.screenshot({ path: path.join(output, "light-theme.png"), fullPage: true });
  await page.getByTitle("切换底色（黑/白）").evaluate((button) => button.click());
  await expect(textNodeTitle).toHaveCSS("color", "rgb(226, 230, 237)");
  await expect(textToolbar).toHaveCSS("border-color", "rgb(42, 45, 54)");
  pass("light canvas adapts project chrome, top actions, both toolbars, text cards, text dock, and popup menus while preserving dark mode");

  for (const viewport of [
    { width: 2560, height: 1440 },
    { width: 1366, height: 768 },
    { width: 1024, height: 640 },
    { width: 768, height: 600 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const dock = page.getByTestId("text-node-dock");
    await expect(dock).toBeVisible();
    await expect.poll(async () => {
      const box = await dock.boundingBox();
      return Boolean(
        box &&
        box.x >= -1 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y >= -1 &&
        box.y + box.height <= viewport.height + 1
      );
    }).toBe(true);
    const dockBox = await dock.boundingBox();
    assert(dockBox, `text dock missing at ${viewport.width}x${viewport.height}`);
    assert(dockBox.x >= -1, JSON.stringify({ viewport, dockBox }));
    assert(dockBox.x + dockBox.width <= viewport.width + 1, JSON.stringify({ viewport, dockBox }));
    assert(dockBox.y >= -1, JSON.stringify({ viewport, dockBox }));
    assert(dockBox.y + dockBox.height <= viewport.height + 1, JSON.stringify({ viewport, dockBox }));
    await expect.poll(async () => {
      const box = await page.getByTestId("text-node-toolbar").boundingBox();
      return Boolean(box && box.x >= -1 && box.x + box.width <= viewport.width + 1);
    }).toBe(true);
    const toolbarBox = await page.getByTestId("text-node-toolbar").boundingBox();
    assert(toolbarBox, `text toolbar missing at ${viewport.width}x${viewport.height}`);
    assert(toolbarBox.x >= -1, JSON.stringify({ viewport, toolbarBox }));
    assert(toolbarBox.x + toolbarBox.width <= viewport.width + 1, JSON.stringify({ viewport, toolbarBox }));
    assert.equal(
      await page.getByPlaceholder(/描述你的问题、文案或内容需求/).evaluate(
        (element) => getComputedStyle(element).resize
      ),
      "none"
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true
    );
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  pass("text dock stays inside 2560px, 1366px, 1024px, 768px, and 390px viewports with a freely resizable input");

  await page.getByRole("button", { name: "100%", exact: true }).click();
  await page.getByRole("button", { name: "缩放至50%" }).click();
  await page.waitForTimeout(300);
  await textNode.click();
  await page.getByTestId("text-node-dock").getByTitle("添加图片引用").click();
  await page.locator("button").filter({ hasText: "@标题：轻盈随行保温杯" }).last().click();
  await expect(page.getByText(`@${generatedArtwork.title}`, { exact: true }).first()).toBeVisible();
  const imageContextPrompt = "根据引用图片写一段商品外观描述";
  await page.getByPlaceholder(/描述你的问题、文案或内容需求/).fill(imageContextPrompt);
  await page.getByTitle("文字生成").click();
  await expect.poll(() => textRequests.length, { timeout: 30_000 }).toBe(2);
  const multimodalRequest = textRequests[1];
  const multimodalContent = multimodalRequest.messages.at(-1).content;
  assert(Array.isArray(multimodalContent), JSON.stringify(multimodalContent));
  assert(multimodalContent.some((part) => part.type === "image_url"));
  assert(
    multimodalContent.some(
      (part) => part.type === "text" && part.text.includes(imageContextPrompt) && part.text.includes(generatedArtwork.title)
    ),
    JSON.stringify(multimodalContent)
  );
  const imagePart = multimodalContent.find((part) => part.type === "image_url");
  assert.match(imagePart.image_url.url, /^data:image\//);

  await expect.poll(async () => {
    textState = await (await api.get(`/api/canvas/text-nodes?email=${email}`)).json();
    return textState.nodes?.some(
      (node) => node.sourceIds?.includes(generatedArtwork.id) && node.status === "completed"
    ) ?? false;
  }, { timeout: 30_000 }).toBe(true);
  pass("adding an image context auto-mentions it and sends a real multimodal request");

  await page.waitForTimeout(300);
  const generatedImageNode = page.locator(
    `.react-flow__node[data-id="${generatedArtwork.id}"]`
  );
  await generatedImageNode.click();
  await page.getByTitle("切换底色（黑/白）").evaluate((button) => button.click());
  await expect(page.getByTestId("image-node-dock")).toHaveCSS("background-color", "rgba(255, 255, 255, 0.96)");
  await expect(page.getByTestId("image-node-dock").locator(".canvas-ui-control").first()).toHaveCSS("background-color", "rgb(244, 246, 248)");
  await page.getByTitle("切换底色（黑/白）").evaluate((button) => button.click());
  const imageSourceHandle = generatedImageNode.locator(".react-flow__handle.source");
  await expect.poll(() => imageSourceHandle.evaluate(element => getComputedStyle(element).opacity)).toBe("1");
  const imageHandleBox = await imageSourceHandle.boundingBox();
  assert(imageHandleBox, "image output handle is missing");
  await page.mouse.move(
    imageHandleBox.x + imageHandleBox.width / 2,
    imageHandleBox.y + imageHandleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(330, 780, { steps: 20 });
  await page.mouse.up();
  await expect(page.locator(".menu-pop").getByRole("button", { name: "图形生成" })).toBeVisible();
  await expect(page.locator(".menu-pop").getByRole("button", { name: "文字生成" })).toBeVisible();
  await page.locator(".menu-pop").getByRole("button", { name: "文字生成" }).click();
  await expect(page.locator('.react-flow__node[data-id^="text-"]')).toHaveCount(2);
  await expect.poll(async () => {
    textState = await (await api.get(`/api/canvas/text-nodes?email=${email}`)).json();
    return textState.nodes?.filter((node) => node.sourceIds?.includes(generatedArtwork.id)).length ?? 0;
  }, { timeout: 30_000 }).toBe(2);
  pass("dragging an image output to blank canvas creates a new text node with the image in context");

  textState = await (await api.get(`/api/canvas/text-nodes?email=${email}`)).json();
  const textNodeBeforeReload = textState.nodes?.find((node) => node.id === persistedTextNode.id);
  assert(textNodeBeforeReload, "persisted text node missing before refresh");
  await page.reload();
  await expect(page.locator('.react-flow__node[data-id^="text-"]')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator(`.react-flow__node[data-id="${generatedArtwork.id}"]`)).toHaveCount(1);
  await expect(page.locator('.react-flow__edge[data-id^="e-text-"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge[data-id^="e-image-text-"]')).toHaveCount(2);
  await expect(page.getByText(`@${generatedArtwork.title}`, { exact: true }).first()).toBeVisible();
  const restoredTextNode = page.locator(
    `.react-flow__node[data-id="${persistedTextNode.id}"]`
  );
  await expect(restoredTextNode).toHaveCSS("width", `${textNodeBeforeReload.width}px`);
  await expect(restoredTextNode).toHaveCSS("height", `${textNodeBeforeReload.height}px`);
  await restoredTextNode.click();
  await expect(page.getByPlaceholder(/描述你的问题、文案或内容需求/)).toHaveValue(generatedText);
  assert.deepEqual(pageErrors, []);
  pass("refresh restores text size, both connection directions, image @mention, and dock content without browser runtime errors");

  console.log(`MODIFIED_RESULT=PASS TEXT_MODEL=fixture-text-model IMAGE_ID=${generatedArtwork.id} checks=${report.length}`);
} catch (error) {
  report.push(`FAIL ${error.stack || error}`);
  if (page) await page.screenshot({ path: path.join(output, "FAILURE.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, "test.log"), `${report.join("\n")}\n`);
  await writeFile(path.join(output, "next.log"), appLog.join(""));
  await browser?.close();
  await api?.dispose();
  await pool?.end();
  if (app?.pid) {
    if (process.platform === "win32") {
      try { execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "pipe" }); } catch {}
    } else app.kill("SIGTERM");
  }
  if (fixture) await new Promise((resolve) => fixture.close(resolve));
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); } catch {}
  await rm(path.resolve(distDir), { recursive: true, force: true });
  await writeFile(tsconfigPath, originalTsconfig);
}
