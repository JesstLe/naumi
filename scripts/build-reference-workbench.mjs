import fs from "node:fs/promises";
import path from "node:path";
import {build} from "esbuild";
const root=process.cwd(),out=path.join(root,"public/reference-workbench");await fs.mkdir(out,{recursive:true});
// Shared authored documents own their environment calls. Build never rewrites code.
for(const name of ["workbench.html","single.html","chat-image.html","workbench-history.js","workbench-environment.js","workbench-zip.js"]){
 await fs.copyFile(path.join(root,"services/reference-workbench/static",name==="workbench-zip.js"?"vendor/jszip.min.js":name),path.join(out,name));
}
await build({entryPoints:["src/lib/reference-workbench/browser.ts"],outfile:path.join(out,"native-bridge.js"),bundle:true,minify:true,platform:"browser",format:"iife",define:{"process.env.NEXT_PUBLIC_SUPABASE_URL":"window.__NAUMI_WORKBENCH__.supabaseUrl","process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY":"window.__NAUMI_WORKBENCH__.supabaseAnon","process.env.NODE_ENV":'"production"'}});
console.log("PASS reference-workbench assets: 3 original pages, native auth bridge, history and ZIP");
