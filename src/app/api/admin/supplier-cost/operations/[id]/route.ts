import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { createSupplierLedger } from "@/lib/supplier-cost/repository";
import { getPool } from "@/platform/db/pool";
import { readSupplierAdminChain } from "@/lib/supplier-cost/admin";
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await billingAuthorize(request);if(auth instanceof Response)return auth;
  try{
    return billingJson(await readSupplierAdminChain(createSupplierLedger(getPool()),(await params).id,request.signal));
  }catch{
    if(request.signal.aborted)return billingJson({error:"查询已取消"},499);
    return billingJson({error:"暂时无法读取调用链，请稍后重试"},503);
  }
}
