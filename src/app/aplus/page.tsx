import { AplusClient } from "@/components/aplus/aplus-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `A+ 详情页 — ${BRAND}` };

export default function AplusPage() {
  return <AplusClient />;
}
