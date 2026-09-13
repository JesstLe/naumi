import { expect, test } from "@playwright/test";

test.use({
  baseURL: process.env.AGENT_BASE_URL || "http://127.0.0.1:3012",
  channel: "chrome",
  headless: true,
  actionTimeout: 15_000,
  launchOptions: { args: ["--disable-gpu", "--disable-dev-shm-usage"] },
});

test.setTimeout(8 * 60_000);

test("Agent 历史会话切换、重命名与删除", async ({ context, page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const email = `agent-sessions-${suffix}@local.test`;
  const password = `Agent-${suffix}-Pass!`;
  const registered = await context.request.post("/api/auth/register", {
    data: { email, password, name: "Agent 会话验收" },
  });
  expect(registered.ok(), await registered.text()).toBeTruthy();

  const firstId = `history-first-${suffix}`;
  const secondId = `history-second-${suffix}`;
  for (const [id, title, content] of [
    [firstId, "第一条商品精修", "第一条历史消息"],
    [secondId, "第二条套图任务", "第二条历史消息"],
  ]) {
    const saved = await context.request.post("/api/agent/session", {
      data: {
        id,
        title,
        messages: [
          { role: "user", content },
          { role: "assistant", content: `${content}的回复` },
        ],
        steps: [],
      },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
  }

  await page.goto("/agent");
  await expect(page.getByText("历史会话", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^第二条套图任务 / })).toBeVisible();
  await page.getByRole("button", { name: /^第一条商品精修 / }).click();
  await expect(page.getByText("第一条历史消息", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "重命名 第一条商品精修" }).click();
  const titleInput = page.getByRole("textbox", { name: "会话名称" });
  await titleInput.fill("秋季商品精修方案");
  await page.getByRole("button", { name: "保存会话名称" }).click();
  await expect(page.getByRole("button", { name: /^秋季商品精修方案 / })).toBeVisible();
  if (process.env.AGENT_CAPTURE_UI) {
    await page.screenshot({ path: "test-results/agent-sessions-desktop.png", fullPage: true });
  }

  await page.getByRole("button", { name: "删除 秋季商品精修方案" }).click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByText("秋季商品精修方案", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "新建会话" }).click();
  await expect(page.getByText("下达一个完整任务", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开历史会话" }).click();
  await expect(page.getByText("第二条套图任务", { exact: true })).toBeVisible();
  if (process.env.AGENT_CAPTURE_UI) {
    await page.screenshot({ path: "test-results/agent-sessions-mobile.png", fullPage: true });
  }
  await page.getByRole("button", { name: "关闭历史会话", exact: true }).click();
  await expect(page.getByRole("button", { name: "打开历史会话" })).toBeVisible();
});

test("Agent 真实编排、SSE、视觉质检与刷新恢复", async ({ context, page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const email = process.env.AGENT_E2E_EMAIL || `agent-e2e-${suffix}@local.test`;
  const password = process.env.AGENT_E2E_PASSWORD || `Agent-${suffix}-Pass!`;
  const reuse = Boolean(process.env.AGENT_E2E_EMAIL && process.env.AGENT_E2E_PASSWORD);
  const auth = await context.request.post(reuse ? "/api/auth/login" : "/api/auth/register", {
    data: { email, password, name: "Agent 端到端验收" },
  });
  expect(auth.ok(), await auth.text()).toBeTruthy();

  await page.goto("/agent");
  await expect(page.getByRole("heading", { name: "Agent 任务模式" })).toBeVisible();
  const panel = page.locator(".bg-c-card").last();
  const color = await panel.evaluate((element) => getComputedStyle(element).backgroundColor);
  const rgb = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || [];
  expect(rgb.length).toBe(3);
  expect(rgb.reduce((sum, channel) => sum + channel, 0)).toBeGreaterThan(500);

  if (reuse) {
    await expect(page.locator('img[src*="/media/"]').last()).toBeVisible({ timeout: 20_000 });
    await page.locator("details").last().evaluate((details) => {
      (details as HTMLDetailsElement).open = true;
    });
    await expect(page.getByText("verify_image_output", { exact: true })).toBeVisible();
    return;
  }

  const composer = page.getByPlaceholder(/描述任务/);
  await composer.fill("请查询我当前的积分余额，然后用一句话告诉我结果，不要生成图片。");
  await page.getByRole("button", { name: "发送任务" }).click();
  await expect(page.getByText(/Agent 正在执行/)).toBeVisible();
  const firstTrace = page.getByText(/执行轨迹/).last();
  await expect(firstTrace).toBeVisible({ timeout: 90_000 });
  await firstTrace.click();
  await expect(page.getByText("get_balance", { exact: true })).toBeVisible();

  const sessionsResponse = await context.request.get("/api/agent/session");
  expect(sessionsResponse.ok(), await sessionsResponse.text()).toBeTruthy();
  const sessions = await sessionsResponse.json();
  expect(sessions.sessions.length).toBeGreaterThan(0);
  const sessionId = sessions.sessions[0].id as string;
  const savedResponse = await context.request.get(
    `/api/agent/session?id=${encodeURIComponent(sessionId)}`
  );
  expect(savedResponse.ok(), await savedResponse.text()).toBeTruthy();
  const saved = await savedResponse.json();
  expect(saved.session.messages.length).toBeGreaterThanOrEqual(2);
  expect(saved.session.steps.some((step: { type?: string }) => step.type === "plan")).toBeTruthy();
  expect(
    saved.session.steps.some(
      (step: { type?: string; tool?: string }) =>
        step.type === "tool_end" && step.tool === "get_balance"
    )
  ).toBeTruthy();

  await page.reload();
  await page.getByText(/执行轨迹/).last().click();
  await expect(page.getByText("get_balance", { exact: true })).toBeVisible({ timeout: 20_000 });

  await composer.fill(
    "生成一张 1:1 的纯白背景红苹果商品主图，苹果主体完整居中、不被裁切、没有文字；生成后必须用视觉模型检查主体完整性和白底要求，只生成 1 张。"
  );
  await page.getByRole("button", { name: "发送任务" }).click();
  await expect(page.getByText(/Agent 正在执行/)).toBeVisible();
  const verificationStep = page.getByText("verify_image_output", { exact: true });
  await expect(verificationStep).toHaveCount(1, { timeout: 5 * 60_000 });
  await page.locator("details").last().evaluate((details) => {
    (details as HTMLDetailsElement).open = true;
  });
  await expect(verificationStep).toBeVisible();
  await expect(page.locator('img[src*="/media/"]').last()).toBeVisible();

  await page.reload();
  await page.locator("details").last().evaluate((details) => {
    (details as HTMLDetailsElement).open = true;
  });
  await expect(page.getByText("verify_image_output", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const restoredImage = page.locator('img[src*="/media/"]').last();
  await expect(restoredImage).toBeVisible();
  await expect
    .poll(() => restoredImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
    .toBeTruthy();
});

test("Agent 插话与停止控制", async ({ context, page }) => {
  page.on("console", (message) => console.log(`[browser:${message.type()}] ${message.text()}`));
  page.on("pageerror", (error) => console.log(`[browser:error] ${error.message}`));
  page.on("requestfailed", (request) =>
    console.log(`[browser:requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText}`)
  );
  page.on("response", (response) => {
    if (response.url().includes("/api/")) {
      console.log(`[browser:response] ${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const email = `agent-control-${suffix}@local.test`;
  const password = `Agent-${suffix}-Pass!`;
  const registered = await context.request.post("/api/auth/register", {
    data: { email, password, name: "Agent 控制验收" },
  });
  expect(registered.ok(), await registered.text()).toBeTruthy();
  await page.goto("/agent");
  const composer = page.getByPlaceholder(/描述任务/);
  await composer.fill("生成 4 张不同构图的 1:1 白底蓝色马克杯商品图，主体完整，不要文字。");
  await page.getByRole("button", { name: "发送任务" }).click();
  await expect(composer).toHaveValue("");
  const interject = page.getByPlaceholder(/插话修正/);
  await expect(interject).toBeVisible();
  await interject.fill("改成只生成 1 张，不要继续生成其余版本。");
  await page.getByRole("button", { name: "插话", exact: true }).click({ force: true });
  await expect(interject).toHaveValue("");
  await page.getByRole("button", { name: "停止", exact: true }).click({ force: true });
  await expect(page.getByText(/Agent 正在执行/)).toBeHidden({ timeout: 20_000 });
});
