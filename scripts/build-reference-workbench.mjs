import fs from "node:fs/promises";
import path from "node:path";
import {build} from "esbuild";
const root=process.cwd(),out=path.join(root,"public/reference-workbench");await fs.mkdir(out,{recursive:true});
for(const name of ["workbench.html","single.html","chat-image.html","workbench-history.js","workbench-zip.js"]){
 let source=await fs.readFile(path.join(root,"services/reference-workbench/static",name==="workbench-zip.js"?"vendor/jszip.min.js":name),"utf8");
 source=source.replaceAll("/api/","/api/reference-workbench/").replaceAll("/workbench-history.js","/reference-workbench/workbench-history.js").replaceAll("/workbench-zip.js","/reference-workbench/workbench-zip.js").replaceAll("https://47.105.59.142/workbench","/batchshot/native/workbench")
 .replace(/href=(["'])\/workbench\1/g,'href="/batchshot/native/workbench"').replace(/href=(["'])\/single\1/g,'href="/batchshot/native/single"').replace(/href=(["'])\/chat-image\1/g,'href="/batchshot/native/chat-image"').replace(/href=(["'])\/admin\1/g,'href="/admin/model-management"').replaceAll("'/login'","'/sign-in'").replaceAll("localStorage.","window.NaumiWorkbenchStorage.").replaceAll("reference-workbench-history-v1-","naumi-reference-workbench-history-v1-");
 source=source.replaceAll("select.disabled=true;","window.NaumiWorkbenchModels(select);").replaceAll("ui.template.disabled=true;","window.NaumiWorkbenchModels(ui.template);");
 await fs.writeFile(path.join(out,name),source);
}
await build({entryPoints:["src/lib/reference-workbench/browser.ts"],outfile:path.join(out,"native-bridge.js"),bundle:true,minify:true,platform:"browser",format:"iife",define:{"process.env.NEXT_PUBLIC_SUPABASE_URL":"window.__NAUMI_WORKBENCH__.supabaseUrl","process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY":"window.__NAUMI_WORKBENCH__.supabaseAnon","process.env.NODE_ENV":'"production"'}});
console.log("PASS reference-workbench assets: 3 original pages, native auth bridge, history and ZIP");
