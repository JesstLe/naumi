import {creationAssetRoute} from "@/lib/saas/creation-http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request,c:{params:Promise<{id:string;assetId:string}>}){const p=await c.params;return creationAssetRoute(request,p.id,p.assetId,true);}
