import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Bundle the actual hook from the selected source root, execute the finite ReactDOM fixture in a network-blocked browser and record hook and console results. */
async function main() {
  const sourceRoot = path.resolve(process.argv[2] || root), output = path.resolve(process.argv[3] || path.join(root, "output/fleet-business-data-hook-review"));
  await fs.mkdir(output, { recursive: true });
  const bundle = await build({ absWorkingDir: root, entryPoints: ["scripts/fixtures/fleet-business-data-hook.tsx"], bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "actual-hook-source", setup(builder) {
    builder.onResolve({ filter: /business-data\/use-business-data$/ }, () => ({ path: path.join(sourceRoot, "src/components/admin/business-data/use-business-data.ts") }));
  } }] });
  await fs.writeFile(path.join(output, "actual-hook.bundle.js"), bundle.outputFiles[0].contents);
  const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : "chromium");
  const browser = await chromium.launch({ headless: true, ...(channel === "chromium" ? {} : { channel }) });
  try {
    const page = await browser.newPage(), pageErrors = [], consoleErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await page.route("**/*", route => route.abort("blockedbyclient"));
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => globalThis.__HOOK_REVIEW !== undefined, { timeout: 20_000 });
    const result = await page.evaluate(() => globalThis.__HOOK_REVIEW);
    Object.assign(result, { sourceRoot, pageErrors, consoleErrors });
    await fs.writeFile(path.join(output, "HOOK_RESULT.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(`FLEET_BUSINESS_HOOK_REVIEW=${result.result} assertions=${result.assertions?.length || 0} failed=${result.failures ?? "unknown"} PAGE_ERRORS=${pageErrors.length} SERVERS_STARTED=0 SSH=0`);
    process.exitCode = result.result === "PASS" && pageErrors.length === 0 && consoleErrors.length === 0 ? 0 : 3;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
