/** Compiles actual Next middleware/route bundles against an isolated local PG. */
import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

async function main() {
  const observer = process.env.RELEASE_FIXTURE_OBSERVER_PATH;
  if (!observer) throw Error("RELEASE_FIXTURE_OBSERVER_PATH_REQUIRED");
  const root = process.cwd(), dir = resolve("output/app-drain/next-fixture"), port = 43213;
  const database = "postgresql://postgres:fixture-only-local@127.0.0.1:55438/release_fixture";
  await mkdir(resolve(dir, "src/app/api/fixture"), { recursive: true });
  await mkdir(resolve(dir, "src/app/api/internal/release/status"), { recursive: true });
  await mkdir(resolve(dir, "src/app/api/internal/release/control"), { recursive: true });
  await mkdir(resolve(dir, "src/lib/release-runtime"), { recursive: true });
  await symlink(resolve(root, "node_modules"), resolve(dir, "node_modules"), "junction").catch((e) => { if (e.code !== "EEXIST") throw e; });
  for (const name of ["identity", "store", "http", "agent-activity"]) await copyFile(resolve(root, `src/lib/release-runtime/${name}.ts`), resolve(dir, `src/lib/release-runtime/${name}.ts`));
  await writeFile(resolve(dir, "package.json"), JSON.stringify({ name: "release-next-bundle-fixture", private: true }));
  await writeFile(resolve(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "es2017", lib: ["dom", "esnext"], jsx: "preserve", module: "esnext", moduleResolution: "bundler", esModuleInterop: true, skipLibCheck: true, baseUrl: ".", paths: { "@/*": ["./src/*"] } } }));
  await writeFile(resolve(dir, "next.config.mjs"), `export default {serverExternalPackages:['pg'],experimental:{cpus:1}};\n`);
  await writeFile(resolve(dir, "src/app/layout.tsx"), "export default function Layout({children}) {return <html><body>{children}</body></html>}");
  await writeFile(resolve(dir, "src/app/page.tsx"), "export default function Page(){return <main>local fixture</main>}");
  await writeFile(resolve(dir, "src/middleware.ts"), `import {NextResponse} from 'next/server';import {checkAdmission} from '@/lib/release-runtime/store';import {releaseIdentity,releaseError,releaseProcessRegistry} from '@/lib/release-runtime/identity';export async function middleware(req){if(req.nextUrl.pathname.startsWith('/api/internal/'))return NextResponse.next();try{await checkAdmission();const h=new Headers(req.headers);h.set('x-fixture-mid-boot',releaseIdentity().bootId);h.set('x-fixture-mid-runtime',releaseProcessRegistry().runtimeId);return NextResponse.next({request:{headers:h}})}catch(e){return releaseError(e)}}export const config={runtime:'nodejs',matcher:['/api/:path*']};`);
  await writeFile(resolve(dir, "src/app/api/fixture/route.ts"), `import {releaseIdentity,releaseProcessRegistry} from '@/lib/release-runtime/identity';import {observeReleaseRequest} from '@/lib/release-runtime/http';export const runtime='nodejs';export async function GET(req){return observeReleaseRequest(req,async()=>{const headers={'content-type':'text/event-stream','x-fixture-route-boot':releaseIdentity().bootId,'x-fixture-mid-boot':req.headers.get('x-fixture-mid-boot')||'','x-fixture-route-runtime':releaseProcessRegistry().runtimeId,'x-fixture-mid-runtime':req.headers.get('x-fixture-mid-runtime')||''};let timer;return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('event: first\\ndata: local\\n\\n'));timer=setTimeout(()=>c.close(),2000)},cancel(){clearTimeout(timer)} }),{headers})})};`);
  for (const entry of ["status", "control"]) await copyFile(resolve(root, `src/app/api/internal/release/${entry}/route.ts`), resolve(dir, `src/app/api/internal/release/${entry}/route.ts`));
  const runner = resolve(dir, "server.cjs");
  await writeFile(runner, `process.chdir(${JSON.stringify(dir)});require(${JSON.stringify(resolve(observer))});const http=require('node:http');const next=require(${JSON.stringify(resolve(root, "node_modules/next"))});const app=next({dev:true,dir:${JSON.stringify(dir)},hostname:'127.0.0.1',port:${port}});app.prepare().then(()=>{http.createServer(app.getRequestHandler()).listen(${port},'127.0.0.1',()=>console.log('NEXT_FIXTURE_READY'))}).catch(e=>{console.error(e);process.exit(1)});`);
  const secret = "fixture-release-secret-not-for-production-32";
  const child = spawn(process.execPath, [runner], { cwd: root, env: { ...process.env, NODE_OPTIONS: "", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: database, NAUMI_RELEASE_RUNTIME: "1", NAUMI_INSTANCE_ID: "fixture-next", SOURCE_COMMIT: "a".repeat(40), RELEASE_CONTROL_SECRET: secret, NAUMI_RELEASE_ADMISSION_START: "open", NAUMI_VIDEO_WORKER: "0", PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (b) => process.stdout.write(b)); child.stderr.on("data", (b) => process.stderr.write(b));
  try {
    await new Promise<void>((done, reject) => { const timer = setTimeout(() => reject(Error("NEXT_FIXTURE_START_TIMEOUT")), 90000); child.stdout.on("data", (b) => { if (String(b).includes("NEXT_FIXTURE_READY")) { clearTimeout(timer); done(); } }); child.once("exit", (code) => { clearTimeout(timer); reject(Error(`NEXT_FIXTURE_EXIT_${code}`)); }); });
    const headers = { "x-release-control-secret": secret, "content-type": "application/json" };
    const getStatus = async () => { const r = await fetch(`http://127.0.0.1:${port}/api/internal/release/status`, { headers, signal: AbortSignal.timeout(60000) }); assert.equal(r.status, 200); return r.json(); };
    const response = await fetch(`http://127.0.0.1:${port}/api/fixture`, { signal: AbortSignal.timeout(60000) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-fixture-mid-boot"), response.headers.get("x-fixture-route-boot"));
    console.log("PASS actual Next middleware and route share preload boot");
    assert.equal(response.headers.get("x-fixture-mid-runtime"), response.headers.get("x-fixture-route-runtime"));
    console.log("PASS actual Next bundles share node-process registry (not module Map)");
    const reader = response.body!.getReader(); assert.match(new TextDecoder().decode((await reader.read()).value), /event: first/);
    const during = await getStatus();
    assert.equal(during.transport.verified, true); assert.equal(during.observations.activeRequests, 1); assert.equal(during.observations.trackedRequests, 1);
    console.log("PASS status sees actual middleware-route PG lease and preload HTTP request");
    assert.equal(during.observations.acceptedTasks, null); assert.equal(during.coverage.allBackgroundAcceptedWork, false);
    console.log("PASS actual Next status remains partial for unobserved background work");
    await reader.cancel(); await new Promise((r) => setTimeout(r, 100));
    const idle = await getStatus(); assert.equal(idle.observations.activeRequests, 0); assert.equal(idle.observations.trackedRequests, 0);
    console.log("PASS actual Next SSE cancellation drains request but not imagined jobs");
    const drained = await fetch(`http://127.0.0.1:${port}/api/internal/release/control`, { method: "POST", headers, body: JSON.stringify({ instanceId: idle.identity.instanceId, bootId: idle.identity.bootId, expectedRevision: idle.admission.revision, operationId: crypto.randomUUID(), action: "drain" }) }); assert.equal(drained.status, 200);
    const denied = await fetch(`http://127.0.0.1:${port}/api/fixture`); assert.equal(denied.status, 503);
    console.log("PASS PG drain from route status/control is enforced in actual Next middleware bundle");
    console.log("NEXT_BUNDLE_CHECKS=6");
  } finally { child.kill("SIGKILL"); }
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
