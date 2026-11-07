import {siteProfile} from '@/lib/site-control/store';
import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PRODUCT=join(process.cwd(),'design/enterprise-demo/preview.html');
const HEADERS={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'none'",'X-Frame-Options':'DENY'};
let rendered:{key:string;html:string;etag:string}|undefined;
// The same artifact as the accepted 18482 UI. All business data remains API-authorized.
// It is ~2MB of inline script: every open still revalidates here (middleware login
// runs first), but a browser holding the same build and site profile gets a 304.
export async function GET(request:Request){
 const file=await stat(PRODUCT),site=await siteProfile();
 const bootstrap=site.mode==='enterprise'?JSON.stringify({brand:site.policy.brand,workspaceModules:site.policy.workspaceModules,revision:site.policy.revision}).replace(/</g,'\\u003c'):'';
 const key=`${file.size}:${file.mtimeMs}:${bootstrap}`;
 if(rendered?.key!==key){
   let html=await readFile(PRODUCT,'utf8');
   if(bootstrap)html=html.replace('<html ', '<html data-workspace-mode="enterprise" ').replace('<head>', '<head><script>globalThis.__NAUMI_SITE__='+bootstrap+';</script>');
   rendered={key,html,etag:'"'+createHash('sha256').update(html).digest('base64url').slice(0,32)+'"'};
 }
 const headers={...HEADERS,ETag:rendered.etag};
 if(matches(request.headers.get('if-none-match'),rendered.etag))return new Response(null,{status:304,headers});
 return new Response(rendered.html,{headers});
}
// A compressing proxy may weaken the tag (W/"..."); the representation is the same.
function matches(header:string|null,etag:string){return !!header&&header.split(',').some(value=>{const tag=value.trim();return tag==='*'||tag===etag||tag==='W/'+etag;});}
