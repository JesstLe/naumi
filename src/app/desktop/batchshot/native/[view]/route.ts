import {renderWorkbench} from "@/lib/reference-workbench/ui";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(_request:Request,context:{params:Promise<{view:string}>}){
 const html=await renderWorkbench((await context.params).view,true);
 return html?new Response(html,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin"}}):Response.json({error:"页面不存在"},{status:404});
}
