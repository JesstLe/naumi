import {ReportAccountHidden} from "@/lib/accounts/report-visibility";
import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { createSupplierLedger } from "@/lib/supplier-cost/repository";
import { getPool } from "@/platform/db/pool";
import { readSupplierAdminChain } from "@/lib/supplier-cost/admin";
import {z} from "zod";
const databaseUuid=z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
const query=z.discriminatedUnion('view',[
  z.object({view:z.literal('calls'),after:databaseUuid.optional()}).strict(),
  z.object({view:z.literal('adjustments'),after:databaseUuid.optional()}).strict(),
  z.object({view:z.literal('reviews'),after:z.string().min(1).max(254).optional()}).strict(),
  z.object({view:z.literal('billing')}).strict(),
  z.object({view:z.literal('call'),call:databaseUuid}).strict(),
]);
export const runtime="nodejs",dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await billingAuthorize(request);if(auth instanceof Response)return auth;
  const paramsQuery=new URL(request.url).searchParams;
  const read=paramsQuery.has('view')?query.safeParse(Object.fromEntries(paramsQuery)):undefined;
  if(read&&!read.success)return billingJson({error:"调用链筛选条件无效"},400);
  try{
    const value=await readSupplierAdminChain(createSupplierLedger(getPool()),(await params).id,request.signal,read?.data);
    return value===null?billingJson({error:"调用不存在"},404):billingJson(value);
  }catch(error){
    if(error instanceof ReportAccountHidden)return billingJson({error:"调用不存在"},404);
    if(request.signal.aborted)return billingJson({error:"查询已取消"},499);
    return billingJson({error:"暂时无法读取调用链，请稍后重试"},503);
  }
}
