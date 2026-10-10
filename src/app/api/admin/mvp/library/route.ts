/** Compatibility without redirecting mutation requests. */
import { supplierModelsHandler } from "@/lib/supplier-models/access";
export const runtime = "nodejs", dynamic = "force-dynamic";
export const GET = (request: Request) => supplierModelsHandler(request);
export const POST = (request: Request) => supplierModelsHandler(request);
