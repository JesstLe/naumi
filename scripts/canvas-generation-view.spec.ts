import { expect, test } from "@playwright/test";

test.use({
  baseURL: process.env.CANVAS_BASE_URL || "http://localhost",
  channel: "chrome",
  headless: true,
  actionTimeout: 10_000,
  launchOptions: { args: ["--disable-gpu", "--disable-dev-shm-usage"] },
});

test.setTimeout(420_000);

test("generated child is visible on canvas and in works", async ({ context, page }) => {
  const email = process.env.CANVAS_SMOKE_EMAIL || "canvas-e2e@local.test";
  const password = process.env.CANVAS_SMOKE_PASSWORD;
  expect(password, "请设置 CANVAS_SMOKE_PASSWORD").toBeTruthy();
  const login = await context.request.post("/api/auth/login", { data: { email, password: password! } });
  expect(login.ok(), await login.text()).toBeTruthy();
  await context.addCookies([
    { name: "naumi_locale", value: "zh", domain: "localhost", path: "/" },
  ]);
  const accountResponse = await context.request.get(`/api/account?email=${encodeURIComponent(email)}`);
  expect(accountResponse.ok(), await accountResponse.text()).toBeTruthy();
  const account = await accountResponse.json();
  const child = (account.artworks || []).find(
    (work: { origin?: string; parentId?: string | null }) => work.origin === "canvas" && work.parentId
  );
  expect(child?.id).toBeTruthy();
  const creditsBefore = (account.user.creditsTotal || 0) - (account.user.creditsUsed || 0);

  await page.goto(`/canvas?node=${encodeURIComponent(child.id)}`);
  await expect(page.locator(`.react-flow__node[data-id="${child.id}"]`)).toBeVisible({ timeout: 20_000 });
  expect(await page.locator(".react-flow__edge").count()).toBeGreaterThanOrEqual(1);
  await expect.poll(async () =>
    page.locator(`.react-flow__node[data-id="${child.id}"] img`).evaluate(
      (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
    )
  ).toBeTruthy();

  const nodeCount = await page.locator(".react-flow__node").count();
  await page.getByPlaceholder(/描述你想怎么改/).fill("保留主体，改成纯白电商棚拍背景");
  await page.getByRole("button", { name: "↑", exact: true }).click();
  await expect(page.getByText("生成中…", { exact: true }).first()).toBeVisible();
  let after: typeof account | undefined;
  let derived: { id: string; parentId?: string | null; origin?: string } | undefined;
  await expect.poll(async () => {
    const response = await context.request.get(`/api/account?email=${encodeURIComponent(email)}`);
    if (!response.ok()) return false;
    after = await response.json();
    derived = (after!.artworks || []).find(
      (work: { id: string; parentId?: string | null; origin?: string }) =>
        work.id !== child.id && work.parentId === child.id && work.origin === "canvas"
    );
    return !!derived;
  }, { timeout: 360_000 }).toBeTruthy();
  expect(derived?.id).toBeTruthy();
  await expect(page.locator(`.react-flow__node[data-id="${derived!.id}"]`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".react-flow__node")).toHaveCount(nodeCount + 1);
  await expect(page.getByText("生成中…", { exact: true })).toHaveCount(0);
  const creditsAfter = (after!.user.creditsTotal || 0) - (after!.user.creditsUsed || 0);
  expect(creditsAfter).toBeLessThanOrEqual(creditsBefore);
  expect(after!.user.creditsUsed || 0).toBe(0);

  await page.goto("/works");
  await expect(page.locator(`img[src*="${derived!.id}"]`).first()).toBeVisible({ timeout: 20_000 });
});
