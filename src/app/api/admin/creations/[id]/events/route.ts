import {creationEventsRoute} from "@/lib/saas/creation-http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request,c:{params:Promise<{id:string}>}){return creationEventsRoute(request,(await c.params).id);}
