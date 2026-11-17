import { requireAdmin } from "@/lib/admin-auth";
import { biJson } from "@/lib/bi/access";
import { dbEnabled,getPool } from "@/platform/db/pool";
import { readImage25PublishedConversion } from "@/lib/model-config/image25-price-read";
import { IMAGE25_BUDGET_FX, image25TablePayload, type TableConversion } from "@/lib/model-config/image25-price-table";
export const runtime = "nodejs", dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return biJson({ error: "页面不存在" }, 404);
  if(request.signal.aborted)return biJson({error:"查询已取消"},499);
  let conversion: TableConversion = IMAGE25_BUDGET_FX;
  let conversionNotice = "人民币按预算汇率 1 USD = 7.000000 CNY 折算，仅用于参考表；发布真实充值/管理员汇率后自动替换，不用于线上扣费。";
  try {
    // Only published settings. The visible budget fallback is never live billing.
    if(!dbEnabled)throw new Error("Database unavailable");
    const published=await readImage25PublishedConversion(getPool(),request.signal);
    if (published) {
      conversion = published;
      conversionNotice = published.basis === "budget"
        ? "人民币来自已生效的预算汇率；本价格表尚未应用到真实扣费。"
        : "人民币来自已生效配置；本价格表尚未应用到真实扣费。";
    }
  } catch {
    if(request.signal.aborted)return biJson({error:"查询已取消"},499);
    conversionNotice = "后台生效配置暂时不可读，先按预算汇率 1 USD = 7.000000 CNY 展示；本价格表尚未应用到真实扣费。";
  }
  if(request.signal.aborted)return biJson({error:"查询已取消"},499);
  try { return biJson(image25TablePayload(conversion, conversionNotice)); }
  catch { return biJson({ error: "价格参考数据校验失败，请联系管理员核查原始矩阵。" }, 503); }
}
