import {siteProfile} from '@/lib/site-control/store';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// The same artifact as the accepted 18482 UI. All business data remains API-authorized.
export async function GET(){
 let html=await readFile(join(process.cwd(),'design/enterprise-demo/preview.html'),'utf8');
 const site=await siteProfile();
 if(site.mode==='enterprise'){
   const bootstrap=JSON.stringify({brand:site.policy.brand,workspaceModules:site.policy.workspaceModules,revision:site.policy.revision}).replace(/</g,'\\u003c');
   html=html.replace('<html ', '<html data-workspace-mode="enterprise" ').replace('<head>', '<head><script>globalThis.__NAUMI_SITE__='+bootstrap+';</script>');
 }
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'none'",'X-Frame-Options':'DENY'}});
}
