import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { build } from "esbuild";

const root = process.cwd(), out = path.join(root, "output/canvas-sharing-evidence"), identity = randomUUID();
const name = `naumi-canvas-share-${identity}`, label = `naumi.canvas-sharing.fixture=${identity}`;
function docker(args, allowFailure = false) {
  const p = spawnSync("docker", args, { encoding: "utf8", windowsHide: true });
  if (p.status && !allowFailure) throw new Error(`docker ${args[0]}: ${p.stderr}`);
  return p;
}
await mkdir(out, { recursive: true });
let container = false, exit = 1;
try {
  docker(["run", "--detach", "--name", name, "--label", label, "--memory", "256m", "--cpus", "1", "--pids-limit", "100", "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD=fixture-local-only", "--env", "POSTGRES_DB=canvas_sharing_fixture", "postgres:16-alpine", "-c", "max_connections=20", "-c", "shared_buffers=32MB"]); container = true;
  const inspection = JSON.parse(docker(["inspect", name]).stdout)[0];
  const port = inspection.NetworkSettings.Ports["5432/tcp"][0].HostPort;
  if (inspection.HostConfig.Memory !== 268435456 || inspection.HostConfig.NanoCpus !== 1000000000 || inspection.Config.Labels["naumi.canvas-sharing.fixture"] !== identity) throw new Error("Fixture resource/identity mismatch");
  const databaseUrl = `postgresql://postgres:fixture-local-only@127.0.0.1:${port}/canvas_sharing_fixture?sslmode=disable`;
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });
    try { await client.connect(); ready = (await client.query("SELECT 1 AS ready")).rows[0].ready === 1; } catch {} finally { await client.end().catch(() => {}); }
    if (ready) break; await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error("TCP SELECT 1 readiness failed");
  console.log("FIXTURE=real_pg16 loopback_random_port memory_256MiB cpu_1 TCP_SELECT1_READY");
  await build({ entryPoints: ["scripts/verify-canvas-sharing.ts"], outfile: path.join(out, "suite.cjs"), bundle: true, platform: "node", format: "cjs", packages: "external", target: "node24", logLevel: "silent", plugins: [{ name: "declared-external-enterprise-contract", setup(b) {
    b.onResolve({ filter: /enterprise\/collaboration-access$/ }, () => ({ path: path.join(root, "scripts/verify-canvas-sharing.scope-fixture.ts") }));
    // Installed package declares type=module around its CJS entry; bundle its official ESM entry without editing shared dependencies.
    b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: path.join(root, "node_modules/lucide-react/dist/esm/lucide-react.js") }));
  } }] });
  const env = { ...process.env, DATABASE_URL: databaseUrl, STORAGE_DRIVER: "local", MEDIA_PRIVATE: "1", MEDIA_DIR: path.join(out, `media-${identity}`), PGPOOL_MAX: "3", NAUMI_DB_POOL_BUDGET: "15" };
  // No .env loader; tests never derive connection details or credentials from project configuration.
  const run = spawnSync(process.execPath, ["--conditions=react-server", path.join(out, "suite.cjs")], { env, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  process.stdout.write(run.stdout || ""); process.stderr.write(run.stderr || ""); exit = run.status ?? 1;
  await writeFile(path.join(out, "modified-test.txt"), `${run.stdout || ""}${run.stderr || ""}\nEXIT=${exit}\n`);
  await writeFile(path.join(out, "fixture.json"), JSON.stringify({ identity, name, port, memory: inspection.HostConfig.Memory, nanoCpus: inspection.HostConfig.NanoCpus, ready, exit }, null, 2));
} finally {
  if (container) {
    const inspect = docker(["inspect", name], true);
    if (inspect.status === 0) {
      if (JSON.parse(inspect.stdout)[0].Config.Labels["naumi.canvas-sharing.fixture"] !== identity) throw new Error("Cleanup identity mismatch");
      docker(["rm", "--force", name]);
    }
    const remaining = docker(["ps", "-a", "--filter", `label=${label}`, "--format", "{{.ID}}"]);
    if (remaining.stdout.trim()) throw new Error("Owned fixture remains");
    console.log("FIXTURE_CLEANUP=PASS owned_container_removed");
  }
}
process.exitCode = exit;
