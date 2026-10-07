import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(process.argv[2] || "."), output = resolve(process.argv[3] || "output/direct-generation-20261007/browser-fixture.js");
await mkdir(resolve(output, ".."), { recursive: true });
await build({ entryPoints: ["scripts/direct-generation-browser-fixture.tsx"], bundle: true, platform: "browser", format: "iife", jsx: "automatic", minify: true, outfile: output, define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "isolated-provider", setup(builder) {
  builder.onResolve({ filter: /^\.\.\/src\/lib\/billing\// }, args => ({ path: resolve(root, args.path.replace(/^\.\.\//, "") + ".tsx").replace(/client-intent\.tsx$/, "client-intent.ts") }));
  builder.onResolve({ filter: /^(?:@\/lib\/(?:auth-context|supabase)|\.\.\/model-config\/public-client)$/ }, args => ({ path: args.path, namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.endsWith("auth-context") ? 'export const useAuth=()=>({user:{email:"http-crypto-fixture@example.invalid"},ready:true});' : args.path.endsWith("supabase") ? 'export const authHeader=async()=>({});' : 'export const MODEL_CATALOG_REFRESH="fixture-model-refresh";', loader: "js" }));
} }] });
console.log(`DIRECT_BROWSER_FIXTURE=BUILT root=${root}`);
