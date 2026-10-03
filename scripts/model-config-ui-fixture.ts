/** Disposable local BI fixture. It never connects to production or paid suppliers. */
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createModelFixture } from "./model-config-fixture";
import { fixtureConfig } from "./billing-unit-fixture";

async function main() {
  const source = process.env.NAUMI_VERIFY_ROUTER_SOURCE;
  if (!source)
    throw new Error(
      "Set NAUMI_VERIFY_ROUTER_SOURCE to the isolated Router checkout",
    );
  const folder = await mkdtemp(join(tmpdir(), "naumi-model-ui-"));
  let dropActivation = false,
    activations = 0,
    generationRequests = 0;
  let close = async () => {};
  const f = await createModelFixture(async (req, res) => {
    if (req.url === "/fixture/drop-next-activation" && req.method === "POST") {
      dropActivation = true;
      res.end("ok");
      return;
    }
    if (req.url === "/fixture/stop" && req.method === "POST") {
      res.end("ok");
      setTimeout(() => void close(), 100);
      return;
    }
    if (req.url === "/fixture/metrics") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ activations, generationRequests }));
      return;
    }
    if (!req.url?.startsWith("/internal/config/")) {
      generationRequests++;
      res.writeHead(405);
      res.end("No supplier calls allowed in BI tests");
      return;
    }
    try {
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      const activation = req.url === "/internal/config/activate";
      const response = await fetch(`http://127.0.0.1:54982${req.url}`, {
        method: req.method,
        headers: {
          authorization: String(req.headers.authorization || ""),
          "content-type": "application/json",
        },
        ...(parts.length ? { body: Buffer.concat(parts) } : {}),
      });
      const body = await response.arrayBuffer();
      if (activation) activations++;
      if (activation && dropActivation) {
        dropActivation = false;
        res.destroy();
        return;
      }
      res.writeHead(response.status, { "content-type": "application/json" });
      res.end(Buffer.from(body));
    } catch {
      res.writeHead(503);
      res.end("Fixture control unavailable");
    }
  });
  process.env.PGOPTIONS = `-c search_path=${f.schemaName}`;
  process.env.NEXT_DIST_DIR = "output/model-ui-next";
  process.env.MEDIA_DIR = join(folder, "media");
  process.env.STORAGE_DRIVER = "local";
  process.env.VIDEO_WORKER_SECRET =
    "fixture-ui-video-worker-independent-20261004";
  process.env.NAUMI_ROUTER_MANAGEMENT_URL = f.origin;
  process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN =
    "fixture-ui-model-control-independent-20261004";
  process.env.MODEL_CONFIG_ENVELOPE_SECRET =
    "fixture-ui-model-envelope-independent-20261004";
  process.env.MODEL_CONFIG_TRUSTED_ORIGINS = `${f.origin},http://127.0.0.1:54982`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  const db = await import("../src/lib/db");
  await db.ensureSchema();
  const { setAdminPassword } = await import("../src/lib/admin-auth");
  await setAdminPassword("ModelUiFixture2026!");
  await f.repo.current();
  const { createConfigRuntime } = await import("../src/lib/billing/catalog");
  const costs = fixtureConfig();
  costs.costs["supplier-cost-estimate"] = {
    currency: "CNY",
    amountMicros: "290000",
    unit: "task",
    source: "manual-estimate",
  };
  await createConfigRuntime({
    pool: f.sql,
    ensureSchema: db.ensureSchema,
    initialize: async () => costs,
  }).current();
  const executable = join(folder, "router.exe");
  const build = spawnSync("go", ["build", "-o", executable, "./cmd/server"], {
    cwd: source,
    encoding: "utf8",
  });
  if (build.status !== 0)
    throw new Error(build.stderr || "Fixture Router build failed");
  const router = spawn(executable, [], {
    cwd: source,
    env: {
      ...process.env,
      NAUMI_ROUTER_TOKEN: "fixture-ui-generation-independent-20261004",
      NAUMI_HTTP_ADDR: "127.0.0.1:54981",
      NAUMI_ROUTER_MANAGEMENT_ADDR: "127.0.0.1:54982",
      NAUMI_ROUTES_CONFIG: resolve(source, "config/routes.example.json"),
      NAUMI_STATE_DIR: join(folder, "state"),
    },
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
  const next = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "54980",
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"],
      windowsHide: true,
    },
  );
  await mkdir("output", { recursive: true });
  await writeFile(
    "output/model-ui-fixture.json",
    JSON.stringify({
      schemaName: f.schemaName,
      folder,
      controlOrigin: f.origin,
      routerPID: router.pid,
      nextPID: next.pid,
    }),
  );
  console.log(
    "BI fixture: http://127.0.0.1:54980/admin (password: ModelUiFixture2026!, disposable test account only)",
  );
  let closing = false;
  close = async () => {
    if (closing) return;
    closing = true;
    router.kill();
    next.kill();
    await new Promise((r) => setTimeout(r, 1000));
    await db.getPool().end();
    await f.cleanup();
    await rm(folder, { recursive: true, force: true });
    await rm("output/model-ui-fixture.json", { force: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void close());
  process.on("SIGTERM", () => void close());
  for (const child of [router, next])
    child.on("exit", () => {
      if (!closing) void close();
    });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
