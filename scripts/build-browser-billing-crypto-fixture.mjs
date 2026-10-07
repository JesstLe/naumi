import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
const output = "output/http-billing-fix-20261007";
await mkdir(output, { recursive: true });
await build({
  entryPoints: ["scripts/browser-billing-crypto-fixture.tsx"],
  bundle: true, platform: "browser", format: "iife", minify: true, jsx: "automatic",
  outfile: `${output}/browser-fixture.js`,
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "isolated-auth", setup(builder) {
    builder.onResolve({ filter: /^(?:@\/lib\/(?:auth-context|supabase)|\.\.\/model-config\/public-client)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.endsWith("auth-context")
      ? 'export const useAuth=()=>({user:{email:"http-crypto-fixture@example.invalid"},ready:true});'
      : args.path.endsWith("supabase") ? 'export const authHeader=async()=>({});' : 'export const MODEL_CATALOG_REFRESH="fixture-model-refresh";', loader: "js" }));
  } }],
});
console.log("BROWSER_FIXTURE_BUILT=PASS AUTH=ISOLATED SUPPLIER=MOCKED");
