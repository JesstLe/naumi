// 竞品反推 → 智能帮写 → 生成图片 链路的接口级冒烟。
// 临时 PostgreSQL + 确定性 mock 文本模型 + next dev:
//  1) reverse 模式:竞品图反推提示词,校验上游收到系统词与 1 张竞品图
//  2) assist 模式:产品图改写,校验上游收到 2 张图(竞品+产品)与改写系统词
//  3) text-nodes 持久化 productIds(含 ensureSchema 自动加列)
//  4) 参数校验:reverse 缺图 / assist 缺产品图 → 400
// 运行:node scripts/canvas-competitor-flow-smoke.mjs
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import pg from "pg";
import { request } from "@playwright/test";

const output = path.resolve("output/canvas-competitor-flow-smoke");
await mkdir(output, { recursive: true });
const container = `naumi-competitor-${Date.now()}`;
const password = randomUUID();
const email = "competitor-flow@local.test";
const reverseText = "反推:一张白底保温杯电商主图,居中构图,柔和布光";
const assistText = "改写:一张白底便携随行杯电商主图,居中构图,柔和布光";
const chatRequests = [];
const report = [];
const appLog = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const png1x1 = (await sharp({
  create: { width: 8, height: 8, channels: 4, background: "#dde7ff" },
}).png().toBuffer()).toString("base64");
const dataUrl = `data:image/png;base64,${png1x1}`;
let app, fixture, pool, api;

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const pass = (message) => {
  report.push(`PASS ${message}`);
  console.log(report.at(-1));
};

try {
  execFileSync("docker", [
    "run", "-d", "--name", container,
    "-e", "POSTGRES_USER=fixture",
    "-e", `POSTGRES_PASSWORD=${password}`,
    "-e", "POSTGRES_DB=fixture",
    "-p", "127.0.0.1::5432",
    "--tmpfs", "/var/lib/postgresql/data",
    "postgres:16-alpine",
  ], { stdio: "pipe" });
  const mapping = execFileSync("docker", ["port", container, "5432"], { encoding: "utf8" }).trim();
  const database = `postgres://fixture:${password}@127.0.0.1:${mapping.split(":").pop()}/fixture?sslmode=disable`;
  pool = new pg.Pool({ connectionString: database });
  for (let i = 0; i < 60; i++) {
    try { await pool.query("select 1"); break; } catch { await sleep(300); }
  }

  fixture = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/chat/completions") {
      const body = JSON.parse(raw || "{}");
      chatRequests.push(body);
      const system = String(body.messages?.[0]?.content || "");
      const text = system.includes("改写") ? assistText : reverseText;
      res.end(JSON.stringify({
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: text } }],
      }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const provider = `http://127.0.0.1:${fixture.address().port}/v1`;

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
    env: {
      ...process.env,
      DATABASE_URL: database,
      SETTINGS_SECRET: randomUUID(),
      ADMIN_EMAIL: email,
      NAUMI_EDITION: "cloud",
      NAUMI_MULTI_USER: "1",
      MEDIA_DIR: path.join(output, "media"),
      STORAGE_DRIVER: "local",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      AGENT_API_KEY: "fixture-agent-key",
      AGENT_BASE_URL: provider,
      AGENT_MODEL: "fixture-text-model",
      OPENAI_TEXT_MODEL: "",
      NEW_API_IMAGE_BASE_URL: "",
      NEW_API_IMAGE_API_KEY: "",
      NEW_API_IMAGE_MODELS: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => appLog.push(chunk.toString()));
  app.stderr.on("data", (chunk) => appLog.push(chunk.toString()));
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    await sleep(500);
  }
  assert(ready, "Next.js did not become ready");

  api = await request.newContext({ baseURL: base, timeout: 120_000 });
  const registration = await api.post("/api/auth/register", {
    data: { email, password: randomUUID(), name: "竞品链路验收" },
  });
  assert.equal(registration.status(), 200, await registration.text());

  // 触发 ensureSchema 后种两张图:竞品图 + 产品白底图(data URL 免文件)
  await api.get("/api/canvas/text-nodes").catch(() => {});
  const competitorId = `art-competitor-${Date.now()}`;
  const productId = `art-product-${Date.now()}`;
  for (const [id, title] of [[competitorId, "竞品主图"], [productId, "产品白底图"]]) {
    await pool.query(
      `INSERT INTO app_artworks (id, email, title, category, prompt, image_url, gradient, origin)
       VALUES ($1, $2, $3, 'main', '', $4, 'from-sky-100 to-teal-100', 'canvas')`,
      [id, email.toLowerCase(), title, dataUrl]
    );
  }

  // 1) 反推:无 prompt 也允许,竞品图作为多模态输入
  const reverseRes = await api.post("/api/canvas/text-generate", {
    data: { mode: "reverse", prompt: "", sourceIds: [competitorId] },
  });
  assert.equal(reverseRes.status(), 200, await reverseRes.text());
  const reverseBody = await reverseRes.json();
  assert.equal(reverseBody.text, reverseText);
  const reverseCall = chatRequests.at(-1);
  const reverseSystem = String(reverseCall.messages[0].content);
  const reverseUserParts = reverseCall.messages[1].content;
  assert(reverseSystem.includes("逆向"), "reverse 系统词应为反推提示词");
  assert.equal(reverseUserParts.filter((part) => part.type === "image_url").length, 1, "reverse 应带 1 张竞品图");
  pass("reverse 反推:空 prompt 可用,上游收到反推系统词 + 1 张竞品图");

  // 2) 帮写:竞品图 + 产品图一起送上游,系统词为改写
  const assistRes = await api.post("/api/canvas/text-generate", {
    data: {
      mode: "assist",
      prompt: reverseText,
      sourceIds: [competitorId],
      productIds: [productId],
    },
  });
  assert.equal(assistRes.status(), 200, await assistRes.text());
  const assistBody = await assistRes.json();
  assert.equal(assistBody.text, assistText);
  const assistCall = chatRequests.at(-1);
  const assistSystem = String(assistCall.messages[0].content);
  const assistUserText = String(assistCall.messages[1].content.find((part) => part.type === "text").text);
  assert(assistSystem.includes("改写"), "assist 系统词应为改写提示词");
  assert.equal(
    assistCall.messages[1].content.filter((part) => part.type === "image_url").length,
    2,
    "assist 应带竞品图 + 产品图共 2 张"
  );
  assert(assistUserText.includes("用户自己产品"), "assist 应把产品图标注为用户产品");
  pass("assist 帮写:上游收到改写系统词 + 竞品/产品共 2 张图");

  // 3) text-nodes 持久化 productIds(同时验证 ensureSchema 自动补 product_ids 列)
  const nodeRes = await api.post("/api/canvas/text-nodes", {
    data: {
      id: `text-flow-${Date.now()}`,
      projectKey: `tree:${competitorId}`,
      title: "帮写提示词",
      content: "@产品白底图\n\n改写后的提示词",
      canvasX: 100,
      canvasY: 100,
      sourceIds: [competitorId],
      productIds: [productId],
    },
  });
  assert.equal(nodeRes.status(), 200, await nodeRes.text());
  const saved = (await nodeRes.json()).node;
  assert.deepEqual(saved.productIds, [productId], "持久化应保留 productIds");
  const listRes = await api.get("/api/canvas/text-nodes");
  const listed = (await listRes.json()).nodes.find((node) => node.id === saved.id);
  assert.deepEqual(listed?.productIds, [productId], "GET 列表应返回 productIds");
  const { rows } = await pool.query(
    `SELECT product_ids FROM app_canvas_text_nodes WHERE id = $1`,
    [saved.id]
  );
  assert.deepEqual(rows[0].product_ids, [productId], "数据库 product_ids 列应已自动创建并写入");
  pass("text-nodes:productIds 持久化 + product_ids 列自动迁移");

  // 4) 参数校验
  const noRef = await api.post("/api/canvas/text-generate", {
    data: { mode: "reverse", prompt: "", sourceIds: [] },
  });
  assert.equal(noRef.status(), 400);
  const noProduct = await api.post("/api/canvas/text-generate", {
    data: { mode: "assist", prompt: "x", sourceIds: [competitorId], productIds: [] },
  });
  assert.equal(noProduct.status(), 400);
  pass("参数校验:reverse 缺参考图 / assist 缺产品图 → 400");

  console.log(`\n全部通过 ✅ (${report.length} 项)`);
} catch (error) {
  console.error("\nFAIL", error);
  if (appLog.length) console.error(appLog.join("").slice(-4000));
  process.exitCode = 1;
} finally {
  await api?.dispose().catch(() => {});
  app?.kill();
  fixture?.close();
  await pool?.end().catch(() => {});
  try { execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" }); } catch {}
}
