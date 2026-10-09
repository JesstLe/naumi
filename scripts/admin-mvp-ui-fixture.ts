/** Isolated local database and mock suppliers/Router. No production access. */
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";

async function main() {
  let close = async () => {}, activeDigest = "", queries = 0, paid = 0, dropNext = false;
  const publications = new Map<string, unknown>();
  const f = await createModelFixture(async (req, res) => {
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.url === "/stop") { send(200, {}); setTimeout(() => void close(), 150); return; }
    if (req.url === "/drop-next") { dropNext = true; send(200, {}); return; }
    if (req.url === "/stats") { send(200, { queries, paid }); return; }
    if (req.url?.endsWith("/models") && req.method === "GET") { queries++; if (queries === 1) await new Promise(resolve => setTimeout(resolve, 2500)); send(200, { data: [{ id: "gpt-image-2" }, { id: "gpt-image-1.5" }, { id: "catalog-image-new" }] }); return; }
    const parts: Buffer[] = []; for await (const chunk of req) parts.push(chunk);
    const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
    if (req.url === "/internal/config/state") return send(200, { digest: activeDigest });
    if (req.url === "/internal/config/prepare") return send(200, { digest: body.digest, phase: "prepared" });
    if (req.url === "/internal/config/activate") {
      if (body.expectedDigest !== activeDigest) return send(409, {});
      activeDigest = body.digest;
      const p = { id: body.id, digest: body.digest, phase: "applied" }; publications.set(body.id, p);
      if (dropNext) { dropNext = false; res.destroy(); return; }
      return send(200, p);
    }
    if (req.url?.startsWith("/internal/config/publications/")) { const p = publications.get(req.url.split("/").at(-1)!); return send(p ? 200 : 404, p || {}); }
    if (req.method === "POST") paid++;
    send(405, { error: "Generation forbidden" });
  });
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  process.env.NEXT_DIST_DIR = "output/admin-mvp-20261009/next";
  process.env.NAUMI_VIDEO_WORKER = "0";
  process.env.VIDEO_WORKER_SECRET = "mvp-ui-worker-private-secret-independent-long";
  process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
  process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN = "mvp-ui-router-private-token-independent-long";
  process.env.MODEL_CONFIG_ENVELOPE_SECRET = "mvp-ui-envelope-private-secret-independent-long";
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS = f.origin;
  f.config.providers[0].name = "图片模型源";
  f.config.upstreamModels[0].model = "gpt-image-2";
  f.config.publicModels[0].label = "灵动图片";
  f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: "u2", label: "图片备用模型", model: "gpt-image-1.5" });
  const textKey = await f.credentials.importPlain({ providerId: "p2", plain: "isolated-ui-text-key", actor: "fixture" });
  f.config.providers.push({ id: "p2", name: "文字模型源", protocol: "openai-chat", baseUrl: `${f.origin}/text/v1`, enabled: true, credentialRef: textKey.id, maxConcurrent: 4, timeoutMs: 120000 });
  f.config.upstreamModels.push({ ...structuredClone(f.config.upstreamModels[0]), id: "text1", providerId: "p2", label: "文字模型", model: "gpt-4.1", modality: "text", capabilities: { ...f.config.upstreamModels[0].capabilities, edit: false, vision: true, qualities: [], nativeResolutions: [] } });
  f.config.publicModels.push({ id: "smart-text", label: "创作助手", modality: "text", enabled: true, visible: true, target: { type: "upstream", id: "text1" } });
  Object.assign(f.config.bindings, { "agent.text": "smart-text", "text.generate": "smart-text", "vision.ocr": "smart-text" });
  const db = await import("../src/lib/db"), auth = await import("../src/lib/admin-auth"), native = await import("../src/lib/native-auth");
  await db.ensureSchema(); await f.repo.current(); await auth.setAdminPassword("MvpFixture2026!");
  await db.getOrCreateUser("mvp-member@example.test", "普通成员");
  const { createConfigRuntime } = await import("../src/lib/billing/catalog");
  await createConfigRuntime({ pool: f.sql, ensureSchema: db.ensureSchema, initialize: async () => fixtureConfig() }).current();
  await mkdir("output/admin-mvp-20261009", { recursive: true });
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "54989"], { env: process.env, windowsHide: true, stdio: "inherit" });
  let closing = false;
  close = async () => {
    if (closing) return; closing = true;
    if (process.platform === "win32") await new Promise(resolve => spawn("taskkill", ["/pid", String(next.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).once("exit", resolve));
    else next.kill();
    await db.getPool().end(); await f.cleanup(); await rm("output/admin-mvp-20261009/fixture.json", { force: true }); process.exit(0);
  };
  await writeFile("output/admin-mvp-20261009/fixture.json", JSON.stringify({ control: f.origin, memberCookie: native.signUserSession("mvp-member@example.test", Date.now()), schemaName: f.schemaName }));
  process.on("SIGINT", () => void close()); process.on("SIGTERM", () => void close());
}
main().catch(e => { console.error(e); process.exitCode = 1; });
