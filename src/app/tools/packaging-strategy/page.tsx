import { PackagingStrategyClient } from "@/components/packaging-strategy/packaging-strategy-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `品牌包装策略 — ${BRAND}` };

export default function PackagingStrategyPage() {
  return <PackagingStrategyClient />;
}
