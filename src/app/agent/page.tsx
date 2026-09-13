import { AgentClient } from "@/components/agent/agent-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `Agent 任务模式 — ${BRAND}` };

export default function AgentPage() {
  return <AgentClient />;
}
