import { modelAdminHandler } from "@/lib/model-config/access";
export const runtime = "nodejs", dynamic = "force-dynamic";
export const GET = (request: Request) => modelAdminHandler(request, "read");
export const POST = (request: Request) => modelAdminHandler(request, "publish");
