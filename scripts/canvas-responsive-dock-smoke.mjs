// Responsive canvas acceptance for selected-node Dock safe areas and viewport recovery.
// Run against an already started local app:
//   $env:CANVAS_RESPONSIVE_BASE_URL='http://127.0.0.1:3000'; node scripts/canvas-responsive-dock-smoke.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.CANVAS_RESPONSIVE_BASE_URL || "http://127.0.0.1:3000";
const output = path.resolve("output/canvas-responsive-dock-smoke");
const projectKey = "tree:text-responsive-dock";
const nodeId = "text-responsive-dock";
const secondNodeId = "text-responsive-dock-2";
const imageProjectKey = "tree:image-responsive-dock";
const imageNodeId = "image-responsive-dock";
const imageOverlayTestIds = [
  "image-node-toolbar",
  "image-node-dock",
  "canvas-project-chrome",
  "canvas-top-actions",
  "canvas-main-toolbar",
  "canvas-view-toolbar",
];
const viewports = [
  { width: 1600, height: 1000 },
  { width: 1366, height: 768 },
  { width: 1093, height: 614 },
  { width: 1024, height: 768 },
  { width: 768, height: 900 },
  { width: 390, height: 844 },
];
const profiles = [
  {
    name: "mac",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  },
  {
    name: "windows",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  },
];

function overlaps(a, b, tolerance = 1) {
  const width = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  return width > tolerance && height > tolerance;
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--disable-gpu"],
});

try {
  for (const profile of profiles) {
    const email = `responsive-dock-${profile.name}@local.test`;
    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      userAgent: profile.userAgent,
    });
    await context.addInitScript(
      ({ fixtureEmail, fixtureProjectKey, fixtureNodeId, fixtureSecondNodeId }) => {
        const now = new Date().toISOString();
        localStorage.setItem(
          `naumi:user:${fixtureEmail}`,
          JSON.stringify({
            name: "Responsive Dock",
            email: fixtureEmail,
            plan: "starter",
            creditsTotal: 20,
            creditsUsed: 0,
            joinedAt: now,
            renewsAt: now,
            invoices: [],
          })
        );
        localStorage.setItem("naumi:last-email", fixtureEmail);
        localStorage.setItem("nv:canvas:bg", "light");
        localStorage.setItem("nv:canvas:last", fixtureProjectKey);
        localStorage.setItem(
          `naumi:canvas-text-nodes:${fixtureEmail}`,
          JSON.stringify([
            {
              id: fixtureNodeId,
              projectKey: fixtureProjectKey,
              title: "响应式提示词",
              prompt: "请根据商品信息生成标题、核心卖点与详情文案",
              content: "",
              status: "idle",
              canvasX: 500,
              canvasY: 300,
              createdAt: now,
              updatedAt: now,
              width: 380,
              height: 240,
              sourceIds: [],
              targetIds: [],
              productIds: [],
            },
            {
              id: fixtureSecondNodeId,
              projectKey: fixtureProjectKey,
              title: "第二个响应式提示词",
              prompt: "用于验证窄屏多选工具条不会越界或遮挡视图工具条",
              content: "",
              status: "idle",
              canvasX: 980,
              canvasY: 340,
              createdAt: now,
              updatedAt: now,
              width: 380,
              height: 240,
              sourceIds: [],
              targetIds: [],
              productIds: [],
            },
          ])
        );
      },
      {
        fixtureEmail: email,
        fixtureProjectKey: projectKey,
        fixtureNodeId: nodeId,
        fixtureSecondNodeId: secondNodeId,
      }
    );
    await context.addCookies([{ name: "naumi_locale", value: "zh", url: baseURL }]);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${baseURL}/canvas`);
    const selectedNode = page.locator(`.react-flow__node[data-id="${nodeId}"]`);
    await selectedNode.waitFor({ state: "visible" });
    await selectedNode.click();
    await page.getByTestId("text-node-dock").waitFor({ state: "visible" });
    await assert.doesNotReject(async () => {
      await page.getByTestId("text-batch-bar").waitFor({ state: "detached", timeout: 1_000 });
    });

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(650);
      const layout = await page.evaluate(() => {
        const box = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom,
          };
        };
        return {
          dock: box('[data-testid="text-node-dock"]'),
          node: box('[data-testid="text-node-card"]'),
          toolbar: box('[data-testid="text-node-toolbar"]'),
          project: box('[data-testid="canvas-project-chrome"]'),
          actions: box('[data-testid="canvas-top-actions"]'),
        };
      });

      const { width, height } = viewport;
      const expectedTop = width < 768 ? 108 : 64;
      const { dock, node, toolbar, project, actions } = layout;
      assert(dock && node && toolbar && project && actions, JSON.stringify(layout));
      assert(dock.x >= 7 && dock.right <= width - 7, `dock horizontal overflow: ${JSON.stringify(layout)}`);
      assert(dock.y >= expectedTop - 1, `dock crossed top safe area: ${JSON.stringify(layout)}`);
      assert(dock.bottom <= height - 71, `dock crossed bottom safe area: ${JSON.stringify(layout)}`);
      assert(dock.y >= project.bottom + 8, `dock overlaps project chrome: ${JSON.stringify(layout)}`);
      assert(dock.y >= actions.bottom + 8, `dock overlaps top actions: ${JSON.stringify(layout)}`);
      assert(node.x >= -1 && node.right <= width + 1, `selected node left viewport: ${JSON.stringify(layout)}`);
      assert(toolbar.x >= 7 && toolbar.right <= width - 7, `toolbar horizontal overflow: ${JSON.stringify(layout)}`);
      assert(
        dock.bottom <= toolbar.y - 8 || dock.y >= toolbar.bottom + 8,
        `dock overlaps selected-node toolbar: ${JSON.stringify(layout)}`
      );
      await page.screenshot({
        path: path.join(output, `${profile.name}-${width}x${height}.png`),
      });
      console.log(
        `PASS ${profile.name} ${width}x${height} safe-top=${Math.round(dock.y)} node=${Math.round(node.x)}..${Math.round(node.right)}`
      );
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTitle("适应视图").click();
    await page.waitForTimeout(500);
    const secondNode = page.locator(`.react-flow__node[data-id="${secondNodeId}"]`);
    await secondNode.click({ modifiers: ["Control"] });
    const batchBar = page.getByTestId("text-batch-bar");
    await batchBar.waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    assert.equal(await page.getByTestId("text-node-dock").count(), 0);
    assert.equal(await page.getByTestId("text-node-toolbar").count(), 0);
    const batchLayout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, right: box.right, bottom: box.bottom };
      };
      return {
        batch: rect('[data-testid="text-batch-bar"]'),
        view: rect('[data-testid="canvas-view-toolbar"]'),
      };
    });
    assert(batchLayout.batch && batchLayout.view, JSON.stringify(batchLayout));
    assert(batchLayout.batch.x >= 7 && batchLayout.batch.right <= 383, JSON.stringify(batchLayout));
    assert(batchLayout.batch.bottom <= batchLayout.view.y - 8, JSON.stringify(batchLayout));
    await page.screenshot({ path: path.join(output, `${profile.name}-390x844-multi.png`) });
    console.log(`PASS ${profile.name} 390x844 multi-select batch bar stays above view controls`);

    assert.deepEqual(pageErrors, []);
    await context.close();

    // Production parity: use a real image-node project shape and run the same
    // overlay matrix that guards the read-only production acceptance script.
    const imageEmail = `responsive-image-${profile.name}@local.test`;
    const imageNow = new Date().toISOString();
    const imageContext = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      userAgent: profile.userAgent,
    });
    await imageContext.addInitScript(
      ({ fixtureEmail, fixtureProjectKey }) => {
        const now = new Date().toISOString();
        localStorage.setItem(
          `naumi:user:${fixtureEmail}`,
          JSON.stringify({
            name: "Responsive Image",
            email: fixtureEmail,
            plan: "starter",
            creditsTotal: 20,
            creditsUsed: 0,
            joinedAt: now,
            renewsAt: now,
            invoices: [],
          })
        );
        localStorage.setItem("naumi:last-email", fixtureEmail);
        localStorage.setItem("nv:canvas:bg", "light");
        localStorage.setItem("nv:canvas:last", fixtureProjectKey);
      },
      { fixtureEmail: imageEmail, fixtureProjectKey: imageProjectKey }
    );
    await imageContext.addCookies([{ name: "naumi_locale", value: "zh", url: baseURL }]);
    await imageContext.route(/\/api\/account(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        json: {
          persisted: true,
          user: {
            name: "Responsive Image",
            email: imageEmail,
            plan: "starter",
            creditsTotal: 20,
            creditsUsed: 0,
            joinedAt: imageNow,
            renewsAt: imageNow,
            invoices: [],
          },
          artworks: [
            {
              id: imageNodeId,
              email: imageEmail,
              title: "产品.jpg",
              category: "main",
              prompt: "复杂商品图响应式回归",
              status: "completed",
              image: `${baseURL}/cutout-hero.jpg`,
              gradient: "from-slate-100 to-slate-200",
              source: "canvas-add",
              origin: "canvas",
              parentId: null,
              parentIds: [],
              groupId: imageNodeId,
              canvasGroupId: null,
              width: 3072,
              height: 1426,
              canvasWidth: 420,
              canvasHeight: 195,
              canvasX: -304,
              canvasY: 528,
              createdAt: imageNow,
            },
          ],
        },
      });
    });
    await imageContext.route(/\/api\/projects(?:\?.*)?$/, async (route) => {
      await route.fulfill({ json: { names: { [imageProjectKey]: "产品.jpg" } } });
    });
    await imageContext.route(/\/api\/canvas\/text-nodes(?:\?.*)?$/, async (route) => {
      await route.fulfill({ json: { persisted: true, nodes: [] } });
    });
    await imageContext.route(/\/api\/video\/tasks(?:\?.*)?$/, async (route) => {
      await route.fulfill({ json: { tasks: [] } });
    });

    const imagePage = await imageContext.newPage();
    const imagePageErrors = [];
    imagePage.on("pageerror", (error) => imagePageErrors.push(error.message));
    await imagePage.goto(`${baseURL}/canvas`);
    const imageNode = imagePage.locator(`.react-flow__node[data-id="${imageNodeId}"]`);
    await imageNode.waitFor({ state: "visible" });
    await imageNode.click({ force: true });
    await imagePage.getByTestId("image-node-toolbar").waitFor({ state: "visible" });
    await imagePage.getByTestId("image-node-dock").waitFor({ state: "visible" });

    for (const viewport of viewports) {
      await imagePage.setViewportSize(viewport);
      await imagePage.getByTitle("适应视图").click({ force: true });
      await imagePage.waitForTimeout(650);
      const layout = await imagePage.evaluate((testIds) => {
        const rect = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            x: box.x,
            y: box.y,
            right: box.right,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
            visible:
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number.parseFloat(style.opacity || "1") > 0.01,
          };
        };
        return {
          target: rect('.react-flow__node[data-id="image-responsive-dock"]'),
          overlays: Object.fromEntries(
            testIds.map((testId) => [
              testId,
              rect(`[data-testid="${testId}"]`),
            ])
          ),
        };
      }, imageOverlayTestIds);

      const { width, height } = viewport;
      assert(layout.target, JSON.stringify(layout));
      assert(layout.target.x >= -1 && layout.target.right <= width + 1, `image node outside viewport: ${JSON.stringify(layout)}`);
      for (const testId of imageOverlayTestIds) {
        const rect = layout.overlays[testId];
        assert(rect, `${testId} missing: ${JSON.stringify(layout)}`);
        assert(
          rect.x >= -1 && rect.y >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1,
          `${testId} outside ${width}x${height}: ${JSON.stringify(rect)}`
        );
      }
      for (let i = 0; i < imageOverlayTestIds.length; i += 1) {
        for (let j = i + 1; j < imageOverlayTestIds.length; j += 1) {
          const left = imageOverlayTestIds[i];
          const right = imageOverlayTestIds[j];
          assert(
            !layout.overlays[left].visible ||
              !layout.overlays[right].visible ||
              !overlaps(layout.overlays[left], layout.overlays[right]),
            `${left} overlaps ${right} at ${width}x${height}: ${JSON.stringify(layout)}`
          );
        }
      }
      await imagePage.screenshot({
        path: path.join(output, `${profile.name}-image-${width}x${height}.png`),
      });
      console.log(`PASS ${profile.name} image ${width}x${height} production overlay matrix`);
    }

    // The selected-node Dock and the main toolbar are mutually exclusive UI.
    // Verify the toolbar/view-control relationship again after clearing the
    // selection so hidden transition geometry cannot create false positives.
    for (const viewport of viewports.filter(({ width }) => width < 800)) {
      await imagePage.setViewportSize(viewport);
      await imagePage.locator(".react-flow__pane").click({
        position: { x: viewport.width - 5, y: Math.round(viewport.height / 2) },
        force: true,
      });
      await imagePage.waitForTimeout(300);
      const chrome = await imagePage.evaluate(() => {
        const rect = (testId) => {
          const element = document.querySelector(`[data-testid="${testId}"]`);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            x: box.x,
            y: box.y,
            right: box.right,
            bottom: box.bottom,
            visible:
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number.parseFloat(style.opacity || "1") > 0.99,
          };
        };
        return {
          main: rect("canvas-main-toolbar"),
          view: rect("canvas-view-toolbar"),
        };
      });
      assert(chrome.main?.visible && chrome.view?.visible, JSON.stringify(chrome));
      assert(
        !overlaps(chrome.main, chrome.view),
        `visible canvas toolbars overlap at ${viewport.width}x${viewport.height}: ${JSON.stringify(chrome)}`
      );
      await imagePage.screenshot({
        path: path.join(output, `${profile.name}-unselected-${viewport.width}x${viewport.height}.png`),
      });
      console.log(`PASS ${profile.name} ${viewport.width}x${viewport.height} visible canvas toolbars do not overlap`);
    }
    assert.deepEqual(imagePageErrors, []);
    await imageContext.close();
  }
  console.log(`MODIFIED_RESULT=PASS profiles=${profiles.length} viewports=${viewports.length}`);
} finally {
  await browser.close();
}
