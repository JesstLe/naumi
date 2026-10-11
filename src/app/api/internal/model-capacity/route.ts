import { routerCapacityHandler } from "@/lib/model-config/router-capacity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return routerCapacityHandler(request); }
