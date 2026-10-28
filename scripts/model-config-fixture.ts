import { randomUUID } from "node:crypto";
import { createServer, type RequestListener } from "node:http";
import { Pool } from "pg";

export async function createModelFixture(handleRequest?: RequestListener) {
  if (process.env.NAUMI_VERIFY_ISOLATED_DB !== "1" || new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1")
    throw new Error("Requires isolated local PostgreSQL");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const name = `model_test_${randomUUID().replace(/-/g, "")}`;
  await admin.query(`CREATE SCHEMA ${name}`);
  const sql = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, options: `-c search_path=${name}`, max: 5 });
  const server = createServer(handleRequest || ((_req, res) => { res.writeHead(500); res.end("No generation permitted in registry tests"); }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const marker = `fixture-secret-${randomUUID()}`;
  process.env.SETTINGS_SECRET ||= "model-config-isolated-fixture-secret-20261004";
  const { createModelRepository } = await import("../src/lib/model-config/repository");
  const { createCredentialStore } = await import("../src/lib/model-config/credentials");
  const { ensureModelSchema } = await import("../src/lib/model-config/schema");
  const { fixtureModelConfig } = await import("./model-config-unit-fixture");
  await ensureModelSchema(sql);
  const credentials = createCredentialStore(sql);
  const credential = await credentials.importPlain({ providerId: "p1", plain: marker, actor: "fixture" });
  const config = fixtureModelConfig(`${origin}/v1`, credential.id);
  let initializations = 0;
  const trustedOrigins=[origin,...(process.env.NAUMI_MODEL_UI_IMAGE?[origin.replace('127.0.0.1','host.docker.internal')]:[])];
  const repo = createModelRepository({ pool: sql, initialize: async () => { initializations++; return config; }, trustedOrigins });
  return { repo, config, sql, credentials, marker, origin, schemaName: name, initializations: () => initializations,
    async cleanup() { await sql.end(); await admin.query(`DROP SCHEMA ${name} CASCADE`); await admin.end(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
