import "server-only";
import {readFile} from "node:fs/promises";
import path from "node:path";

export async function renderWorkbench(view:string,desktop=false){
 if(!["workbench","single","chat-image"].includes(view))return null;
 const raw=await readFile(path.join(process.cwd(),"public","reference-workbench",`${view}.html`),"utf8");
 const publicRuntime=JSON.stringify({desktop,supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL||"",supabaseAnon:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||""}).replaceAll("<","\\u003c");
 // Static trusted scripts are replayed after verified Naumi auth. User content
 // remains escaped by the existing renderer, never evaluated as source.
 return raw.replaceAll("<script",'<script type="text/naumi-workbench"').replace("</head>",`<style id="native-auth-gate">body{visibility:hidden}</style><script>window.__NAUMI_WORKBENCH__=${publicRuntime}</script><script src="/reference-workbench/native-bridge.js" defer></script></head>`);
}
