import { WorkbenchClient } from "@/components/home/workbench-client";

// Keep a standalone entry when Agent is granted but the workspace is not.
export default function AgentPage() {
  return <WorkbenchClient appearance="creation" />;
}
