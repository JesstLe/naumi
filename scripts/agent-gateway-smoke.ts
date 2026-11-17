// End-to-end acceptance for the external agent gateway: a real Next server on an isolated
// PostgreSQL schema with a published model configuration and a fake image supplier, driven only
// through the shipped CLI (public/agent/naumi.mjs) and its MCP mode, as an external agent would.
//
//   NAUMI_VERIFY_ISOLATED_DB=1 DATABASE_URL=postgres://postgres@127.0.0.1:55433/naumi_agw \
//     node node_modules/tsx/dist/cli.mjs scripts/agent-gateway-smoke.ts
// NAUMI_SMOKE_RELEASE_RUNTIME=1 also enables the blue-green release runtime (drain accounting,
// admission control) the production sites run with.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "@playwright/test";
import { createModelFixture } from "./model-config-fixture";

type CliResult = { code: number | null; json: any; stdout: string; stderr: string };
const output = path.resolve("output/agent-gateway-smoke");
const distDir = `output/agent-gateway-smoke/.next-${process.pid}`;
const CLI = path.resolve("public/agent/naumi.mjs");
const report: string[] = [], appLog: string[] = [], imageRequests: { url: string; bytes: number }[] = [];
let desktopSupplierDelay = 0;
const pass = (message: string) => { report.push(`PASS ${message}`); console.log(report.at(-1)); };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function cli(args: string[], configPath: string): Promise<CliResult> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, NAUMI_CONFIG: configPath, NAUMI_SITE: "", NAUMI_TOKEN: "" }, cwd: output });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("close", code => {
      let json: any = null;
      try { json = JSON.parse(stdout); } catch { /* not JSON */ }
      resolve({ code, json, stdout, stderr });
    });
  });
}

async function register(base: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, name: email.split("@")[0] }) });
  if (res.status !== 200) assert.fail(await res.text());
  const cookie = res.headers.getSetCookie().map(value => value.split(";")[0]).find(value => value.startsWith("nv_user="));
  assert(cookie, "registration did not return the nv_user session cookie");
  return cookie;
}

async function createToken(base: string, cookie: string, body: Record<string, unknown>): Promise<{ token: { id: string }; secret: string }> {
  const res = await fetch(`${base}/api/account/agent-tokens`, { method: "POST", headers: { cookie, origin: base, "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  assert.equal(res.status, 201, text);
  return JSON.parse(text);
}

async function main() {
  const tsconfigPath = path.resolve("tsconfig.json"), originalTsconfig = await readFile(tsconfigPath);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const supplierImage = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#dfe8ff" } }).png().toBuffer();
  const referenceImage = await sharp({ create: { width: 320, height: 320, channels: 3, background: "#ffffff" } }).composite([{ input: await sharp({ create: { width: 160, height: 160, channels: 3, background: "#1e40af" } }).png().toBuffer(), left: 80, top: 80 }]).png().toBuffer();
  const f = await createModelFixture(async (req, res) => {
    const parts: Buffer[] = [];
    for await (const part of req) parts.push(Buffer.from(part));
    const raw = Buffer.concat(parts), json = req.headers["content-type"]?.includes("json") && raw.length ? JSON.parse(raw.toString()) : {};
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/internal/config/")) {
      if (req.url.endsWith("/prepare")) return void res.end(JSON.stringify({ digest: json.digest, phase: "prepared" }));
      if (req.url.endsWith("/activate")) return void res.end(JSON.stringify({ id: json.id, digest: json.digest, phase: "applied" }));
      return void res.end(JSON.stringify({ digest: "" }));
    }
    if (req.url?.endsWith("/images/generations") || req.url?.endsWith("/images/edits")) {
      imageRequests.push({ url: req.url, bytes: raw.length });
      if (desktopSupplierDelay) {const delay=desktopSupplierDelay;desktopSupplierDelay=0;await sleep(delay);}
      return void res.end(JSON.stringify({ data: [{ b64_json: supplierImage.toString("base64") }] }));
    }
    if (req.url?.endsWith("/chat/completions")) {
      return void res.end(JSON.stringify({ id: `chatcmpl-${randomUUID()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000), model: json.model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "白底，中央一个蓝色方块。" } }] }));
    }
    res.statusCode = 404; res.end("{}");
  });
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const env: Record<string, string> = {
    DATABASE_URL: process.env.DATABASE_URL!, PGOPTIONS: `-c search_path=${f.schemaName}`, SETTINGS_SECRET: process.env.SETTINGS_SECRET!,
    NAUMI_MULTI_USER: "1", NAUMI_EDITION: "cloud", NAUMI_PUBLIC_COMMERCE: "0", STORAGE_DRIVER: "local", MEDIA_PRIVATE: "1", MEDIA_DIR: path.join(output, "media"),
    NAUMI_ROUTER_MANAGEMENT_URL: f.origin, NAUMI_ROUTER_MANAGEMENT_TOKEN: "fixture-agw-management-token-independent-1234",
    MODEL_CONFIG_ENVELOPE_SECRET: "fixture-agw-envelope-secret-independent-1234", MODEL_CONFIG_TRUSTED_ORIGINS: f.origin,
    OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: f.origin + "/v1", AGENT_API_KEY: "fixture-agent-key", AGENT_BASE_URL: f.origin + "/v1", AGENT_MODEL: "fixture-text-model",
    INTERNAL_APP_ORIGIN: base, VIDEO_WORKER_SECRET: "fixture-agw-worker-secret-independent-1234", NAUMI_VIDEO_WORKER: "0",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SMTP_HOST: "", NEXT_TELEMETRY_DISABLED: "1", NEXT_DIST_DIR: distDir,
  };
  const releaseRuntime = process.env.NAUMI_SMOKE_RELEASE_RUNTIME === "1", releaseSecret = `${randomUUID()}${randomUUID()}`;
  if (releaseRuntime) Object.assign(env, { NAUMI_RELEASE_RUNTIME: "1", NAUMI_INSTANCE_ID: "agw-smoke", SOURCE_COMMIT: "a".repeat(40), NAUMI_RELEASE_BOOT_ID: randomUUID(), NAUMI_RELEASE_BOOT_SOURCE: "preload", NAUMI_RELEASE_ADMISSION_START: "open", RELEASE_CONTROL_SECRET: releaseSecret });
  Object.assign(process.env, env);
  await f.repo.current();
  // A priced image feature makes quotes, budgets and charges observable (8 credits per image).
  const { getBillingRuntime } = await import("../src/lib/billing/server");
  const billing = await getBillingRuntime(), original = await billing.config.current(), priced = structuredClone(original.config);
  priced.switches.metering = "on"; priced.features["image.generate"].pricing = { mode: "fixed", credits: 8 };
  await billing.config.publish({ id: randomUUID(), expectedVersion: original.version, config: priced, actor: "fixture", reason: "agent gateway smoke pricing" });
  const db = await import("../src/lib/db");
  const { createBillingService, withBillingTransaction } = await import("../src/lib/billing/service");
  const grant = (email: string, amount: number) => {
    const id = randomUUID();
    return withBillingTransaction(db.getPool(), tx => createBillingService().grantTx(tx, { id, email, amount, source: "admin", reason: "agent gateway smoke", expiry: { unit: "years", value: 1 }, ledgerId: `led-${id}`, fingerprint: `agent-gateway-smoke:${id}`, actor: "agent-gateway-smoke" } as any));
  };
  // NAUMI_SMOKE_PROD=1 builds and starts the production server (no on-demand dev compilation).
  const production = process.env.NAUMI_SMOKE_PROD === "1";
  const childEnv: NodeJS.ProcessEnv = { NODE_ENV: production ? "production" : "development" };
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "COMSPEC", "HOME"]) if (process.env[key]) childEnv[key] = process.env[key];
  Object.assign(childEnv, env);
  if (production) {
    console.log("building production server ...");
    execFileSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env: { ...childEnv, NODE_OPTIONS: "--max-old-space-size=8192" }, stdio: ["ignore", "ignore", "inherit"], windowsHide: true });
    pass("production build of the candidate tree succeeds");
  }
  const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", production ? "start" : "dev", "-H", "127.0.0.1", "-p", String(port)], { env: childEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  app.stdout.on("data", chunk => appLog.push(chunk.toString()));
  app.stderr.on("data", chunk => appLog.push(chunk.toString()));
  try {
    let ready = false;
    for (let i = 0; i < 240 && app.exitCode === null; i++) { try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch { /* starting */ } await sleep(500); }
    assert(ready, "Next.js did not become ready");
    pass("Next server on an isolated schema with a published model configuration is ready");

    const discovery = await (await fetch(`${base}/api/agent-gateway/v1`)).json();
    assert.equal(discovery.cli.download, "/agent/naumi.mjs");
    const served = await fetch(`${base}/agent/naumi.mjs`);
    assert.equal(served.status, 200);
    assert.equal(await served.text(), await readFile(CLI, "utf8"));
    pass("discovery document and the downloadable CLI are served");

    const emailA = `agent-a-${Date.now()}@local.test`, emailB = `agent-b-${Date.now()}@local.test`;
    const cookieA = await register(base, emailA, randomUUID()), cookieB = await register(base, emailB, randomUUID());
    await grant(emailA, 500);

    const writeToken = await createToken(base, cookieA, { name: "smoke write", scopes: ["read", "write"], dailyCreditLimit: null, expiresInDays: 30 });
    const readToken = await createToken(base, cookieA, { name: "smoke read", scopes: ["read"], dailyCreditLimit: null, expiresInDays: 30 });
    const budgetToken = await createToken(base, cookieA, { name: "smoke budget", scopes: ["read", "write"], dailyCreditLimit: 1, expiresInDays: 30 });
    const otherToken = await createToken(base, cookieB, { name: "other user", scopes: ["read", "write"], dailyCreditLimit: null, expiresInDays: 30 });
    assert.match(writeToken.secret, /^nmk_[A-Za-z0-9_-]{43}$/);
    const stored = (await f.sql.query("SELECT token_hash, token_prefix FROM app_agent_tokens WHERE id=$1", [writeToken.token.id])).rows[0];
    assert.match(stored.token_hash, /^[0-9a-f]{64}$/);
    assert.equal((await f.sql.query("SELECT count(*)::int AS n FROM app_agent_tokens WHERE token_hash=$1 OR token_prefix=$1", [writeToken.secret])).rows[0].n, 0);
    pass("tokens are created from the browser session and only their SHA-256 is stored");

    const bearerManage = await fetch(`${base}/api/account/agent-tokens`, { headers: { authorization: `Bearer ${writeToken.secret}` } });
    assert.equal(bearerManage.status, 401);
    const crossSite = await fetch(`${base}/api/account/agent-tokens`, { method: "POST", headers: { cookie: cookieA, origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) });
    assert.equal(crossSite.status, 403);
    pass("a token cannot manage tokens, and cross-site token creation is refused");

    if(process.env.NAUMI_SMOKE_SKIP_UI!=='1') {
    const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-gpu"] });
    try {
      for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport });
        await context.addCookies([{ name: "nv_user", value: cookieA.slice("nv_user=".length), url: base }]);
        const page = await context.newPage();
        const pageErrors: string[] = [], consoleErrors: string[] = [];
        // `next dev` compiles chunks on demand; its own chunk-load timeouts are not page defects.
        page.on("pageerror", error => { if (!/^Loading chunk [\w/[\]-]+ failed\.\n\(timeout: /.test(error.message)) pageErrors.push(error.message); });
        page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
        try {
          await page.goto(`${base}/account/agent`, { waitUntil: "load", timeout: 300_000 });
          await page.getByRole("heading", { name: "Agent 接入" }).waitFor({ timeout: 180_000 });
          await page.getByText("smoke write").waitFor({ timeout: 60_000 });
          const label = `UI 令牌 ${viewport.width}`;
          await page.locator("input").first().fill(label);
          await page.getByRole("button", { name: "创建令牌" }).click();
          await page.getByText("令牌只显示这一次").waitFor({ timeout: 60_000 });
          const secret = (await page.locator("code").first().textContent())?.trim() || "";
          assert.match(secret, /^nmk_[A-Za-z0-9_-]{43}$/);
          await page.getByText(label, { exact: true }).waitFor();
          const me = await fetch(`${base}/api/agent-gateway/v1/me`, { headers: { authorization: `Bearer ${secret}` } });
          assert.equal(me.status, 200);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert(overflow <= 1, `horizontal overflow ${overflow}px at ${viewport.width}`);
          await page.screenshot({ path: path.join(output, `ui-agent-access-${viewport.width}.png`), fullPage: true });
          await page.goto(`${base}/account`, { waitUntil: "load", timeout: 300_000 });
          await page.getByRole("link", { name: /Agent 接入/ }).waitFor({ timeout: 180_000 });
          assert.deepEqual(pageErrors, []);
        } catch (error) {
          await page.screenshot({ path: path.join(output, `ui-failure-${viewport.width}.png`), fullPage: true }).catch(() => undefined);
          await writeFile(path.join(output, `ui-failure-${viewport.width}.txt`), JSON.stringify({ url: page.url(), pageErrors, consoleErrors, html: (await page.content().catch(() => "")).slice(0, 4000) }, null, 2));
          throw error;
        }
        await context.close();
      }
    } finally { await browser.close(); }
    pass("account center: /account/agent creates a token in the UI (shown once, usable immediately) and /account links to it, at 1440 and 390 wide, no overflow or page errors");
    }
    if (process.env.NAUMI_SMOKE_UI_ONLY === "1") { console.log("\nAGENT_GATEWAY_SMOKE=UI_ONLY_PASS"); return; }

    const cfg = (name: string) => path.join(output, `config-${name}.json`);
    let r: CliResult = await cli(["login", "--site", base, "--token", writeToken.secret], cfg("write"));
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.account.email, emailA);
    r = await cli(["whoami"], cfg("write"));
    assert.equal(r.code, 0, r.stdout);
    assert(r.json.account.balance >= 500, `balance ${r.json.account.balance}`);
    pass(`CLI login + whoami (balance ${r.json.account.balance})`);

    r = await cli(["tools"], cfg("write"));
    assert.equal(r.code, 0, r.stdout);
    const toolNames = r.json.map((tool: any) => tool.name);
    for (const name of ["get_balance", "list_my_artworks", "generate_image", "inspect_images", "cutout_image"]) assert(toolNames.includes(name), `missing tool ${name}`);
    assert(!toolNames.includes("list_agent_tools"));
    assert.equal(r.json.find((tool: any) => tool.name === "generate_image").billed, true);
    r = await cli(["tools", "generate_image"], cfg("write"));
    assert.equal(r.json.parameters.properties.confirm, undefined, "confirm must not be exposed");
    pass(`tool catalog lists ${toolNames.length} tools with JSON schemas`);

    r = await cli(["call", "get_balance"], cfg("write"));
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.state, "succeeded");
    assert.match(r.json.output.text, /余额/);
    pass("read tool call through the CLI");

    const localImage = path.join(output, "reference.png");
    await writeFile(localImage, referenceImage);
    r = await cli(["upload", localImage], cfg("write"));
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const uploadedUrl = r.json[0].url;
    assert(uploadedUrl.startsWith(`${base}/media/`), uploadedUrl);
    r = await cli(["download", uploadedUrl, "--out", path.join(output, "downloaded-reference.png")], cfg("write"));
    assert.equal(r.code, 0, r.stdout);
    assert.deepEqual(await readFile(path.join(output, "downloaded-reference.png")), referenceImage);
    pass("local image upload and owned media download round-trip byte-identical");

    r = await cli(["quote", "generate_image", "prompt=白底商品主图，蓝色方块", "ratio=1:1", "resolution=1K", "count=1"], cfg("write"));
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.allowed, true, JSON.stringify(r.json));
    const quoted = r.json.credits;
    assert.equal(quoted, 8);
    assert.equal(imageRequests.length, 0);
    pass(`quote generate_image: ${quoted} credits, nothing submitted`);
    r = await cli(["quote", "generate_image", "prompt=参考图", "ratio=1:1", "resolution=1K", "count=1", `image_urls=@${localImage}`], cfg("write"));
    assert.match(r.stderr, /已上传/);
    assert(!String(r.json?.refusal?.code || r.json?.error?.code || "").startsWith("MEDIA_"), r.stdout);
    r = await cli(["call", "list_my_artworks", "limit=5"], cfg("write"));
    assert.equal(r.json.state, "succeeded", r.stdout);
    assert.equal((r.json.output.text.match(/Agent 上传/g) || []).length, 2, r.json.output.text);
    pass("key=@local-file uploads first and passes an owned media URL; uploads appear in works as Agent 上传");

    const before = (await cli(["whoami"], cfg("write"))).json.account.balance;
    const operationId = randomUUID();
    const billedArgs = ["prompt=白底商品主图，蓝色方块", "ratio=1:1", "resolution=1K", "count=1"];
    r = await cli(["call", "generate_image", ...billedArgs, "--operation-id", operationId, "--out", path.join(output, "generated")], cfg("write"));
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.state, "succeeded", JSON.stringify(r.json));
    assert.equal(r.json.output.media.length, 1);
    assert(r.json.output.media[0].startsWith(`${base}/media/`));
    const generated = await readFile(r.json.downloads[0].path);
    assert.equal((await sharp(generated).metadata()).format, "png");
    assert.equal(imageRequests.length, 1);
    const after = (await cli(["whoami"], cfg("write"))).json.account.balance;
    assert.equal(before - after, quoted, `charged ${before - after}, quoted ${quoted}`);
    pass(`billed generate_image: 1 supplier request, charged ${before - after} = quote, result downloaded as PNG`);

    r = await cli(["call", "generate_image", ...billedArgs, "--operation-id", operationId], cfg("write"));
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.equal(r.json.operationId, operationId);
    assert.equal(imageRequests.length, 1, "replay must not reach the supplier");
    assert.equal((await cli(["whoami"], cfg("write"))).json.account.balance, after, "replay must not charge");
    pass("same operationId + same arguments replays the stored result: no supplier call, no charge");

    r = await cli(["call", "generate_image", "prompt=另一张图", "ratio=1:1", "resolution=1K", "count=1", "--operation-id", operationId], cfg("write"));
    assert.equal(r.code, 2, r.stdout);
    assert.equal(r.json.error.code, "OPERATION_CONFLICT");
    r = await cli(["status", operationId], cfg("write"));
    assert.equal(r.code, 0);
    assert.equal(r.json.state, "succeeded");
    pass("operationId reuse with other arguments is a conflict; status returns the stored result");

    await cli(["login", "--site", base, "--token", readToken.secret], cfg("read"));
    r = await cli(["tools"], cfg("read"));
    assert(!r.json.some((tool: any) => tool.name === "generate_image"), "read-only token must not list write tools");
    r = await cli(["call", "generate_image", "--args", JSON.stringify({ prompt: "只读令牌不应执行", ratio: "1:1", resolution: "1K", count: 1 })], cfg("read"));
    assert.equal(r.code, 3, r.stdout);
    assert.equal(r.json.error.code, "SCOPE_DENIED");
    pass("read-only token: write tools hidden and refused");

    await cli(["login", "--site", base, "--token", budgetToken.secret], cfg("budget"));
    r = await cli(["call", "generate_image", "prompt=超出预算", "ratio=1:1", "resolution=1K", "count=1"], cfg("budget"));
    assert.equal(r.code, 4, r.stdout);
    assert.equal(r.json.error.code, "BUDGET_EXCEEDED");
    assert.equal(imageRequests.length, 1, "refused budget call must not reach the supplier");
    pass("daily budget refuses before submission");

    const raceToken = await createToken(base, cookieA, { name: "race", scopes: ["read", "write"], dailyCreditLimit: quoted, expiresInDays: 1 });
    const race = await Promise.all([1, 2].map(() => fetch(`${base}/api/agent-gateway/v1/calls`, { method: "POST", headers: { authorization: `Bearer ${raceToken.secret}`, "content-type": "application/json" }, body: JSON.stringify({ tool: "generate_image", arguments: { prompt: "并发预算", ratio: "1:1", resolution: "1K", count: 1 }, operationId: randomUUID() }) }).then(async res => ({ status: res.status, body: await res.text() }))));
    assert.deepEqual(race.map(item => item.status).sort(), [200, 402], JSON.stringify(race));
    pass("two concurrent calls against a one-call budget: exactly one accepted");

    await cli(["login", "--site", base, "--token", otherToken.secret], cfg("other"));
    r = await cli(["download", uploadedUrl], cfg("other"));
    assert.equal(r.code, 2, r.stdout);
    assert.equal(r.json.error.code, "MEDIA_NOT_FOUND", r.stdout);
    r = await cli(["call", "inspect_images", `image_urls=${uploadedUrl}`, "question=这是什么"], cfg("other"));
    assert.equal(r.json.error.code, "MEDIA_NOT_FOUND", r.stdout);
    pass("another account can neither download nor reference this account's media");

    const mcp = new Client({ name: "agent-gateway-smoke", version: "1.0.0" });
    await mcp.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, "mcp"], env: { ...process.env, NAUMI_CONFIG: cfg("write"), NAUMI_SITE: "", NAUMI_TOKEN: "" }, stderr: "pipe" }));
    const listed = await mcp.listTools();
    const mcpNames = listed.tools.map(tool => tool.name);
    for (const name of ["generate_image", "get_balance", "naumi_upload_image", "naumi_download_media", "naumi_call_status"]) assert(mcpNames.includes(name), `MCP missing ${name}`);
    const balance: any = await mcp.callTool({ name: "get_balance", arguments: {} });
    assert.equal(balance.isError, false, JSON.stringify(balance));
    assert.match(balance.content[0].text, /余额/);
    const upload: any = await mcp.callTool({ name: "naumi_upload_image", arguments: { path: localImage } });
    assert.equal(upload.isError, false, JSON.stringify(upload));
    assert.match(upload.structuredContent.url, /\/media\//);
    const mcpImage: any = await mcp.callTool({ name: "generate_image", arguments: { prompt: "MCP 白底主图", ratio: "1:1", resolution: "1K", count: 1 } });
    assert.equal(mcpImage.isError, false, JSON.stringify(mcpImage));
    assert.equal(mcpImage.structuredContent.output.media.length, 1);
    const saved: any = await mcp.callTool({ name: "naumi_download_media", arguments: { url: mcpImage.structuredContent.output.media[0], out: path.join(output, "mcp-result.png") } });
    assert.equal(saved.isError, false, JSON.stringify(saved));
    await mcp.close();
    pass(`MCP stdio server: ${mcpNames.length} tools, read + upload + billed generation + download`);

    if(process.env.AGENT_DESKTOP_SMOKE==='1') {
      const bundle=path.resolve('output/desktop-creation/smoke-bundle-'+process.pid);
      execFileSync(process.execPath,['scripts/package-naumi-desktop.mjs',bundle,'--allow-dirty'],{stdio:'pipe',windowsHide:true});
      const {pathToFileURL}=await import('node:url');
      const {naumiCreationConfig,presentNaumiDownload}=await import(pathToFileURL(path.resolve('integrations/desktop/naumi-creation.mjs')).href);
      const secretFile=path.resolve('output/desktop-creation/smoke-token.private');await writeFile(secretFile,writeToken.secret,{mode:0o600});
      const configured=await naumiCreationConfig({bundle,site:base,account:emailA,tokenFile:secretFile,fileRoot:output,node:process.execPath,allowFixtureBundle:true});
      const connectDesktop=async()=>{const c=new Client({name:'desktop-fixture',version:'1'});const t=new StdioClientTransport({...configured.mcp,env:configured.mcp.env,stderr:'pipe'});await c.connect(t);return {client:c,transport:t};};
      let desktop=await connectDesktop();
      try {
        const list=await desktop.client.listTools();
        assert(list.tools.some(t=>t.name==='naumi_call'));
        assert(!list.tools.some(t=>t.name==='generate_image'),'Desktop must not expose random-ID write path');
        const connection:any=await desktop.client.callTool({name:'naumi_connection',arguments:{}});
        assert.equal(connection.structuredContent.account.email,emailA);
        const catalog:any=await desktop.client.callTool({name:'naumi_tools',arguments:{}});
        assert(catalog.structuredContent.tools.some((t:any)=>t.name==='generate_image'&&t.parameters&&typeof t.available==='boolean'));
        await writeFile(path.join(output,'desktop-capabilities.json'),JSON.stringify(catalog.structuredContent,null,2));
        const reference:any=await desktop.client.callTool({name:'naumi_upload_image',arguments:{path:localImage}});
        assert(!reference.isError,JSON.stringify(reference));
        const operationId=randomUUID();
        const intent={tool:'generate_image',arguments:{prompt:'Desktop 保留参考商品的白底主图',image_urls:[reference.structuredContent.url],ratio:'1:1',resolution:'1K',count:1},operationId,request:'Desktop fixture reference chain'};
        await writeFile(path.join(output,'desktop-intent.json'),JSON.stringify({account:emailA,tokenId:writeToken.token.id,site:base,workspace:null,...intent},null,2));
        const beforeSupplier=imageRequests.length;
        const beforeLedger=Number((await f.sql.query('SELECT count(*)::int n FROM app_ledger WHERE email=$1',[emailA])).rows[0].n);
        const beforeArt=Number((await f.sql.query('SELECT count(*)::int n FROM app_artworks WHERE email=$1',[emailA])).rows[0].n);
        const beforeBalance=(await cli(['whoami'],cfg('write'))).json.account.balance;
        desktopSupplierDelay=1500;
        const interrupted=desktop.client.callTool({name:'naumi_call',arguments:intent}).catch(()=>null);
        for(let n=0;n<200&&imageRequests.length===beforeSupplier;n++)await sleep(100);
        assert.equal(imageRequests.length,beforeSupplier+1,'supplier must accept original call before disconnect');
        await desktop.client.close();await interrupted;
        desktop=await connectDesktop();
        let recovered:any;
        for(let n=0;n<200;n++) {
          recovered=await desktop.client.callTool({name:'naumi_call_status',arguments:{operationId}});
          if(recovered.structuredContent?.state==='succeeded')break;
          await sleep(150);
        }
        assert.equal(recovered.structuredContent.state,'succeeded',JSON.stringify(recovered));
        assert.equal(recovered.structuredContent.operationId,operationId);
        assert.equal(imageRequests.length,beforeSupplier+1);
        const replayed:any=await desktop.client.callTool({name:'naumi_call',arguments:intent});
        assert.equal(replayed.structuredContent.operationId,operationId);
        assert.equal(imageRequests.length,beforeSupplier+1);
        const afterBalance=(await cli(['whoami'],cfg('write'))).json.account.balance;
        assert.equal(beforeBalance-afterBalance,recovered.structuredContent.credits);
        assert.equal(Number((await f.sql.query('SELECT count(*)::int n FROM app_ledger WHERE email=$1',[emailA])).rows[0].n),beforeLedger+1);
        assert.equal(Number((await f.sql.query('SELECT count(*)::int n FROM app_artworks WHERE email=$1',[emailA])).rows[0].n),beforeArt+1);
        const mediaUrl=recovered.structuredContent.output.media[0];
        const downloaded:any=await desktop.client.callTool({name:'naumi_download_media',arguments:{url:mediaUrl,out:path.join(output,'desktop-final.png')}});
        assert.equal(downloaded.isError,false,JSON.stringify(downloaded));
        const finalBytes=await readFile(downloaded.structuredContent.path);assert.deepEqual(finalBytes,supplierImage);
        const {createHash}=await import('node:crypto');assert.equal(downloaded.structuredContent.sha256,createHash('sha256').update(finalBytes).digest('hex'));
        // The native package implementation creates the actual event; host/session
        // services here are isolated fixtures, not a running Desktop UI.
        let nativeDelivery:any={status:'NOT TESTED',reason:'NAUMI_HARNESS_ROOT not specified'};
        if(process.env.NAUMI_HARNESS_ROOT) {
          const native=await import(pathToFileURL(path.join(process.env.NAUMI_HARNESS_ROOT,'node_modules/@deepseek-ai/dsh-tool-present/lib/index.js')).href);
          const mcpPackage=await import(pathToFileURL(path.join(process.env.NAUMI_HARNESS_ROOT,'node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js')).href);
          mcpPackage.Config(configured.mcp);
          const events:any[]=[],listeners:any={},session={append:(type:string,data:any)=>{events.push({type,data});return events.at(-1);}};
          let definition:any;
          const fs=await import('node:fs/promises');
          native.apply({tools:{register:(d:any)=>{definition=d;}},agents:{turnBoundaryOf:()=>({openTurnStartSeq:1,lastTurn:1})},workingDirectory:{ensure:async()=>output},fs:{lstat:async(p:string)=>{const s=await fs.lstat(p);return {type:s.isFile()?'file':'other'};},resolve:async(p:string)=>path.resolve(p),stat:async(p:string)=>{const s=await fs.stat(p);return {type:s.isFile()?'file':'other'};},processPath:(p:string)=>p},on:(name:string,fn:any)=>{listeners[name]=fn;}},{maxFiles:8});
          const exec={agent:{session},callId:'desktop-delivery-fixture',signal:new AbortController().signal};
          await presentNaumiDownload({receipt:downloaded.structuredContent,fileRoot:output,present:async(args:any)=>{const value=await definition.execute(args,exec);listeners['tools/result'](exec,{isError:false,value});return value;}});
          assert.equal(events.length,1);assert.equal(events[0].type,'deliverables/presented');assert.equal(events[0].data.files[0].path,downloaded.structuredContent.path);
          nativeDelivery={status:'PASS',package:'@deepseek-ai/dsh-tool-present',events,scope:'actual native tool body with isolated host/session; Desktop UI NOT TESTED'};
        }
        const savedCall=(await f.sql.query('SELECT operation_id,state,credits FROM app_agent_gateway_calls WHERE token_id=$1 AND operation_id=$2',[writeToken.token.id,operationId])).rows;
        assert.equal(savedCall.length,1);
        await writeFile(path.join(output,'DESKTOP_CHAIN.json'),JSON.stringify({outerOperationId:operationId,call:savedCall[0],domainReceipt:recovered.structuredContent.output.details,supplierRequests:1,ledgerDelta:1,artworkDelta:1,charged:beforeBalance-afterBalance,download:downloaded.structuredContent,nativeDelivery,realPg:true,realNext:true,realSupplier:false,paidProductionCalls:0},null,2));
        pass('Desktop MCP reference upload → same-ID interrupted call/status/replay → one artwork/ledger → hash download → native present adapter');
      } finally {await desktop.client.close();await rm(secretFile,{force:true});}
    }

    const concurrent = await Promise.all([1, 2].map(() => fetch(`${base}/api/agent-gateway/v1/calls`, { method: "POST", headers: { authorization: `Bearer ${writeToken.secret}`, "content-type": "application/json" }, body: JSON.stringify({ tool: "generate_image", arguments: { prompt: "同令牌并发", ratio: "1:1", resolution: "1K", count: 1 }, operationId: randomUUID() }) }).then(async res => ({ status: res.status, lines: (await res.text()).trim().split("\n").map(line => JSON.parse(line)) }))));
    assert.deepEqual(concurrent.map(item => item.status), [200, 200], JSON.stringify(concurrent));
    assert(concurrent.every(item => item.lines.at(-1).call.state === "succeeded"), JSON.stringify(concurrent));
    pass("two concurrent billed calls on one token both run to completion");

    if (releaseRuntime) {
      const control = { "x-release-control-secret": releaseSecret, "content-type": "application/json" };
      const status = async () => (await fetch(`${base}/api/internal/release/status`, { headers: control })).json();
      let current: any = await status();
      assert.equal(current.observations.trackedAcceptedWork, 0, JSON.stringify(current.observations));
      const drained: any = await (await fetch(`${base}/api/internal/release/control`, { method: "POST", headers: control, body: JSON.stringify({ instanceId: current.identity.instanceId, bootId: current.identity.bootId, expectedRevision: current.admission.revision, operationId: randomUUID(), action: "drain" }) })).json();
      assert.equal(drained.admission.mode, "draining", JSON.stringify(drained));
      const refusedId = randomUUID();
      r = await cli(["call", "get_balance", "--operation-id", refusedId], cfg("write"));
      assert.equal(r.code, 5, r.stdout + r.stderr);
      assert.equal(r.json.error.code, "UNAVAILABLE", r.stdout);
      assert.equal(r.json.error.submitted, false);
      assert.equal((await f.sql.query("SELECT count(*)::int AS n FROM app_agent_gateway_calls WHERE operation_id=$1", [refusedId])).rows[0].n, 0);
      current = await status();
      const resumed: any = await (await fetch(`${base}/api/internal/release/control`, { method: "POST", headers: control, body: JSON.stringify({ instanceId: current.identity.instanceId, bootId: current.identity.bootId, expectedRevision: current.admission.revision, operationId: randomUUID(), action: "resume" }) })).json();
      assert.equal(resumed.admission.mode, "open", JSON.stringify(resumed));
      r = await cli(["call", "get_balance", "--operation-id", refusedId], cfg("write"));
      assert.equal(r.code, 0, r.stdout + r.stderr);
      const work = (await f.sql.query("SELECT state, count(*)::int AS n FROM app_release_activities WHERE activity_kind='accepted-work' AND detail LIKE 'agent-gateway:%' GROUP BY state")).rows;
      assert.deepEqual(work.map((row: any) => row.state), ["finished"], JSON.stringify(work));
      current = await status();
      assert.equal(current.observations.trackedAcceptedWork, 0);
      assert.equal(current.observations.unknownLeases, 0, JSON.stringify(current.observations));
      pass(`release runtime: a draining slot refuses before submission and the retry succeeds after resume; ${work[0].n} gateway calls tracked as accepted work, all finished, 0 unknown leases`);
    }


    const revoke = await fetch(`${base}/api/account/agent-tokens?id=${readToken.token.id}`, { method: "DELETE", headers: { cookie: cookieA, origin: base } });
    assert.equal(revoke.status, 200);
    r = await cli(["whoami"], cfg("read"));
    assert.equal(r.code, 3, r.stdout);
    assert.equal(r.json.error.code, "TOKEN_REVOKED");
    pass("revoked token is refused immediately");

    const ledger = (await f.sql.query("SELECT state, count(*)::int AS n FROM app_agent_gateway_calls GROUP BY state ORDER BY state")).rows;
    const creations = (await f.sql.query("SELECT count(*)::int AS n FROM app_creation_records WHERE source_kind='agent-turn' AND source_id LIKE 'gw-%'").catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n;
    const unknown = (await f.sql.query("SELECT count(*)::int AS n FROM app_release_activities WHERE state='unknown'").catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    assert.equal(unknown, 0, "gateway calls must not leave unknown release activities");
    pass(`ledger ${JSON.stringify(ledger)}; gateway creation records ${creations}; unknown release activities ${unknown}`);
    await writeFile(path.join(output, "report.txt"), report.join("\n") + "\n");
    console.log(`\nAGENT_GATEWAY_SMOKE=PASS (${report.length} checks)`);
  } catch (error) {
    console.error(error);
    await writeFile(path.join(output, "app.log"), appLog.join(""));
    console.error(`\nAGENT_GATEWAY_SMOKE=FAIL; app log: ${path.join(output, "app.log")}`);
    process.exitCode = 1;
  } finally {
    try { if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGTERM"); } catch { /* exited */ }
    await sleep(1000);
    await db.getPool().end().catch(() => undefined);
    await f.cleanup().catch(error => console.error("fixture cleanup failed", error instanceof Error ? error.message : error));
    await rm(path.resolve(distDir), { recursive: true, force: true }).catch(() => undefined);
    await writeFile(tsconfigPath, originalTsconfig);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
