import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// Exercise the actual component tree and click handlers with isolated hook data.
// No browser, database, billing endpoint, or supplier is contacted.
const require = createRequire(import.meta.url), React = require("react");
const state = globalThis.__cutoutUi = { catalog: null, error: null, calls: 0, index: 0, file: new File(["fixture"], "fixture.png", { type: "image/png" }) };
const hookReact = { ...React,
  useState(initial) { const i = state.index++; const value = i === 0 ? state.file : i === 1 ? "blob:fixture" : typeof initial === "function" ? initial() : initial; return [value, () => {}]; },
  useRef: value => ({ current: value }), useEffect() {}, useCallback: fn => fn, useMemo: fn => fn(),
};
globalThis.__cutoutReact = hookReact;
const mocks = {
  "react": "module.exports=globalThis.__cutoutReact;",
  "@/lib/model-config/feature-client": "exports.useFeatureModels=()=>({catalog:globalThis.__cutoutUi.catalog,error:globalThis.__cutoutUi.error,selected:'',setSelected:()=>{}});",
  "@/lib/auth-context": "exports.useAuth=()=>({user:{email:'fixture@local.test'},ready:true,remaining:100,consumeCredits:()=>{},applyServerUser:()=>{}});",
  "@/lib/auth-modal-context": "exports.useAuthModal=()=>({openAuth:()=>{}});",
  "@/lib/i18n/locale-context": "exports.useI18n=()=>({locale:'zh'});",
  "@/lib/feature-access/client": "exports.useFeatureAccess=()=>({ready:true});",
  "@/lib/billing/preview": "exports.useFeatureBilling=()=>({quote:{credits:1},error:null,cost:1});",
  "@/lib/billing/feature-map": "exports.CATEGORY_FEATURES={cutout:'tool.cutout'};",
  "@/components/image-quality-control": "exports.QUALITY_TOOL_CATEGORIES=new Set();exports.ImageQualityControl=()=>null;",
  "@/lib/utils": "exports.cn=(...args)=>args.filter(Boolean).join(' ');",
  "@/components/tools/tool-demo": "exports.getDemo=()=>null;exports.ToolDemo=()=>null;",
  "@/components/tools/record-pager": "exports.RECORDS_PER_PAGE=20;exports.RecordPager=()=>null;",
  "@/lib/cdn": "exports.cdnUrl=x=>x;",
  "@/lib/tool-ui": "exports.toolSourceUrl=x=>x;exports.toolImageError=()=>{};",
  "@/lib/clipboard-images": "exports.useClipboardImagePaste=()=>{};",
};
const files = ["src/components/tools/tool-workspace.tsx", "src/components/tools/feature-model-select.tsx", "src/lib/model-config/selection-policy.ts", "src/lib/model-config/feature-availability.ts"];
const actual = new Set(files.map(f => resolve(f)));
const result = await build({
  stdin: { contents: 'export {ToolWorkspace} from "./src/components/tools/tool-workspace"; export {FeatureModelSelect} from "./src/components/tools/feature-model-select";', resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic",
  plugins: [{ name: "isolated-component-dependencies", setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      if (mocks[args.path]) return { path: args.path, namespace: "mock" };
      if (["react/jsx-runtime", "react/jsx-dev-runtime"].includes(args.path)) return { path: args.path, external: true };
      let file = args.path.startsWith("@/") ? resolve("src", args.path.slice(2)) : resolve(args.resolveDir, args.path);
      const source = [file, file + ".tsx", file + ".ts"].find(f => actual.has(f));
      if (source) return { path: source };
      return { path: args.path, namespace: "mock" };
    });
    b.onLoad({ filter: /.*/, namespace: "mock" }, args => {
      const code = mocks[args.path] || "module.exports=new Proxy(()=>null,{get:(_,key)=>key==='__esModule'?false:()=>null});";
      return { contents: code, loader: "js" };
    });
  } }],
});
const mod = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(require, mod, mod.exports);
const { ToolWorkspace, FeatureModelSelect } = mod.exports;
const walk = function* (node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const x of node) yield* walk(x); return; }
  yield node;
  yield* walk(node.props?.children);
};
const catalog = { managed: true, feature: "tool.cutout", models: [] };
for (const [data, error, disabled] of [
  [null, null, true], [catalog, null, true], [{ ...catalog, available: false }, null, true],
  [{ ...catalog, available: true }, "network down", true], [{ ...catalog, available: true }, null, false],
]) {
  state.catalog = data; state.error = error; state.index = 0; state.calls = 0;
  const tree = ToolWorkspace({ name: "AI 抠图", desc: "", Icon: () => null, accent: "#2e7cf6", tint: "#fff", category: "cutout", cost: 1, action: "开始抠图", onProcess: async () => { state.calls++; return { url: "blob:result" }; } });
  const button = [...walk(tree)].find(n => n.type === "button" && n.props.className?.includes("shadow-btn"));
  assert.ok(button); assert.equal(button.props.disabled, disabled);
  await button.props.onClick(); // Direct invocation also must obey the run() guard.
  assert.equal(state.calls, disabled ? 0 : 1);
  const selector = FeatureModelSelect({ feature: "tool.cutout" });
  if (disabled) assert.ok(selector?.props.role === "status" || selector?.props.role === "alert");
  else assert.equal(selector, null, "configured processor must not show an empty model selector");
}
const source = readFileSync("src/components/tools/tool-workspace.tsx", "utf8");
assert.ok(source.includes("if(executionBlock)"));
console.log("CUTOUT_UI=PASS ACTUAL_COMPONENT_STATES=5 BUTTON_AND_HANDLER_GUARDS=10 EMPTY_SELECTOR_REMOVED=1 SUPPLIER_CALLS=0");
const apiMocks = {
  "next/server": "exports.NextResponse={json:(data,options)=>Response.json(data,options)};",
  "@/lib/billing/rules/registry": "exports.isFeatureId=x=>x==='tool.cutout';",
  "@/lib/model-config/requests": "exports.modelConfigurationEnabled=async()=>true;",
  "@/lib/model-config/server": "exports.getModelRuntime=async()=>({publicCatalog:async()=>globalThis.__cutoutUi.catalog});exports.getModelAdministration=async()=>({repo:{byVersion:async()=>({config:globalThis.__cutoutUi.config})}});",
  "@/lib/model-config/business": "exports.FEATURE_BINDINGS={'tool.cutout':'image.cutout'};",
  "@/lib/model-config/bindings": "exports.MODEL_BINDINGS={'image.cutout':{modality:'image'}};",
  "@/lib/model-config/types": "exports.ModelConfigError=class extends Error {};",
  "@/lib/settings": "exports.getCutoutSettings=async()=>({backend:globalThis.__cutoutUi.backend,replicateToken:globalThis.__cutoutUi.token});",
};
const api = await build({ stdin: { contents: 'export {GET} from "./src/app/api/models/route";', resolveDir: process.cwd() }, bundle: true, platform: "node", format: "cjs", write: false,
  plugins: [{ name: "isolated-catalog-api", setup(b) {
    b.onResolve({ filter: /.*/ }, args => apiMocks[args.path] ? { path: args.path, namespace: "api-mock" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "api-mock" }, args => ({ contents: apiMocks[args.path], loader: "js" }));
  } }],
});
const apiModule = { exports: {} }; new Function("require", "module", "exports", api.outputFiles[0].text)(require, apiModule, apiModule.exports);
state.catalog = { ...catalog, available: false, version: 123 }; state.backend = "replicate"; state.token = "private-fixture-token";
for (const [config, token, available] of [
  [{ bindings: {} }, "private-fixture-token", true],
  [{ bindings: {} }, "", false],
  [{ bindings: { "image.cutout": "disabled-managed-model" } }, "private-fixture-token", false],
  [{ bindings: {}, business: { "tool.cutout": { enabled: false } } }, "private-fixture-token", false],
]) {
  state.config = config; state.token = token;
  const response = await apiModule.exports.GET(new Request("http://fixture/api/models?feature=tool.cutout"));
  assert.equal(response.status, 200); const text = await response.text(), data = JSON.parse(text);
  assert.equal(data.available, available); assert.ok(!text.includes("private-fixture-token"));
  if (available) assert.equal(data.supported, false);
}
console.log("CUTOUT_CATALOG_API=PASS STANDALONE_AND_MANAGED_CASES=4 PRIVATE_TOKEN_DISCLOSURE=0 SUPPLIER_CALLS=0");
delete globalThis.__cutoutUi; delete globalThis.__cutoutReact;
