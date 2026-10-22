import {creationDetailRoute} from "@/lib/saas/creation-http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request,c:{params:Promise<{id:string}>}){const r=await creationDetailRoute(request,(await c.params).id,true);if(!r.ok)return r;const d=await r.json();return Response.json({items:d.events,generatedAt:new Date().toISOString()},{headers:r.headers});}
