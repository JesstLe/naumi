import { spawn } from "node:child_process";
import { writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createModelFixture } from "./model-config-fixture";
async function main() {
  const f = await createModelFixture((req, res) => { if (req.url === "/stop") { res.end("ok"); setTimeout(() => void close(), 100); return; } res.writeHead(405); res.end("No generation"); });
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  process.env.NEXT_DIST_DIR = "output/provenance-ui-next";
  process.env.NAUMI_VIDEO_WORKER = "0";
  process.env.NAUMI_MULTI_USER = "1";
  process.env.NAUMI_EDITION = "cloud";
  process.env.VIDEO_WORKER_SECRET = "provenance-fixture-worker-independent-secret-20261007";
  process.env.STORAGE_DRIVER = "local";
  process.env.MEDIA_DIR = path.resolve("output/provenance-fix-20261007/ui-media");
  const db = await import("../src/lib/db"), bi = await import("../src/lib/bi/repository"), auth = await import("../src/lib/admin-auth");
  await bi.ensureBiSchema(); await auth.setAdminPassword("ProvenanceFixture2026!");
  await db.setSetting("multi_user_enabled", "1");
  const email = "provenance-ui@example.test";
  await db.getOrCreateUser(email, "溯源验收");
  const dir = path.join(process.env.MEDIA_DIR, "canvas-uploads"); await mkdir(dir, { recursive: true });
  const image = await sharp({ create: { width: 750, height: 1000, channels: 3, background: "#ece6dc" } }).composite([{ input: Buffer.from('<svg width="750" height="1000"><rect x="245" y="190" width="260" height="630" fill="#e5d3b2"/><rect x="275" y="120" width="200" height="95" fill="#3b403e"/><text x="375" y="435" text-anchor="middle" font-size="48" fill="#292e2b">SAMPLE</text><text x="375" y="490" text-anchor="middle" font-size="25" fill="#50564f">PROVENANCE TEST</text></svg>') }]).png().toBuffer();
  await writeFile(path.join(dir, "ui-upload.png"), image);
  const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: "验收样本 · 上传图片", category: "main", prompt: "", status: "completed", image: "/media/canvas-uploads/ui-upload.png", gradient: "from-slate-100 to-white", width: 750, height: 1000, ...extra });
  await db.addArtworks(email, [item("ui-upload", { creationProvenance: { version: 1, operation: "upload", entry: "canvas", ref: "ui-upload", evidence: "server-route" } }), item("ui-copy", { title: "验收样本 · 复制作品", creationProvenance: { version: 1, operation: "copy", entry: "works", ref: "ui-copy", sourceArtworkId: "ui-upload", evidence: "server-route" } }), item("ui-unknown", { title: "验收样本 · 历史证据不足", image: "/media/unknown.png" }), item("ui-job", { title: "验收样本 · 历史生成任务", image: "/media/generated.png", batchId: "b-job-ui", resolution: "1K" })]);
  await f.sql.query("UPDATE app_artworks SET creation_provenance=NULL WHERE id IN ('ui-job','ui-unknown')");
  await f.sql.query("INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered,billing_settled) VALUES('job-ui',$1,'generate','{\"status\":\"done\"}','{\"p\":{\"origin\":\"\"}}',false,true)", [email]);
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "54982"], { env: process.env, windowsHide: true, stdio: "inherit" });
  let closing = false;
  async function close() { if (closing) return; closing = true; const kill = spawn("taskkill", ["/pid", String(next.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); await new Promise(resolve => kill.once("exit", resolve)); await db.getPool().end(); await f.cleanup(); await rm("output/provenance-fix-20261007/ui-fixture.json", { force: true }); process.exit(0); }
  await writeFile("output/provenance-fix-20261007/ui-fixture.json", JSON.stringify({ control: f.origin, schemaName: f.schemaName }));
  process.on("SIGINT", () => void close()); process.on("SIGTERM", () => void close());
}
main().catch(error => { console.error(error); process.exitCode = 1; });
