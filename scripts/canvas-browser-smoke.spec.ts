import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";
import path from "node:path";

test.use({
  baseURL: process.env.CANVAS_BASE_URL || "http://localhost",
  channel: "chrome",
  headless: true,
  actionTimeout: 10_000,
  launchOptions: { args: ["--disable-gpu", "--disable-dev-shm-usage"] },
});

test.setTimeout(120_000);

test("canvas browser workflow", async ({ context, page }) => {
  const email = process.env.CANVAS_SMOKE_EMAIL || "canvas-e2e@local.test";
  const password = process.env.CANVAS_SMOKE_PASSWORD;
  expect(password, "请设置 CANVAS_SMOKE_PASSWORD").toBeTruthy();
  const api = context.request;
  const sample = path.resolve("public/demos/suite-before.webp");

  const account = async () => {
    const response = await api.get(`/api/account?email=${encodeURIComponent(email)}`);
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const clean = async () => {
    const current = await account();
    const activeIds = (current.artworks || []).map((work: { id: string }) => work.id);
    if (activeIds.length) {
      const response = await api.post("/api/artworks/delete", { data: { email, ids: activeIds } });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    const trashResponse = await api.get(`/api/artworks/trash?email=${encodeURIComponent(email)}`);
    expect(trashResponse.ok(), await trashResponse.text()).toBeTruthy();
    const trash = await trashResponse.json();
    const trashIds = (trash.artworks || []).map((work: { id: string }) => work.id);
    if (trashIds.length) {
      const response = await api.post("/api/artworks/trash", {
        data: { email, action: "purge", ids: trashIds },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    const projectsResponse = await api.get(`/api/projects?email=${encodeURIComponent(email)}`);
    expect(projectsResponse.ok(), await projectsResponse.text()).toBeTruthy();
    const projects = await projectsResponse.json();
    for (const key of Object.keys(projects.names || {})) {
      const response = await api.delete("/api/projects", { data: { key } });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
  };

  const login = await context.request.post("/api/auth/login", {
    data: { email, password: password! },
  });
  expect(login.ok()).toBeTruthy();
  await context.addCookies([
    { name: "naumi_locale", value: "zh", domain: "localhost", path: "/" },
  ]);
  await clean();

  await page.goto("/canvas");
  await expect(page).toHaveTitle(/Naumi/);
  await expect(page.getByText("全部项目", { exact: true }).last()).toBeVisible();

  await page.getByRole("button", { name: /开始创作/ }).click();
  await expect(page.getByTitle("添加节点")).toBeEnabled();
  await page.getByTitle("添加节点").click({ force: true });
  await page.getByRole("button", { name: "上传图片", exact: true }).last().click();
  await page.locator('input[type="file"]').last().setInputFiles(sample);

  const rootNode = page.locator(".react-flow__node").filter({ hasText: path.basename(sample) }).first();
  await expect(rootNode).toBeVisible({ timeout: 20_000 });
  const rootId = await rootNode.getAttribute("data-id");
  expect(rootId).toBeTruthy();
  await expect.poll(async () =>
    rootNode.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
  ).toBeTruthy();
  await expect(rootNode.locator("img")).toHaveAttribute("src", /^\/media\//);

  await rootNode.click();
  const countInput = page.getByLabel("生成图片数量");
  await expect(countInput).toBeVisible();
  await countInput.fill("3");
  await expect(countInput).toHaveValue("3");
  await page.getByRole("button", { name: /普通/ }).click();
  await page.getByRole("button", { name: "三视图合成图" }).click();
  await expect(page.getByText("1 张合成图", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /三视图合成/ }).click();
  await page.getByRole("button", { name: "正 / 侧 / 背子节点" }).click();
  await expect(page.getByText("3 个节点", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "重做", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /三视图节点/ }).click();
  await page.getByRole("button", { name: "普通生成" }).click();
  await expect(countInput).toHaveValue("3");
  await page.getByRole("button", { name: "✏️", exact: true }).click();
  const nodeName = "浏览器画布节点";
  const nodeRename = page.getByPlaceholder("项目名称").last();
  await nodeRename.fill(nodeName);
  await nodeRename.press("Enter");
  await expect(page.getByText(nodeName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "标记", exact: true }).click();
  await expect(page.getByRole("button", { name: "取消标记", exact: true })).toBeVisible();
  await expect.poll(async () => {
    const marked = (await account()).artworks.find((work: { id: string }) => work.id === rootId);
    return marked?.marked;
  }).toBe(true);

  const beforeDrag = (await account()).artworks.find((work: { id: string }) => work.id === rootId);
  const box = await page.locator(`.react-flow__node[data-id="${rootId}"]`).boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 18);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 140, box!.y + 98, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => {
    const moved = (await account()).artworks.find((work: { id: string }) => work.id === rootId);
    return moved?.canvasX !== beforeDrag?.canvasX || moved?.canvasY !== beforeDrag?.canvasY;
  }).toBeTruthy();

  const projectName = "浏览器端到端项目";
  await page.locator('button[title="重命名"]').first().click();
  const projectRename = page.getByPlaceholder("项目名称").last();
  await projectRename.fill(projectName);
  await projectRename.press("Enter");
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();

  await page.locator(`.react-flow__node[data-id="${rootId}"]`).click({ button: "right" });
  await page.getByText("创建副本", { exact: true }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  const withDuplicate = await account();
  const duplicate = withDuplicate.artworks.find((work: { title: string }) => work.title === `${nodeName} 副本`);
  expect(duplicate?.id).toBeTruthy();

  // 显式框选 → 批量工具条 → 将两张图建立为一个多输入生成节点。
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByTitle("框选节点").click();
  const rootBox = await page.locator(`.react-flow__node[data-id="${rootId}"]`).boundingBox();
  const duplicateBox = await page.locator(`.react-flow__node[data-id="${duplicate.id}"]`).boundingBox();
  expect(rootBox).toBeTruthy();
  expect(duplicateBox).toBeTruthy();
  const left = Math.min(rootBox!.x, duplicateBox!.x) - 18;
  const top = Math.min(rootBox!.y, duplicateBox!.y) - 18;
  const right = Math.max(rootBox!.x + rootBox!.width, duplicateBox!.x + duplicateBox!.width) + 18;
  const bottom = Math.max(rootBox!.y + rootBox!.height, duplicateBox!.y + duplicateBox!.height) + 18;
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 12 });
  await page.mouse.up();
  const batchActions = page.getByLabel("批量操作");
  await expect(batchActions).toBeVisible();
  await expect(batchActions.getByText("已选 2 个", { exact: true })).toBeVisible();

  // 拖动任意一个已选节点时，两张图应整组移动并分别持久化坐标。
  const beforeBatchMove = await account();
  const rootBeforeBatchMove = beforeBatchMove.artworks.find(
    (work: { id: string }) => work.id === rootId
  );
  const duplicateBeforeBatchMove = beforeBatchMove.artworks.find(
    (work: { id: string }) => work.id === duplicate.id
  );
  const selectedRootBox = await page.locator(`.react-flow__node[data-id="${rootId}"]`).boundingBox();
  expect(selectedRootBox).toBeTruthy();
  await page.mouse.move(selectedRootBox!.x + selectedRootBox!.width / 2, selectedRootBox!.y + 18);
  await page.mouse.down();
  await page.mouse.move(
    selectedRootBox!.x + selectedRootBox!.width / 2 + 80,
    selectedRootBox!.y + 68,
    { steps: 10 }
  );
  await page.mouse.up();
  await expect.poll(async () => {
    const moved = await account();
    const movedRoot = moved.artworks.find((work: { id: string }) => work.id === rootId);
    const movedDuplicate = moved.artworks.find(
      (work: { id: string }) => work.id === duplicate.id
    );
    return (
      (movedRoot?.canvasX !== rootBeforeBatchMove?.canvasX ||
        movedRoot?.canvasY !== rootBeforeBatchMove?.canvasY) &&
      (movedDuplicate?.canvasX !== duplicateBeforeBatchMove?.canvasX ||
        movedDuplicate?.canvasY !== duplicateBeforeBatchMove?.canvasY)
    );
  }).toBeTruthy();
  await expect(batchActions).toBeVisible();

  await batchActions.getByRole("button", { name: "批量标记", exact: true }).click();
  await expect(batchActions.getByRole("button", { name: "取消标记", exact: true })).toBeVisible();
  await batchActions.getByRole("button", { name: "合并生成节点", exact: true }).click();
  await expect(page.getByText("2 张输入 · 合并生成到此节点", { exact: true })).toBeVisible();
  const mergePend = page.locator('.react-flow__node[data-id^="pend-"]').first();
  await expect(mergePend).toBeVisible();
  const mergePendId = await mergePend.getAttribute("data-id");
  expect(mergePendId).toBeTruthy();
  await expect(page.locator(`.react-flow__edge[data-id$="-${mergePendId}"]`)).toHaveCount(2);
  await mergePend.hover();
  await mergePend.getByTitle("删除空白节点").click({ force: true });
  await expect(page.locator('.react-flow__node[data-id^="pend-"]')).toHaveCount(0);

  // 合并节点可切换为详情图组：4 表示 4 个有顺序的 A+ 分镜，不是同提示词随机四版。
  await page.getByTitle("框选节点").click();
  const detailRootBox = await page.locator(`.react-flow__node[data-id="${rootId}"]`).boundingBox();
  const detailDuplicateBox = await page
    .locator(`.react-flow__node[data-id="${duplicate.id}"]`)
    .boundingBox();
  expect(detailRootBox).toBeTruthy();
  expect(detailDuplicateBox).toBeTruthy();
  await page.mouse.move(
    Math.min(detailRootBox!.x, detailDuplicateBox!.x) - 18,
    Math.min(detailRootBox!.y, detailDuplicateBox!.y) - 18
  );
  await page.mouse.down();
  await page.mouse.move(
    Math.max(detailRootBox!.x + detailRootBox!.width, detailDuplicateBox!.x + detailDuplicateBox!.width) + 18,
    Math.max(detailRootBox!.y + detailRootBox!.height, detailDuplicateBox!.y + detailDuplicateBox!.height) + 18,
    { steps: 12 }
  );
  await page.mouse.up();
  await page.getByLabel("批量操作").getByRole("button", { name: "合并生成节点" }).click();
  await page.getByRole("button", { name: "普通", exact: true }).click();
  await page.getByRole("button", { name: "详情图组（按顺序生成）", exact: true }).click();
  await page.getByLabel("生成图片数量").fill("4");
  await expect(page.getByText("2 张参考 · 按顺序生成 4 张详情图", { exact: true })).toBeVisible();
  let detailRequestBody = "";
  await page.route("**/api/aplus**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      detailRequestBody = request.postData() || "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jobId: "detail-sequence-fake", total: 4, next: "generating" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "error", error: "detail mock done" }),
    });
  });
  await page.getByTitle("生成").last().click();
  await expect.poll(() => detailRequestBody, { timeout: 10_000 }).not.toBe("");
  expect(detailRequestBody).toContain('name="prepared"');
  expect(detailRequestBody).toContain('name="module"');
  for (const moduleKey of ["hero", "selling", "scene", "angles"]) {
    expect(detailRequestBody).toContain(moduleKey);
  }
  expect(detailRequestBody.indexOf("hero")).toBeLessThan(detailRequestBody.indexOf("selling"));
  expect(detailRequestBody.indexOf("selling")).toBeLessThan(detailRequestBody.indexOf("scene"));
  expect(detailRequestBody.indexOf("scene")).toBeLessThan(detailRequestBody.indexOf("angles"));
  await expect(page.getByText("detail mock done", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.unroute("**/api/aplus**");
  const detailPend = page.locator('.react-flow__node[data-id^="pend-"]').first();
  await detailPend.hover();
  await detailPend.getByTitle("删除空白节点").click({ force: true });

  // 同一批选择还可以按画布空间顺序直接拼成一张可下载、可继续衍生的详情长图。
  await page.getByTitle("框选节点").click();
  const stitchRootBox = await page.locator(`.react-flow__node[data-id="${rootId}"]`).boundingBox();
  const stitchDuplicateBox = await page
    .locator(`.react-flow__node[data-id="${duplicate.id}"]`)
    .boundingBox();
  expect(stitchRootBox).toBeTruthy();
  expect(stitchDuplicateBox).toBeTruthy();
  await page.mouse.move(
    Math.min(stitchRootBox!.x, stitchDuplicateBox!.x) - 18,
    Math.min(stitchRootBox!.y, stitchDuplicateBox!.y) - 18
  );
  await page.mouse.down();
  await page.mouse.move(
    Math.max(stitchRootBox!.x + stitchRootBox!.width, stitchDuplicateBox!.x + stitchDuplicateBox!.width) + 18,
    Math.max(stitchRootBox!.y + stitchRootBox!.height, stitchDuplicateBox!.y + stitchDuplicateBox!.height) + 18,
    { steps: 12 }
  );
  await page.mouse.up();
  await page.getByLabel("批量操作").getByRole("button", { name: "拼接长图" }).click();
  await expect(page.getByText("详情长图 · 2 张", { exact: true })).toBeVisible({ timeout: 20_000 });
  const afterStitch = await account();
  const longImage = afterStitch.artworks.find(
    (work: { title: string }) => work.title === "详情长图 · 2 张"
  );
  expect(longImage?.id).toBeTruthy();
  expect(longImage?.ratio).toBe("long");
  expect(longImage?.parentId).toBe(rootId);
  expect(longImage?.parentIds).toEqual([duplicate.id]);
  await api.post("/api/artworks/delete", { data: { email, ids: [longImage.id] } });
  await api.post("/api/artworks/trash", {
    data: { email, action: "purge", ids: [longImage.id] },
  });
  await page.reload();

  // 两个独立节点同时生图时，必须出现两个任务节点；期间仍可新建普通节点。
  let fakeJobSeq = 0;
  const fakePolls = new Map<string, number>();
  const submittedCounts: string[] = [];
  await page.route("**/api/generate-image**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postData() || "";
      const countMatch = body.match(/name="count"\r?\n\r?\n([^\r\n]+)/);
      submittedCounts.push(countMatch?.[1] || "");
      fakeJobSeq += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jobId: `canvas-fake-${fakeJobSeq}` }),
      });
      return;
    }
    const jobId = new URL(request.url()).searchParams.get("job") || "unknown";
    const polls = (fakePolls.get(jobId) || 0) + 1;
    fakePolls.set(jobId, polls);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        polls < 3 ? { status: "pending" } : { status: "error", error: "mock done" }
      ),
    });
  });
  await page.locator(`.react-flow__node[data-id="${rootId}"]`).click();
  await page.getByLabel("生成图片数量").fill("3");
  await page.getByTitle("生成新版本", { exact: true }).click();
  await page.getByLabel("关闭").last().click();
  await page.locator(`.react-flow__node[data-id="${duplicate.id}"]`).click();
  await expect(page.getByText(new RegExp(`引用.*${nodeName} 副本`))).toBeVisible();
  await page.getByTitle("生成新版本", { exact: true }).click();
  await expect(page.locator('.react-flow__node[data-id^="task-"]')).toHaveCount(2);
  await expect.poll(() => submittedCounts).toEqual(["3", "3"]);
  await expect(page.getByTitle("添加节点").last()).toBeEnabled();
  await page.locator(".react-flow__pane").click({
    button: "right",
    position: { x: 80, y: 80 },
    force: true,
  });
  await page.getByText("添加节点", { exact: true }).last().click();
  await expect(page.locator('.react-flow__node[data-id^="pend-"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__node[data-id^="task-"]')).toHaveCount(0, {
    timeout: 12_000,
  });
  await page.unroute("**/api/generate-image**");

  // 三节点模式必须先产出正面锚点，再并发提交引用锚点的侧面/背面任务。
  await page.reload();
  await page.locator(`.react-flow__node[data-id="${rootId}"]`).click();
  const splitBodies: string[] = [];
  let splitSeq = 0;
  await page.route("**/api/generate-image**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      splitSeq += 1;
      splitBodies.push(request.postData() || "");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jobId: `split-fake-${splitSeq}` }),
      });
      return;
    }
    const jobId = new URL(request.url()).searchParams.get("job") || "split-fake-0";
    const index = Number(jobId.split("-").at(-1)) || 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "done",
        images: [{ id: `split-art-${index}`, url: beforeDrag.image }],
      }),
    });
  });
  await page.getByRole("button", { name: /普通/ }).click();
  await page.getByRole("button", { name: "正 / 侧 / 背子节点" }).click();
  await page.getByTitle("生成新版本", { exact: true }).click();
  await expect.poll(() => splitBodies.length, { timeout: 20_000 }).toBe(3);
  expect(splitBodies[0]).toContain("正面标准视图");
  expect(splitBodies.some((body) => body.includes("侧面标准视图"))).toBe(true);
  expect(splitBodies.some((body) => body.includes("背面标准视图"))).toBe(true);
  expect(
    splitBodies.filter((body) => body.includes("正面锚点")).length
  ).toBe(2);
  await page.unroute("**/api/generate-image**");
  await page.reload();

  const linkedResponse = await api.post("/api/artworks/add", {
    data: {
      email,
      parentId: rootId,
      linked: true,
      src: {
        image: beforeDrag.image,
        title: "浏览器连线节点",
        category: "main",
        prompt: "line check",
      },
    },
  });
  expect(linkedResponse.ok(), await linkedResponse.text()).toBeTruthy();
  const linked = await linkedResponse.json();
  await page.reload();
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${rootId}"]`)).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${linked.id}"]`)).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.locator(".react-flow__edge-interaction").click({ force: true });
  await expect(page.locator(".react-flow__edge")).toHaveCount(0);
  await expect.poll(async () => {
    const current = await account();
    const child = current.artworks.find((work: { id: string }) => work.id === linked.id);
    return child?.parentId == null && (child?.parentIds || []).length === 0;
  }).toBeTruthy();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTitle("下载本项目").click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(download.suggestedFilename()).toMatch(/\.zip$/i);
  expect(downloadPath).toBeTruthy();
  expect((await stat(downloadPath!)).size).toBeGreaterThan(100);

  const duplicateNode = page.locator(`.react-flow__node[data-id="${duplicate.id}"]`);
  await duplicateNode.click({ button: "right" });
  await page.getByText("删除", { exact: true }).last().click();
  await page.getByRole("button", { name: "确定删除", exact: true }).click();
  await expect.poll(async () => !(await account()).artworks.some((work: { id: string }) => work.id === duplicate.id)).toBeTruthy();
  await page.locator(".react-flow__pane").click({ button: "right", position: { x: 260, y: 180 }, force: true });
  await page.getByText("撤销", { exact: true }).click();
  await expect.poll(async () => (await account()).artworks.some((work: { id: string }) => work.id === duplicate.id)).toBeTruthy();

  await page.locator(`.react-flow__node[data-id="${duplicate.id}"]`).click({ button: "right" });
  await page.getByText("删除", { exact: true }).last().click();
  await page.getByRole("button", { name: "确定删除", exact: true }).click();
  await page.getByRole("button", { name: "回收站", exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByText("删除的作品保留 180 天", { exact: true })).toBeVisible();
  await expect(page.getByAltText(`${nodeName} 副本`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "恢复", exact: true }).last().click();
  await expect.poll(async () => (await account()).artworks.some((work: { id: string }) => work.id === duplicate.id)).toBeTruthy();

  await page.reload();
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();
  await expect(page.getByText(nodeName, { exact: true })).toBeVisible();
  await page.locator(`.react-flow__node[data-id="${rootId}"]`).click();
  await expect(page.getByRole("button", { name: "取消标记", exact: true })).toBeVisible();
  await clean();
});
