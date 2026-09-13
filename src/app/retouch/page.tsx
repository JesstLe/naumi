import { RetouchClient } from "@/components/retouch/retouch-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `产品精修 — ${BRAND}` };

export default function RetouchPage() {
  return <RetouchClient />;
}
