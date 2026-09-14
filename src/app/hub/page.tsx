import { HubClient } from "@/components/hub/hub-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `业务系统 — ${BRAND}` };

export default function HubPage() {
  return <HubClient />;
}
