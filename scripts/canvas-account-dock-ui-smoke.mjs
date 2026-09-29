import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const candidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].filter(Boolean);
let executablePath = "";
for (const candidate of candidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {}
}
if (!executablePath) throw new Error("Chrome executable not found; set CHROME_PATH");

const baseUrl = (process.env.CANVAS_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
const user = {
  name: "Dock UI Smoke",
  email: "dock-ui-smoke@naumi.local",
  plan: "starter",
  creditsTotal: 200,
  creditsUsed: 37,
  joinedAt: new Date().toISOString(),
  renewsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  invoices: [],
};
const artwork = {
  id: "dock-ui-work",
  title: "Dock UI Project",
  category: "main",
  prompt: "account dock browser acceptance",
  createdAt: new Date().toISOString(),
  status: "completed",
  image: "/media/dock-ui-smoke.webp",
  gradient: "from-slate-100 to-white",
  source: "canvas-add",
  groupId: "dock-ui-project",
  origin: "canvas",
};

await mkdir("output", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on("pageerror", (error) => console.error("browser pageerror:", error.message));

await page.addInitScript((seed) => {
  localStorage.setItem("naumi:last-email", seed.email);
  localStorage.setItem(`naumi:user:${seed.email}`, JSON.stringify(seed));
}, user);
await page.route("**/api/config", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ db: true, multiUser: true, authMode: "mock" }),
  })
);
await page.route("**/api/auth/session", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user }) })
);
await page.route("**/api/account**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ persisted: true, user, artworks: [artwork] }),
  })
);
await page.route("**/api/projects**", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ names: { "dock-ui-project": "Dock UI Project" } }),
  })
);
await page.route("**/api/admin/settings", (route) =>
  route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "forbidden" }) })
);
await page.route("**/media/dock-ui-smoke.webp", (route) =>
  route.fulfill({ status: 200, contentType: "image/webp", path: "public/demos/suite-before.webp" })
);

const snapshots = [];
async function readDock(label) {
  const dock = page.locator('[data-testid="account-dock"]:visible');
  await dock.waitFor({ state: "visible" });
  const box = await dock.boundingBox();
  assert.ok(box, `${label}: dock must have a visible bounding box`);
  const text = (await dock.innerText()).replace(/\s+/g, " ").trim();
  const colors = await dock.evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, color: style.color };
  });
  snapshots.push({ label, width: Math.round(box.width), text, ...colors });
  assert.equal(Math.round(box.width), 230, `${label}: dock width`);
  assert.match(text, /163/);
  return { dock, text };
}

try {
  await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
  const appTrigger = page.locator('header [data-testid="app-account-dock-trigger"]');
  await page.waitForFunction(() =>
    document.querySelector('header [data-testid="app-account-dock-trigger"]')?.textContent?.trim() === "D"
  );
  await appTrigger.dispatchEvent("click");
  const appDock = await readDock("app");
  await page.screenshot({ path: "output/account-dock-app.png", fullPage: true });
  await page.keyboard.press("Escape");
  await appDock.dock.waitFor({ state: "hidden" });

  await page.goto(`${baseUrl}/canvas`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("canvas-project-browser").waitFor();
  let canvasTrigger = page.locator('[data-testid="canvas-account-dock-trigger"]:visible');
  await canvasTrigger.click();
  const browserDock = await readDock("canvas-project-browser");
  assert.equal(browserDock.text, appDock.text, "project browser dock content must match app dock");
  assert.deepEqual(snapshots[1], { ...snapshots[0], label: "canvas-project-browser" });
  await page.screenshot({ path: "output/account-dock-canvas-browser.png", fullPage: true });
  await page.getByTestId("canvas-project-browser").click({ position: { x: 20, y: 220 } });
  await browserDock.dock.waitFor({ state: "hidden" });

  await page.getByTitle("Dock UI Project").click();
  await page.getByTestId("canvas-project-chrome").waitFor();
  canvasTrigger = page.locator('[data-testid="canvas-account-dock-trigger"]:visible');
  await canvasTrigger.click();
  const editorDock = await readDock("canvas-editor");
  assert.equal(editorDock.text, appDock.text, "canvas editor dock content must match app dock");
  assert.deepEqual(snapshots[2], { ...snapshots[0], label: "canvas-editor" });
  assert.equal(page.url(), `${baseUrl}/canvas`, "account trigger must not navigate or open the account page");
  await page.screenshot({ path: "output/account-dock-canvas-editor.png", fullPage: true });
  await page.keyboard.press("Escape");
  await editorDock.dock.waitFor({ state: "hidden" });
  console.log(`CANVAS_ACCOUNT_DOCK_UI_RESULT=PASS ${JSON.stringify(snapshots)}`);
} finally {
  await browser.close();
}
