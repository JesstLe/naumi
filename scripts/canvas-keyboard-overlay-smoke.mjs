import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const output = path.resolve("output/canvas-keyboard-overlay-smoke");
const distDir = `output/canvas-keyboard-overlay-smoke/.next-${process.pid}`;
const tsconfigPath = path.resolve("tsconfig.json");
const originalTsconfig = await readFile(tsconfigPath);
const report = [];
const appLog = [];
const pageErrors = [];
let app;
let browser;

const pass = (message) => {
  report.push(`PASS ${message}`);
  console.log(report.at(-1));
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

try {
  await mkdir(output, { recursive: true });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const email = `canvas-keyboard-${process.pid}@local.test`;

  app = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
    {
      env: {
        ...process.env,
        DATABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        NAUMI_MULTI_USER: "0",
        NAUMI_PUBLIC_COMMERCE: "0",
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_DIST_DIR: distDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  app.stdout.on("data", (chunk) => appLog.push(chunk.toString()));
  app.stderr.on("data", (chunk) => appLog.push(chunk.toString()));

  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {
      // Next.js is still compiling.
    }
    await sleep(500);
  }
  assert(ready, "Next.js did not become ready");

  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--disable-gpu"],
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  });
  await context.addCookies([{ name: "naumi_locale", value: "zh", url: base }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const pressCanvasShortcut = (shortcut) =>
    page.evaluate((value) => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const parts = value.split("+");
      const key = parts.at(-1);
      const event = new KeyboardEvent("keydown", {
        key,
        code: key?.length === 1 ? `Key${key.toUpperCase()}` : key,
        ctrlKey: parts.includes("Control"),
        metaKey: parts.includes("Meta"),
        altKey: parts.includes("Alt"),
        shiftKey: parts.includes("Shift"),
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }, shortcut);

  await page.goto(base);
  await page.evaluate(({ email: accountEmail }) => {
    const now = new Date();
    const textNodeId = "text-keyboard-fixture";
    const projectKey = `tree:${textNodeId}`;
    localStorage.setItem("naumi:last-email", accountEmail);
    localStorage.setItem(
      `naumi:user:${accountEmail}`,
      JSON.stringify({
        name: "Windows 快捷键验收",
        email: accountEmail,
        plan: "starter",
        creditsTotal: 1000,
        creditsUsed: 0,
        joinedAt: now.toISOString(),
        renewsAt: new Date(now.getTime() + 30 * 86400_000).toISOString(),
        invoices: [],
      })
    );
    localStorage.setItem("nv:canvas:last", projectKey);
    localStorage.setItem(
      `naumi:canvas-text-nodes:${accountEmail.toLowerCase()}`,
      JSON.stringify([
        {
          id: textNodeId,
          projectKey,
          title: "快捷键验收节点",
          prompt: "验证 Windows 与 macOS 画布快捷键",
          content: "",
          status: "idle",
          canvasX: 120,
          canvasY: 120,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          width: 380,
          height: 240,
          sourceIds: [],
          targetIds: [],
          productIds: [],
        },
      ])
    );
  }, { email });
  await page.goto(`${base}/canvas`);
  await expect(page.locator(".react-flow__pane")).toBeVisible();

  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(1);
  await page.waitForTimeout(300);
  const originalNodeId = await nodes.first().getAttribute("data-id");
  assert(originalNodeId, "marketing-copy workflow did not create its text node");
  await pressCanvasShortcut("Control+Shift+T");
  await pressCanvasShortcut("Alt+Shift+T");
  await page.waitForTimeout(100);
  await expect(nodes).toHaveCount(1);
  pass("Windows Ctrl+Shift+T and Alt+Shift+T do not create canvas nodes");

  assert.equal(await pressCanvasShortcut("Shift+T"), true);
  await expect(nodes).toHaveCount(2);
  pass("plain Shift+T still creates one text node");

  await page.getByTitle(email).click();
  const accountMenu = page.getByRole("menu", { name: "账户" });
  await expect(accountMenu).toBeVisible();
  await page.waitForTimeout(100);
  const overlayNodeIds = (await nodes.evaluateAll((items) =>
    items.map((item) => item.getAttribute("data-id")).filter(Boolean).sort()
  ));
  assert(overlayNodeIds.includes(originalNodeId));
  for (const shortcut of [
    "Delete",
    "Backspace",
    "Control+C",
    "Control+V",
    "Control+Z",
    "Control+Y",
    "Shift+T",
    "Control+Shift+T",
  ]) {
    const overlayCount = (await accountMenu.isVisible()) ? 1 : 0;
    assert(overlayCount > 0, `${shortcut} ran without an overlay`);
    await pressCanvasShortcut(shortcut);
    await page.waitForTimeout(30);
    const currentNodeIds = (await nodes.evaluateAll((items) =>
      items.map((item) => item.getAttribute("data-id")).filter(Boolean).sort()
    ));
    assert.deepEqual(
      currentNodeIds,
      overlayNodeIds,
      `${shortcut} changed the canvas while ${overlayCount} overlay(s) were open`
    );
  }
  pass("account overlay blocks delete, clipboard, history, and node-creation shortcuts");

  await page.getByTitle(email).click();
  await expect(accountMenu).toBeHidden();

  await page.evaluate(() => {
    const blocker = document.createElement("div");
    blocker.dataset.canvasHotkeysBlocked = "true";
    blocker.id = "synthetic-canvas-hotkey-blocker";
    document.body.appendChild(blocker);
  });
  for (const shortcut of ["Delete", "Control+Z", "Shift+T"]) {
    await pressCanvasShortcut(shortcut);
    await page.waitForTimeout(30);
    assert.deepEqual(
      (await nodes.evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-id")).filter(Boolean).sort()
      )),
      overlayNodeIds
    );
  }
  await page.locator("#synthetic-canvas-hotkey-blocker").evaluate((element) => element.remove());
  pass("portal-owned overlay marker blocks the global canvas keyboard layer");

  assert.equal(await pressCanvasShortcut("Shift+T"), true);
  await expect(nodes).toHaveCount(overlayNodeIds.length + 1);
  assert.deepEqual(pageErrors, []);
  pass("canvas shortcuts resume after every overlay closes");

  console.log(`CANVAS_KEYBOARD_OVERLAY_RESULT=PASS checks=${report.length}`);
} catch (error) {
  report.push(`FAIL ${error.stack || error}`);
  throw error;
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "test.log"), `${report.join("\n")}\n`);
  await writeFile(path.join(output, "next.log"), appLog.join(""));
  await browser?.close();
  if (app?.pid) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], {
          stdio: "pipe",
        });
      } catch {
        // Process may already have exited.
      }
    } else {
      app.kill("SIGTERM");
    }
  }
  await rm(path.resolve(distDir), { recursive: true, force: true });
  await writeFile(tsconfigPath, originalTsconfig);
}
