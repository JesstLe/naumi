import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw Error("isolated DB required");
if (existsSync("output/model-ui-fixture.json")) throw Error("Existing UI fixture must be closed first");
const original = readFileSync("tsconfig.json"), env = { ...process.env, NAUMI_VERIFY_BUSINESS_UI: "1" };
const fixture = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--conditions", "react-server", "scripts/model-config-ui-fixture.ts"], { env, stdio: "inherit", windowsHide: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
  let ready = false;
  for (let i = 0; i < 180; i++) { if (fixture.exitCode !== null) throw Error("UI fixture exited during setup"); if (existsSync("output/model-ui-fixture.json")) try { if ((await fetch("http://127.0.0.1:54980/api/health")).ok) { ready = true; break; } } catch {} await wait(1000); }
  if (!ready) throw Error("UI fixture startup timeout");
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/verify-model-batch-ui.ts"], { env, stdio: "inherit", windowsHide: true });
  process.exitCode = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); }) || 0;
} finally {
  if (existsSync("output/model-ui-fixture.json")) { const f = JSON.parse(readFileSync("output/model-ui-fixture.json", "utf8")); await fetch(f.controlOrigin + "/fixture/stop", { method: "POST" }).catch(() => {}); }
  for (let i = 0; i < 40 && fixture.exitCode === null; i++) await wait(200);
  if (fixture.exitCode === null) { if (process.platform === "win32") { const child = spawn("taskkill", ["/PID", String(fixture.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }); await new Promise(r => child.once("exit", r)); } else fixture.kill(); }
  writeFileSync("tsconfig.json", original);
}
