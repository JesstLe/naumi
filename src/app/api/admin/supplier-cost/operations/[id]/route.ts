import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { createSupplierLedger } from "@/lib/supplier-cost/repository";
import { getPool } from "@/platform/db/pool";
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){const auth=await billingAuthorize(request);if(auth instanceof Response)return auth;try{return billingJson(await createSupplierLedger(getPool()).chain((await params).id));}catch(e){return billingJson({error:e instanceof Error?e.message:"query failed"},400)}}
