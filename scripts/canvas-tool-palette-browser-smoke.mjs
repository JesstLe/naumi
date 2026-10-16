#!/usr/bin/env node
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { chromium, request, expect } from "@playwright/test";

const output = path.resolve("output/canvas-tool-palette-smoke");
await mkdir(output, { recursive: true });
const container = `naumi-canvas-tools-${Date.now()}`;
const password = randomUUID();
const email = "canvas-tool-palette@local.test";
const appLog = [];
const report = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = message => { report.push(`PASS ${message}`); console.log(report.at(-1)); };
let app, pool, api, browser, page;

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

try {
  execFileSync("docker", ["run", "-d", "--name", container, "-e", "POSTGRES_USER=fixture", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=fixture", "-p", "127.0.0.1::5432", "--tmpfs", "/var/lib/postgresql/data", "postgres:16-alpine"], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", container, "5432"], { encoding: "utf8" }).trim();
  const database = `postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let i = 0; i < 60; i++) { try { await pool.query("select 1"); break; } catch { await sleep(300); } }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: { ...process.env, DATABASE_URL: database, SETTINGS_SECRET: randomUUID(), ADMIN_EMAIL: email, NAUMI_EDITION: "cloud", NAUMI_MULTI_USER: "1", NAUMI_PUBLIC_COMMERCE: "0", MEDIA_DIR: path.join(output, "media"), STORAGE_DRIVER: "local", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SMTP_HOST: "", OPENAI_API_KEY: "fixture", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", chunk => appLog.push(chunk.toString()));
  app.stderr.on("data", chunk => appLog.push(chunk.toString()));
  let ready = false;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {} await sleep(500); }
  assert(ready, "Next server did not become ready");

  api = await request.newContext({ baseURL: base, timeout: 120000 });
  const registration = await api.post("/api/auth/register", { data: { email, password, name: "工具栏验收" } });
  assert.equal(registration.status(), 200, await registration.text());
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ storageState: await api.storageState(), viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "naumi_locale", value: "zh", url: base }]);
  page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`${base}/canvas`);
  await page.getByRole("button", { name: /开始创作/ }).click();
  await page.locator(".react-flow").waitFor();

  const palette = page.getByTestId("canvas-main-toolbar");
  await expect(palette).toBeVisible();
  const paletteBox = await palette.boundingBox();
  assert(paletteBox && paletteBox.width > 400 && paletteBox.width < 520, JSON.stringify(paletteBox));
  assert(Math.abs((paletteBox.x + paletteBox.width / 2) - 720) < 2 && paletteBox.y + paletteBox.height <= 881, JSON.stringify(paletteBox));
  assert.equal(await palette.locator("button").count(), 11);
  const addBox = await palette.getByTestId("canvas-add-node-button").boundingBox();
  const moveBox = await palette.locator('[data-tool="move"]').boundingBox();
  assert(addBox && moveBox && addBox.width === moveBox.width && addBox.height === moveBox.height, "add and move containers must match");
  pass("desktop canvas exposes a centered bottom Photoshop-style palette");

  await palette.locator('[data-tool="hand"]').click();
  await expect(palette.locator('[data-tool="hand"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".react-flow")).toHaveClass(/canvas-hand-tool/);
  await page.keyboard.press("m");
  await expect(palette.locator('[data-tool="marquee"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".react-flow")).toHaveClass(/canvas-box-select/);
  await page.keyboard.press("v");
  await expect(palette.locator('[data-tool="move"]')).toHaveAttribute("aria-pressed", "true");
  pass("V M H switch move, marquee, and hand interaction modes");

  await palette.getByTestId("canvas-add-node-button").click();
  const createMenu = page.getByTestId("canvas-create-menu");
  await expect(createMenu).toBeVisible();
  await expect(createMenu.getByRole("menuitem")).toHaveCount(3);
  await expect(createMenu.locator('[data-action="image-node"]')).toBeVisible();
  await expect(createMenu.locator('[data-action="video-node"]')).toBeVisible();
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, "desktop-create-flyout.png"), fullPage: true });
  await createMenu.locator('[data-action="text"]').click();
  const textDock = page.getByTestId("text-node-dock");
  await expect(textDock).toBeVisible();
  await expect(palette).toBeVisible();
  await page.waitForTimeout(350);
  const dockBox = await textDock.boundingBox();
  const paletteWithDockBox = await palette.boundingBox();
  const dockGeometry = await textDock.evaluate(element => ({
    style: element.getAttribute("style"),
    parent: element.parentElement?.getBoundingClientRect().toJSON(),
  }));
  assert(dockBox && paletteWithDockBox && dockBox.y + dockBox.height <= paletteWithDockBox.y, JSON.stringify({ dockBox, paletteWithDockBox, dockGeometry }));
  pass("text creation from the full menu keeps its dock above the persistent bottom palette");

  await page.keyboard.press("Escape");
  await page.locator(".react-flow__pane").click({ position: { x: 1050, y: 650 }, force: true });
  await palette.locator('[data-tool="more"]').click();
  const moreMenu = page.getByTestId("canvas-more-tools-menu");
  await expect(moreMenu).toHaveAttribute("aria-label", "画布设置");
  await expect(moreMenu.locator('[data-action="theme"]')).toBeVisible();
  await expect(moreMenu.locator('[data-action="help"]')).toBeVisible();
  const viewToolbar = page.getByTestId("canvas-view-toolbar");
  for (const label of ["整理画布", "小地图", "网格吸附", "适应视图"]) await expect(viewToolbar.getByRole("button", { name: label, exact: true })).toBeVisible();
  await page.waitForTimeout(180);
  await page.screenshot({ path: path.join(output, "desktop-more-tools.png"), fullPage: true });
  pass("settings contain appearance/help only; view tools are not duplicated");

  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const mobileBox = await palette.boundingBox();
  assert(mobileBox && mobileBox.x >= 8 && mobileBox.x + mobileBox.width <= 382, JSON.stringify(mobileBox));
  assert(mobileBox.width <= 374 && mobileBox.y >= 700 && mobileBox.y + mobileBox.height <= 768, JSON.stringify(mobileBox));
  assert.equal(await palette.locator("button").count(), 11);
  assert(await palette.evaluate(el => el.scrollWidth <= el.clientWidth), "390px palette must expose all 11 controls without scrolling");
  const mobileDockBox = await textDock.boundingBox();
  assert(mobileDockBox && mobileDockBox.x >= 8 && mobileDockBox.x + mobileDockBox.width <= 382, JSON.stringify(mobileDockBox));
  assert(mobileDockBox.y + mobileDockBox.height <= mobileBox.y, JSON.stringify({ mobileDockBox, mobileBox }));
  await page.screenshot({ path: path.join(output, "mobile-palette.png"), fullPage: true });
  assert.deepEqual(pageErrors, []);
  pass("390px layout keeps the bottom palette and text dock separated inside the viewport without runtime errors");
  console.log("CANVAS_TOOL_PALETTE_BROWSER_RESULT=PASS checks=4 screenshots=3");
} catch (error) {
  report.push(`FAIL ${error.stack || error}`);
  if (page) await page.screenshot({ path: path.join(output, "FAILURE.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(output, "test.log"), report.join("\n") + "\n");
  await writeFile(path.join(output, "next.log"), appLog.join(""));
  await browser?.close();
  await api?.dispose();
  await pool?.end();
  if (app?.pid) {
    if (process.platform === "win32") { try { execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "pipe" }); } catch {} }
    else app.kill("SIGTERM");
  }
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); } catch {}
}
