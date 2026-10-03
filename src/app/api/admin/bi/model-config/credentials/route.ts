import { modelAdminHandler } from "@/lib/model-config/access";
export const runtime = "nodejs", dynamic = "force-dynamic";
export const POST = (request: Request) => modelAdminHandler(request, "credentials");
