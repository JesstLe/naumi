#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect, request } from "@playwright/test";

const DEFAULT_BASE_URL = "http://101.133.166.67/";
const PROJECT_NAME = "产品.jpg";
const OUTPUT_DIR = path.resolve("output/canvas-production-readonly");
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1093, height: 614 },
  { width: 1366, height: 768 },
  { width: 1600, height: 1000 },
];
const PROFILES = [
  {
    name: "windows",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  },
  {
    name: "mac",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  },
];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const REQUIRED_TEST_IDS = [
  "image-node-toolbar",
  "image-node-dock",
  "canvas-project-chrome",
  "canvas-top-actions",
  "canvas-main-toolbar",
  "canvas-view-toolbar",
];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(
      `CONFIG_ERROR missing ${name}; set NAUMI_PROD_EMAIL and NAUMI_PROD_PASSWORD in the process environment`
    );
    process.exit(2);
  }
  return value;
}

function normalizedBaseUrl() {
  const raw = process.env.NAUMI_PROD_BASE_URL?.trim() || DEFAULT_BASE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    console.error("CONFIG_ERROR NAUMI_PROD_BASE_URL must be an absolute HTTP(S) URL");
    process.exit(2);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    console.error("CONFIG_ERROR NAUMI_PROD_BASE_URL must use HTTP or HTTPS");
    process.exit(2);
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function rectOverlap(a, b, tolerance = 1) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > tolerance && height > tolerance;
}

function isOutsideViewport(rect, viewport, tolerance = 1) {
  return !(
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left >= -tolerance &&
    rect.top >= -tolerance &&
    rect.right <= viewport.width + tolerance &&
    rect.bottom <= viewport.height + tolerance
  );
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

async function launchBrowser() {
  try {
    return await chromium.launch({
      channel: "chrome",
      headless: true,
      args: ["--disable-gpu"],
    });
  } catch (error) {
    console.log(`INFO system Chrome unavailable; using Playwright Chromium (${error.name})`);
    return chromium.launch({ headless: true, args: ["--disable-gpu"] });
  }
}

async function resolveProject(api) {
  const response = await api.get("/api/projects");
  assert.equal(response.status(), 200, `project lookup failed with HTTP ${response.status()}`);
  const payload = await response.json();
  const matches = Object.entries(payload.names ?? {}).filter(([, name]) => name === PROJECT_NAME);
  assert.equal(matches.length, 1, `expected one exact project named ${PROJECT_NAME}, found ${matches.length}`);
  const [key] = matches[0];
  assert(key.startsWith("tree:"), `expected ${PROJECT_NAME} to use a tree project key`);
  return { key, rootNodeId: key.slice("tree:".length) };
}

async function readGeometry(page, rootNodeId) {
  return page.evaluate(
    ({ requiredTestIds, nodeId }) => {
      const rectangle = (element) => {
        if (!(element instanceof HTMLElement)) return null;
        const value = element.getBoundingClientRect();
        return {
          left: value.left,
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          width: value.width,
          height: value.height,
        };
      };
      const values = Object.fromEntries(
        requiredTestIds.map((testId) => [
          testId,
          rectangle(document.querySelector(`[data-testid="${testId}"]`)),
        ])
      );
      const target = document.querySelector(
        `.react-flow__node[data-id="${CSS.escape(nodeId)}"]`
      );
      return { ...values, targetNode: rectangle(target) };
    },
    { requiredTestIds: REQUIRED_TEST_IDS, nodeId: rootNodeId }
  );
}

async function openExistingProject(page, rootNodeId) {
  await page.goto("/canvas", { waitUntil: "domcontentloaded", timeout: 60_000 });
  const projectBrowser = page.getByTestId("canvas-project-browser");
  await expect(projectBrowser).toBeVisible({ timeout: 60_000 });

  const projectCard = projectBrowser.locator('button[title="产品.jpg"]');
  const projectCount = await projectCard.count();
  assert.equal(projectCount, 1, `expected one exact project card named ${PROJECT_NAME}, found ${projectCount}`);
  await projectCard.click();
  await expect(page.locator(".react-flow")).toBeVisible({ timeout: 30_000 });

  const targetNode = page.locator(`.react-flow__node[data-id="${rootNodeId}"]`);
  await expect(targetNode).toHaveCount(1);
  await expect(targetNode.locator('img[alt="产品.jpg"]')).toHaveCount(1);
  return targetNode;
}

async function fitAndSelect(page, targetNode) {
  const fitButton = page
    .getByTestId("canvas-view-toolbar")
    .locator('button[title="适应视图"], button[title="Fit view"]');
  await expect(fitButton).toHaveCount(1);
  // Force only this viewport-control click: at narrow widths an overlapping
  // toolbar is itself the layout defect under test and must not block geometry capture.
  await fitButton.click({ force: true });
  await page.waitForTimeout(500);
  const nodeToolbarVisible = await page.getByTestId("image-node-toolbar").isVisible();
  const nodeDockVisible = await page.getByTestId("image-node-dock").isVisible();
  if (!nodeToolbarVisible || !nodeDockVisible) {
    // Force only when selection UI is absent. An already-open selection toolbar
    // may cover the node at narrow widths; clicking again would only block the audit.
    await targetNode.click({ force: true });
  }
  await page.waitForTimeout(250);
}

const baseURL = normalizedBaseUrl();
const email = requiredEnv("NAUMI_PROD_EMAIL");
const password = requiredEnv("NAUMI_PROD_PASSWORD");
await mkdir(OUTPUT_DIR, { recursive: true });

let api;
let browser;
const results = [];
const failures = [];
try {
  api = await request.newContext({ baseURL, timeout: 30_000 });
  const login = await api.post("/api/auth/login", { data: { email, password } });
  assert.equal(login.status(), 200, `production login failed with HTTP ${login.status()}`);
  const storageState = await api.storageState();
  const project = await resolveProject(api);
  console.log("PASS authenticated and resolved one exact existing project");

  browser = await launchBrowser();
  for (const profile of PROFILES) {
    const blockedMutations = [];
    const context = await browser.newContext({
      baseURL,
      storageState,
      userAgent: profile.userAgent,
      viewport: VIEWPORTS[0],
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      const method = route.request().method().toUpperCase();
      if (SAFE_METHODS.has(method)) {
        await route.continue();
        return;
      }
      const url = new URL(route.request().url());
      blockedMutations.push({ method, path: `${url.pathname}${url.search}` });
      await route.abort("blockedbyclient");
    });

    const page = await context.newPage();
    const targetNode = await openExistingProject(page, project.rootNodeId);
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      const caseErrors = [];
      try {
        await fitAndSelect(page, targetNode);
      } catch (error) {
        caseErrors.push(`interaction failed: ${messageOf(error)}`);
      }
      const screenshot = path.join(
        OUTPUT_DIR,
        `${profile.name}-${viewport.width}x${viewport.height}.png`
      );
      try {
        await page.screenshot({ path: screenshot });
      } catch (error) {
        caseErrors.push(`screenshot failed: ${messageOf(error)}`);
      }

      let geometry = {};
      try {
        geometry = await readGeometry(page, project.rootNodeId);
      } catch (error) {
        caseErrors.push(`geometry capture failed: ${messageOf(error)}`);
      }

      for (const name of [...REQUIRED_TEST_IDS, "targetNode"]) {
        const rect = geometry[name];
        if (!rect) {
          caseErrors.push(`${name} missing at ${viewport.width}x${viewport.height}`);
          continue;
        }
        if (isOutsideViewport(rect, viewport)) {
          caseErrors.push(
            `${name} outside viewport ${viewport.width}x${viewport.height} rect=${JSON.stringify(rect)}`
          );
        }
      }
      for (let i = 0; i < REQUIRED_TEST_IDS.length; i += 1) {
        for (let j = i + 1; j < REQUIRED_TEST_IDS.length; j += 1) {
          const left = REQUIRED_TEST_IDS[i];
          const right = REQUIRED_TEST_IDS[j];
          const leftRect = geometry[left];
          const rightRect = geometry[right];
          if (leftRect && rightRect && rectOverlap(leftRect, rightRect)) {
            caseErrors.push(
              `${left} overlaps ${right} at ${viewport.width}x${viewport.height} ` +
              `leftRect=${JSON.stringify(leftRect)} rightRect=${JSON.stringify(rightRect)}`
            );
          }
        }
      }

      const caseResult = { profile: profile.name, viewport, screenshot, geometry, errors: caseErrors };
      results.push(caseResult);
      if (caseErrors.length > 0) {
        failures.push(caseResult);
        console.error(`FAIL ${profile.name} ${viewport.width}x${viewport.height} ${caseErrors.join(" | ")}`);
      } else {
        console.log(`PASS ${profile.name} ${viewport.width}x${viewport.height} in-bounds and non-overlapping`);
      }
    }

    results.push({ profile: profile.name, blockedMutations });
    console.log(`PASS ${profile.name} write firewall active; blocked_mutations=${blockedMutations.length}`);
    await context.close();
  }

  await writeFile(
    path.join(OUTPUT_DIR, "results.json"),
    `${JSON.stringify({ project: PROJECT_NAME, failures, results }, null, 2)}\n`,
    "utf8"
  );
  if (failures.length > 0) {
    console.error(`FAIL production read-only canvas acceptance failed_cases=${failures.length} total_cases=${PROFILES.length * VIEWPORTS.length}`);
    throw new Error(`production read-only canvas acceptance failures=${failures.length}; see ${path.join(OUTPUT_DIR, "results.json")}`);
  }
  console.log(`PASS production read-only canvas acceptance profiles=${PROFILES.length} viewports=${VIEWPORTS.length}`);
} finally {
  await browser?.close();
  await api?.dispose();
}
