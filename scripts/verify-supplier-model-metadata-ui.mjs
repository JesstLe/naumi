import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1") throw Error("Requires isolated local PostgreSQL");
const metadata = "output/model-management-fixture/fixture.json";
if (existsSync(metadata)) throw Error("Existing fixture must be stopped first");
const original = readFileSync("tsconfig.json"), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixture = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--conditions", "react-server", "scripts/model-management-ui-fixture.ts"], { env: process.env, stdio: "inherit", windowsHide: true });
try {
  let ready = false;
  for (let n = 0; n < 120; n++) {
    if (fixture.exitCode !== null) throw Error("Fixture exited");
    if (existsSync(metadata)) try { if ((await fetch("http://127.0.0.1:54989/api/health")).ok) { ready = true; break; } } catch {}
    await wait(1000);
  }
  if (!ready) throw Error("Fixture startup timed out");
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/verify-supplier-model-metadata-ui.ts"], { env: process.env, stdio: "inherit", windowsHide: true });
  process.exitCode = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); }) || 0;
} finally {
  if (existsSync(metadata)) { const f = JSON.parse(readFileSync(metadata, "utf8")); await fetch(f.control + "/stop", { method: "POST" }).catch(() => {}); }
  for (let n = 0; n < 50 && fixture.exitCode === null; n++) await wait(200);
  if (fixture.exitCode === null) fixture.kill();
  writeFileSync("tsconfig.json", original);
}
