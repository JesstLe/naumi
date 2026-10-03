import { modelAdminHandler } from "@/lib/model-config/access";
export const runtime = "nodejs", dynamic = "force-dynamic";
export const PUT = (request: Request) => modelAdminHandler(request, "draft");
