import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// The same artifact as the accepted 18482 UI. All business data remains API-authorized.
export async function GET(){
 const html=await readFile(join(process.cwd(),'design/enterprise-demo/preview.html'),'utf8');
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"frame-ancestors 'none'",'X-Frame-Options':'DENY'}});
}
