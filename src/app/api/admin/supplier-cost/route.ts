import { z } from "zod";
import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { createSupplierLedger } from "@/lib/supplier-cost/repository";
import { getPool } from "@/platform/db/pool";
import { readSupplierAdmin } from "@/lib/supplier-cost/admin";
export const runtime = "nodejs", dynamic = "force-dynamic";
const text=z.string().max(254).optional();
const filter = z.object({ view:z.enum(["calls","stats","reconcile","accounts"]).optional(),email:text,feature:text,publicModel:text,model:text,operation:text,order:text,account:text,status:z.enum(["pending","estimated","reported","reconciled"]).optional(),from:z.iso.datetime().optional(),to:z.iso.datetime().optional(),page:z.coerce.number().int().min(1).max(100000).optional() }).strict();
export async function GET(request: Request) {
  const auth=await billingAuthorize(request);if(auth instanceof Response)return auth;
  const query=filter.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!query.success)return billingJson({error:"成本筛选条件无效"},400);
  const {view,...q}=query.data;
  try{return billingJson(await readSupplierAdmin(createSupplierLedger(getPool()),q,view));}
  catch{return billingJson({error:"暂时无法读取成本数据，请稍后重试"},503);}
}
