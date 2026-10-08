import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, existsSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { PricingStore, ServiceError } from "./store";
import { matrix, price } from "./core";
import { FEATURE_IDS } from "../../src/lib/billing/rules/registry";

const dir = dirname(fileURLToPath(import.meta.url));
const publishSchema = z.strictObject({ expectedVersion: z.number().int().positive(), expectedRevision: z.number().int().positive(), reason: z.string().trim().min(1).max(300) });
const rollbackSchema = z.strictObject({ expectedVersion: z.number().int().positive(), targetVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(300) });
const saveSchema = z.strictObject({ expectedRevision: z.number().int().positive(), config: z.unknown() });
function isAuthorized(req: IncomingMessage, token: string) { const actual = Buffer.from(req.headers.authorization || ""), wanted = Buffer.from(`Bearer ${token}`); return actual.length === wanted.length && timingSafeEqual(actual, wanted); }
async function body(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new ServiceError(415, "CONTENT_TYPE", "请提交JSON");
  let chunks: Buffer[] = [], size = 0;
  for await (const c of req) { size += c.length; if (size > 256000) throw new ServiceError(413, "BODY_TOO_LARGE", "请求过大"); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new ServiceError(400, "INVALID_JSON", "JSON格式无效"); }
}
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); }
export function createPricingServer(store: PricingStore, token: string) {
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    const expectedHost = `127.0.0.1:${(server.address() as any)?.port}`;
    const host = req.headers.host;
    if (host !== expectedHost && host !== `localhost:${(server.address() as any)?.port}`) return json(res, 403, { error: "HOST_REJECTED" });
    try {
      const u = new URL(req.url || "/", `http://${host}`), method = req.method;
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new ServiceError(403, "ORIGIN_REJECTED", "来源不匹配");
      if (method === "GET" && u.pathname === "/health") return json(res, 200, { status: "ok", service: "naumi-pricing", mode: "standalone-preview", version: store.snapshot().version, productionApplied: false });
      if (method === "GET" && ["/", "/app.js", "/styles.css"].includes(u.pathname)) {
        const name = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
        res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        res.writeHead(200, { "Content-Type": name.endsWith("html") ? "text/html; charset=utf-8" : name.endsWith("js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(readFileSync(resolve(dir, "public", name)));
      }
      if (!isAuthorized(req, token)) throw new ServiceError(401, "ADMIN_REQUIRED", "请先输入本地管理口令");
      if (method === "GET" && u.pathname === "/v1/state") return json(res, 200, { current: store.snapshot(), draft: store.draft(), history: store.history(), features: FEATURE_IDS, sources: store.catalog.sources, catalogDate: store.catalog.checked_date, mode: "standalone-preview" });
      if (method === "GET" && u.pathname === "/v1/matrix") { const s = store.snapshot(); return json(res, 200, { version: s.version, rows: matrix(s.config, store.catalog, u.searchParams.get("publicId") || s.config.aliases[0].publicId, u.searchParams.get("resolution") || undefined) }); }
      if (method === "GET" && u.pathname === "/v1/export") return json(res, 200, store.exportPackage());
      if (method === "GET" && u.pathname.startsWith("/v1/quotes/")) return json(res, 200, store.getQuote(u.pathname.slice(11)));
      if (method === "POST" && u.pathname === "/v1/preview") { const b = z.strictObject({ config: z.unknown(), publicId: z.string(), resolution: z.string().optional() }).parse(await body(req)); const { validateConfig } = await import("./core"); return json(res, 200, { rows: matrix(validateConfig(b.config, store.catalog), store.catalog, b.publicId, b.resolution) }); }
      if (method === "POST" && u.pathname === "/v1/draft") { const b = saveSchema.parse(await body(req)); return json(res, 200, store.saveDraft(b.config, b.expectedRevision, "local-admin")); }
      if (method === "POST" && u.pathname === "/v1/apply") { const b = publishSchema.parse(await body(req)); return json(res, 200, { ...store.publish(b.expectedVersion, b.expectedRevision, b.reason, "local-admin"), productionApplied: false }); }
      if (method === "POST" && u.pathname === "/v1/rollback") { const b = rollbackSchema.parse(await body(req)); return json(res, 200, { ...store.rollback(b.targetVersion, b.expectedVersion, b.reason, "local-admin"), productionApplied: false }); }
      if (method === "POST" && u.pathname === "/v1/quote") { const key = req.headers["idempotency-key"]; if (typeof key !== "string" || !/^[a-zA-Z0-9._:-]{1,100}$/.test(key)) throw new ServiceError(400, "KEY_REQUIRED", "报价必须有稳定的Idempotency-Key"); return json(res, 200, store.freeze(await body(req), key)); }
      if (method === "POST" && u.pathname === "/v1/try") return json(res, 200, { ...price(store.snapshot().config, store.catalog, await body(req)), mode: "standalone-preview" });
      throw new ServiceError(404, "NOT_FOUND", "接口不存在");
    } catch (error) {
      if (error instanceof ServiceError) return json(res, error.status, { error: error.code, message: error.message });
      if (error instanceof z.ZodError) return json(res, 400, { error: "VALIDATION", message: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("；") });
      return json(res, 400, { error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "请求失败" });
    }
  });
  return server;
}
export async function start() {
  if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("独立服务需要Node 24+");
  const dataDir = resolve(process.env.PRICING_DATA_DIR || resolve(dir, ".data"));
  mkdirSync(dataDir, { recursive: true });
  if (process.platform === "win32") {
    const who = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    execFileSync("icacls.exe", [dataDir, "/inheritance:r", "/grant:r", `${who}:(OI)(CI)F`], { stdio: "ignore", windowsHide: true });
  } else chmodSync(dataDir, 0o700);
  const store = new PricingStore(resolve(dataDir, "pricing.sqlite"), resolve(dir, "catalog.json"));
  const tokenPath = resolve(dataDir, "admin-token.txt");
  let token = process.env.PRICING_ADMIN_TOKEN || (existsSync(tokenPath) ? readFileSync(tokenPath, "utf8").trim() : randomBytes(32).toString("hex"));
  if (token.length < 24) throw new Error("管理口令至少24字符");
  if (!existsSync(tokenPath) && !process.env.PRICING_ADMIN_TOKEN) { writeFileSync(tokenPath, token, { mode: 0o600, flag: "wx" }); chmodSync(tokenPath, 0o600); }
  if (process.platform === "win32" && existsSync(tokenPath)) execFileSync("icacls.exe", [tokenPath, "/inheritance:r", "/grant:r", `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(R,W)`], { stdio: "ignore", windowsHide: true });
  const server = createPricingServer(store, token);
  const port = Number(process.env.PRICING_PORT || 4317);
  await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve));
  console.log(`定价服务：http://127.0.0.1:${(server.address() as any).port} / 独立验收 / 管理口令保存在本地受保护文件（不输出口令）`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => server.close(() => { store.close(); process.exit(0); }));
  return { server, store };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start().catch(e => { console.error(e.message); process.exitCode = 1; });
