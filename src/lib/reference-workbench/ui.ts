import "server-only";
import {readFile} from "node:fs/promises";
import path from "node:path";

export const assetDefinitions=["workbench.html","single.html","chat-image.html","workbench-history.js","workbench-zip.js"] as const;
export function adaptSource(source:string){
 return source.replaceAll("/api/","/api/reference-workbench/")
  .replaceAll("/workbench-history.js","/reference-workbench/workbench-history.js")
  .replaceAll("/workbench-zip.js","/reference-workbench/workbench-zip.js")
  .replace(/https:\/\/47\.105\.59\.142\/workbench/g,"/batchshot/native/workbench")
  .replace(/href=(["'])\/workbench\1/g,'href="/batchshot/native/workbench"')
  .replace(/href=(["'])\/single\1/g,'href="/batchshot/native/single"')
  .replace(/href=(["'])\/chat-image\1/g,'href="/batchshot/native/chat-image"')
  .replace(/href=(["'])\/admin\1/g,'href="/admin/model-management"')
  .replaceAll("'/login'","'/sign-in'")
  .replaceAll("localStorage.","window.NaumiWorkbenchStorage.")
  .replaceAll("reference-workbench-history-v1-","naumi-reference-workbench-history-v1-");
}
export async function renderWorkbench(view:string,desktop=false){
 if(!["workbench","single","chat-image"].includes(view))return null;
 let raw=await readFile(path.join(process.cwd(),"public","reference-workbench",`${view}.html`),"utf8");
 if(desktop)raw=raw.replaceAll("/api/reference-workbench/","/desktop/api/reference-workbench/").replaceAll("/batchshot/native/","/desktop/batchshot/native/");
 // The original single/chat documents omit optional head/body tags. Add their
 // explicit equivalent before inserting the native bootstrap (no layout change).
 if(!raw.includes("</head>")){raw=raw.replace(/(<html[^>]*>)/,"$1<head>").replace("<header ","</head><body><header ");if(!raw.includes("</body>"))raw+="</body></html>";}
 const publicRuntime=JSON.stringify({supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL||"",supabaseAnon:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||""}).replaceAll("<","\\u003c");
 // Static trusted scripts are replayed after verified Naumi auth. User content
 // remains escaped by the existing renderer, never evaluated as source.
 return raw.replaceAll("<script",'<script type="text/naumi-workbench"').replace("</head>",`<style id="native-auth-gate">body{visibility:hidden}</style><script>window.__NAUMI_WORKBENCH__=${publicRuntime}</script><script src="/reference-workbench/native-bridge.js" defer></script></head>`);
}
