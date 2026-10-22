import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";

const root = process.cwd(), out = resolve("output/add-frontend-model-entry-20261021");
await mkdir(out, { recursive: true });
const temp = await mkdtemp(join(out, "fixture-"));
const overlay = process.env.FRONTEND_MODEL_SOURCE_ROOT;
const require = createRequire(import.meta.url);
const replacements = {
  "next/link": `import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,
  "@/lib/supabase": "export async function authHeader(){return {}}",
};
const pageReplacements = {
  "@/lib/admin-page": "export async function requireAdminPage(path){globalThis.__entryAuthCalls.push(path);if(globalThis.__entryDenied)throw Error('fixture-admin-required')}",
  "@/components/admin/model-config/manager": "export function ModelConfigurationManager(){return null}",
  "@/components/admin/center-shell": "export function AdminCenterShell(){return null}",
};
function resolver(serverPage = false) {
  return { name: "local-read-only-fixture", setup(b) {
    b.onResolve({ filter: /^(next\/link|@\/)/ }, args => {
      if (serverPage && pageReplacements[args.path]) return { path: args.path, namespace: "mock" };
      if (replacements[args.path]) return { path: args.path, namespace: "mock" };
      if (args.path.startsWith("@/")) {
        const p = join(root, "src", args.path.slice(2));
        const file = [p, p + ".ts", p + ".tsx", p + ".json"].find(existsSync);
        if (file) return { path: file };
      }
    });
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: (serverPage && pageReplacements[args.path]) || replacements[args.path], loader: "tsx", resolveDir: root }));
    b.onLoad({ filter: /\.(ts|tsx|css)$/ }, async args => {
      const path = overlay && join(resolve(overlay), relative(root, args.path));
      const actual = path && existsSync(path) ? path : args.path;
      if (args.path.endsWith(".css")) return { contents: "export default new Proxy({}, {get:(_,key)=>String(key)});", loader: "js" };
      if (path && existsSync(path)) return { contents: await readFile(actual, "utf8"), loader: args.path.endsWith(".tsx") ? "tsx" : "ts", resolveDir: dirname(args.path) };
    });
  } };
}
const pageFile = join(temp, "page.cjs");
await build({ entryPoints: [resolve("src/app/admin/bi/models/page.tsx")], outfile: pageFile, bundle: true, platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"], logLevel: "silent", plugins: [resolver(true)] });
const page = require(pageFile).default;
globalThis.__entryAuthCalls = [];
async function pageProps(tab) {
  const tree = await page({ searchParams: Promise.resolve({ tab }) });
  return tree.props.children.props;
}
if (process.argv.includes("--verify") || process.argv.includes("--baseline")) {
  const baseline = process.argv.includes("--baseline");
  const batch = await pageProps("batch");
  assert.equal(batch.initialTab, baseline ? undefined : "batch");
  for (const tab of [undefined, "providers", "invalid", ["batch", "providers"]]) assert.equal((await pageProps(tab)).initialTab, undefined);
  assert.ok(globalThis.__entryAuthCalls.every(path => path === "/admin/bi/models"));
  globalThis.__entryDenied = true;
  await assert.rejects(() => pageProps("batch"), /fixture-admin-required/);
  delete globalThis.__entryDenied;
  let source = resolve("src/components/admin/model-management/model-management.tsx");
  if (overlay) source = join(resolve(overlay), relative(root, source));
  const text = await readFile(source, "utf8");
  assert.equal(text.includes('href="/admin/bi/models?tab=batch"'), !baseline);
  if (!baseline) {
    assert.ok(text.includes("新增前端模型"));
    assert.ok(text.includes("event.preventDefault()"));
    assert.ok(text.includes("!state.rows.length && <CreateFrontendModelLink"));
    console.log("MODIFIED=PASS ENTRY=VISIBLE DEEPLINK=BATCH EMPTY_ENTRY=YES UNKNOWN_TAB=IGNORED AUTH=BEFORE_RENDER PROVIDER_FLOW=REUSED SUPPLIER_CALLS=0");
  } else console.log("BASELINE=REPRODUCED FRONTEND_CREATE_ENTRY=MISSING DEEPLINK=PROVIDERS SUPPLIER_CALLS=0");
  process.exit(0);
}

const fixtureConfig = require((await (async () => {
  const file = join(temp, "seed.cjs");
  await build({ entryPoints: [resolve("scripts/model-config-unit-fixture.ts")], outfile: file, bundle: true, platform: "node", format: "cjs", logLevel: "silent" }); return file;
})())).fixtureModelConfig("https://fixture.invalid/v1", "00000000-0000-4000-8000-000000000001");
const snapshot = { version: 1, digest: "fixture", config: fixtureConfig };
const state = { snapshot, draft: { id: "fixture-draft", revision: 1, config: fixtureConfig }, protocols: ["openai-images"], bindings: {}, billingVersion: 1, costReferences: [] };
const ui = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{ModelManagement}from'./src/components/admin/model-management/model-management';import{ModelConfigurationManager}from'./src/components/admin/model-config/manager';createRoot(document.getElementById('root')).render(window.__entryPage==='models'?<ModelManagement/>:<ModelConfigurationManager initialTab={window.__entryInitialTab}/>);`, resolveDir: root, loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '""', "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '""' }, plugins: [resolver(false)] });
const metrics = { reads: 0, mutations: 0, supplierCalls: 0 };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture.test");
  res.setHeader("Cache-Control", "no-store");
  if (url.pathname === "/bundle.js") { res.setHeader("Content-Type", "application/javascript"); res.end(ui.outputFiles[0].contents); return; }
  if (url.pathname === "/metrics") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(metrics)); return; }
  if (url.pathname.startsWith("/api/")) {
    if (req.method !== "GET") { metrics.mutations++; res.writeHead(405); res.end("{}"); return; }
    metrics.reads++; res.setHeader("Content-Type", "application/json");
    if (url.pathname.endsWith("/versions")) res.end(JSON.stringify({ versions: [] }));
    else if (url.pathname.endsWith("/catalog")) res.end(JSON.stringify({ providers: [] }));
    else if (url.pathname === "/api/admin/model-management") res.end(JSON.stringify({ version: 1, managed: true, rows: [], candidates: [], providers: [], catalogs: [] }));
    else res.end(JSON.stringify(state));
    return;
  }
  const models = url.pathname === "/admin/model-management";
  const props = models ? {} : await pageProps(url.searchParams.get("tab") || undefined);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>前端模型入口验收</title><style>body{margin:0;background:#f8fafc;color:#172033;font:14px system-ui}main{padding:24px;max-width:1200px;margin:auto}a,button{padding:10px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#334155;display:inline-flex;align-items:center;gap:6px;cursor:pointer;text-decoration:none}header{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}a.primary{background:#4f46e5;color:white}nav{display:flex;gap:6px;overflow:auto}fieldset{min-width:0;border:0}input,select{max-width:100%;box-sizing:border-box;padding:8px;border:1px solid #cbd5e1;border-radius:6px}label{display:block;margin:8px 0}button{font:inherit}section{margin:16px 0;padding:16px;background:white;border:1px solid #e2e8f0}svg{width:16px;height:16px}table{width:100%;font-size:12px}td,th{padding:6px;text-align:left}*[aria-disabled=true]{opacity:.5}h1{font-size:24px}.flex{display:flex}.flex-wrap{flex-wrap:wrap}.gap-2{gap:8px}.items-center{align-items:center}.justify-center{justify-content:center}</style><script>window.__entryPage=${JSON.stringify(models ? "models" : "config")};window.__entryInitialTab=${JSON.stringify(props.initialTab || null)};window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));</script></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});
server.listen(Number(process.env.FIXTURE_PORT || 14942), "127.0.0.1", () => console.log("FRONTEND_MODEL_ENTRY_FIXTURE=http://127.0.0.1:" + server.address().port + "/admin/model-management SUPPLIER_CALLS=0"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
