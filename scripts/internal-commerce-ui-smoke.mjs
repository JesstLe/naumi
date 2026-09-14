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
  } catch {
    // Try the next Chrome location.
  }
}
if (!executablePath) throw new Error("Chrome executable not found; set CHROME_PATH");

const baseUrl = (process.env.COMMERCE_BASE_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
await mkdir("output", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });

const publicPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await publicPage.goto(baseUrl, { waitUntil: "networkidle" });
const publicText = await publicPage.locator("body").innerText();
for (const hiddenText of ["定价", "购买积分", "充值积分", "支付宝支付", "会员套餐", "免费出第一张图"]) {
  if (publicText.includes(hiddenText)) {
    throw new Error(`Public homepage still exposes commerce copy: ${hiddenText}`);
  }
}

for (const path of ["/terms", "/privacy"]) {
  await publicPage.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  const legalText = await publicPage.locator("body").innerText();
  for (const hiddenText of ["购买套餐", "积分包", "支付服务商", "退款政策", "会员套餐", "积分价格"]) {
    if (legalText.includes(hiddenText)) {
      throw new Error(`${path} still exposes commerce copy: ${hiddenText}`);
    }
  }
}

for (const path of ["/plans", "/checkout", "/deploy"]) {
  await publicPage.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
  if (new URL(publicPage.url()).pathname !== "/") {
    throw new Error(`${path} did not redirect to the homepage while commerce is disabled`);
  }
}

const createResponse = await publicPage.request.post(`${baseUrl}/api/payments/create`, {
  data: {
    email: "beta-smoke@naumi.local",
    kind: "pack",
    itemId: "pack-1",
    method: "alipay",
  },
});
if (createResponse.status() !== 404) {
  throw new Error(`Payment creation should return 404, got ${createResponse.status()}`);
}
const orderResponse = await publicPage.request.get(`${baseUrl}/api/payments/order?id=beta-smoke`);
if (orderResponse.status() !== 404) {
  throw new Error(`Payment lookup should return 404, got ${orderResponse.status()}`);
}

const betaUser = {
  name: "Beta Smoke",
  email: "beta-smoke@naumi.local",
  plan: "starter",
  creditsTotal: 100,
  creditsUsed: 25,
  joinedAt: new Date().toISOString(),
  renewsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  invoices: [],
};
const accountContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await accountContext.addInitScript((seed) => {
  localStorage.setItem("naumi:last-email", seed.email);
  localStorage.setItem(`naumi:user:${seed.email}`, JSON.stringify(seed));
}, betaUser);
const accountPage = await accountContext.newPage();
await accountPage.route("**/api/config", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ db: false, authMode: "mock" }),
  })
);
await accountPage.goto(`${baseUrl}/account`, { waitUntil: "networkidle" });
const accountText = await accountPage.locator("body").innerText();
for (const hiddenText of ["充值积分", "积分充值", "去充值", "立即支付", "购买", "¥", "￥"]) {
  if (accountText.includes(hiddenText)) {
    throw new Error(`Account page still exposes commerce copy: ${hiddenText}`);
  }
}
if (!accountText.includes("积分余额") || !accountText.includes("积分明细")) {
  throw new Error(`Beta credit balance or usage history is missing from the account page:\n${accountText.slice(0, 2000)}`);
}
await accountPage.screenshot({ path: "output/internal-commerce-account.png", fullPage: true });

await accountContext.close();
await browser.close();
process.stdout.write("Internal commerce UI smoke passed; screenshot: output/internal-commerce-account.png\n");
