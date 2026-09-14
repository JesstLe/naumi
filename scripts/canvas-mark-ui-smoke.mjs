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
await mkdir("output", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
page.on("pageerror", (error) => console.error("browser pageerror:", error.message));
const user = {
  name: "Canvas Mark Smoke",
  email: "canvas-mark-smoke@naumi.local",
  plan: "starter",
  creditsTotal: 200,
  creditsUsed: 0,
  joinedAt: new Date().toISOString(),
  renewsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  invoices: [],
};
const artwork = {
  id: "canvas-mark-work",
  title: "标记功能测试图",
  category: "main",
  prompt: "测试画布标记",
  createdAt: new Date().toISOString(),
  status: "completed",
  image: "/media/canvas-mark-smoke.webp",
  gradient: "from-slate-100 to-white",
  source: "canvas-add",
  groupId: "canvas-mark-work",
  origin: "canvas",
  marked: false,
};
let markRequest = null;

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
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ names: {} }) })
);
await page.route("**/api/admin/settings", (route) =>
  route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "not configured" }) })
);
await page.route("**/media/canvas-mark-smoke.webp", (route) =>
  route.fulfill({ status: 200, contentType: "image/webp", path: "public/demos/suite-before.webp" })
);
await page.route("**/api/artworks/mark", async (route) => {
  markRequest = JSON.parse(route.request().postData() || "{}");
  artwork.marked = !!markRequest.marked;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, persisted: false, marked: artwork.marked }),
  });
});

try {
  await page.goto(`${baseUrl}/canvas`, { waitUntil: "domcontentloaded" });
  await page.getByTitle("标记功能测试图").waitFor();
  await page.getByTitle("标记功能测试图").click();
  const node = page.locator('.react-flow__node[data-id="canvas-mark-work"]');
  await node.click();
  await page.getByRole("button", { name: "标记", exact: true }).click();
  await page.getByRole("button", { name: "取消标记", exact: true }).waitFor();
  assert.deepEqual(markRequest, { id: artwork.id, marked: true });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('.react-flow__node[data-id="canvas-mark-work"]').click();
  await page.getByRole("button", { name: "取消标记", exact: true }).waitFor();
  await page.screenshot({ path: "output/canvas-mark-ui.png", fullPage: true });
  console.log("canvas mark ui smoke: PASS");
} finally {
  await browser.close();
}
