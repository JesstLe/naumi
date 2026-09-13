import { TemplatesClient } from "@/components/templates/templates-client";
import { BRAND } from "@/lib/brand";
import { dbEnabled, listTemplateCategories, listTemplatesPaged } from "@/lib/db";

export const metadata = { title: `Prompt 模板库 — ${BRAND}` };

export default async function TemplatesPage() {
  // 服务端取真实库存数,首屏即显示真值,避免客户端兜底数字闪烁
  let initialTotal = 0;
  let initialCategoryCount = 0;
  if (dbEnabled) {
    try {
      initialTotal = (await listTemplatesPaged({ page: 1, pageSize: 1 })).total;
    } catch {
      /* ignore */
    }
    try {
      initialCategoryCount = (await listTemplateCategories()).length;
    } catch {
      /* ignore */
    }
  }
  return (
    <TemplatesClient
      initialTotal={initialTotal}
      initialCategoryCount={initialCategoryCount}
    />
  );
}
