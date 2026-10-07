import { z } from "zod";
import { billingAuthorize, billingJson } from "@/lib/billing/access";
import { createSupplierLedger } from "@/lib/supplier-cost/repository";
import { getPool } from "@/lib/db";
import { costsSummary, accountOverview } from "@/lib/supplier-cost/admin";
export const runtime = "nodejs", dynamic = "force-dynamic";
const text=z.string().max(254).optional();
const filter = z.object({ email:text,feature:text,publicModel:text,model:text,operation:text,order:text,account:text,status:z.enum(["pending","estimated","reported","reconciled"]).optional(),from:z.iso.datetime().optional(),to:z.iso.datetime().optional(),page:z.coerce.number().int().min(1).max(100000).optional() }).strict();
export async function GET(request: Request) { const auth=await billingAuthorize(request); if(auth instanceof Response)return auth; try { const q=filter.parse(Object.fromEntries(new URL(request.url).searchParams)); const ledger=createSupplierLedger(getPool()); const [rows,stats,overview]=await Promise.all([ledger.list(q),costsSummary(ledger,q),accountOverview(ledger)]); return billingJson({ ...rows, stats,...overview }); } catch{ return billingJson({error:"成本查询失败，请核对筛选条件与数据库状态"},400); } }
