import { AgentAccessClient } from "@/components/account/agent-access-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `Agent 接入 — ${BRAND}` };

export default function AgentAccessPage() {
  return <AgentAccessClient />;
}
