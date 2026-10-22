import { createServer } from "node:http";
import { build } from "esbuild";
import { resolve } from "node:path";

// Isolated browser fixture for the actual workbench bridge. No production API.
const suffixes = ["three-four", "landscape", "four-three", "square", "portrait"];
const models = [
  { id: "gpt-image-2", label: "GPT-Image-2.5" },
  ...suffixes.map(s => ({ id: `gemini-3.0-pro-image-${s}`, label: "Nano Banana Pro" })),
  ...suffixes.map(s => ({ id: `gemini-3.1-flash-image-${s}`, label: "Nano Banana 2" })),
  ...["portrait", "landscape"].map(s => ({ id: `imagen-4.0-generate-preview-${s}`, label: "Imagen-4" })),
  { id: "gpt-image-2.5-flare", label: "GPT" }, { id: "gpt-image-2.5-sunburst", label: "GPT" },
  { id: "custom-portrait", label: "Custom" }, { id: "custom-landscape", label: "Custom" },
];
const asset = await build({
  entryPoints: [resolve("src/lib/reference-workbench/browser.ts")], bundle: true, write: false,
  platform: "browser", format: "iife", logLevel: "silent", define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": "window.__NAUMI_WORKBENCH__.supabaseUrl",
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": "window.__NAUMI_WORKBENCH__.supabaseAnon",
    "process.env.NODE_ENV": '"production"',
  },
});
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/bridge.js") {
    res.setHeader("Content-Type", "application/javascript"); res.end(asset.outputFiles[0].contents); return;
  }
  if (req.url?.endsWith("/auth/status")) {
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ id: "fixture" })); return;
  }
  if (req.url?.endsWith("/settings")) {
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ models })); return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>模型下架验收</title><style>body{background:#fafafa;color:#20262e;font:16px system-ui;padding:24px}select{max-width:100%;padding:12px;border:1px solid #d8dde5;border-radius:8px;background:white}</style><script>window.__NAUMI_WORKBENCH__={supabaseUrl:"",supabaseAnon:""};window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));if(!localStorage.getItem('init')){localStorage.setItem('naumi-reference:fixture:native-model','imagen-4.0-generate-preview-portrait');localStorage.setItem('init','1')}</script></head><body><label>图片模型 <select id="active_provider_template"></select></label><script src="/bridge.js"></script></body></html>`);
});
server.listen(Number(process.env.FIXTURE_PORT || 14941), "127.0.0.1", () => console.log("IMAGEN4_SELECTOR_FIXTURE=http://127.0.0.1:" + server.address().port + "/batchshot/native/workbench SUPPLIER_CALLS=0"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
