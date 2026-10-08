import { requireAdmin } from "@/lib/admin-auth";
import { biJson } from "@/lib/bi/access";
import { getModelAdministration } from "@/lib/model-config/server";
import { image25TablePayload, type TableConversion } from "@/lib/model-config/image25-price-table";
export const runtime = "nodejs", dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return biJson({ error: "页面不存在" }, 404);
  let conversion: TableConversion | null = null;
  let conversionNotice = "未配置已生效的人民币换算依据，人民币售价与积分暂不计算。";
  try {
    // Only published settings: never read another admin's draft or invent FX.
    const snapshot = await (await getModelAdministration()).repo.current();
    const preset = snapshot.config.defaultImagePreset;
    if (preset?.fx) {
      conversion = { ...preset.fx, creditsPerCnyMicros: preset.creditsPerCnyMicros, rounding: preset.rounding, modelVersion: snapshot.version };
      conversionNotice = "换算来自已生效配置；本价格表尚未应用到真实扣费。";
    }
  } catch {
    conversionNotice = "生效换算配置暂未读取成功；美元价格表可查看，人民币售价与积分暂不计算。";
  }
  try { return biJson(image25TablePayload(conversion, conversionNotice)); }
  catch { return biJson({ error: "价格参考数据校验失败，请联系管理员核查原始矩阵。" }, 503); }
}
