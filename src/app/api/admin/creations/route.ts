import {creationListRoute} from "@/lib/saas/creation-http";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:Request){return creationListRoute(request);}
