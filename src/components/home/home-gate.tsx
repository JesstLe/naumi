"use client";

import { WorkbenchClient } from "@/components/home/workbench-client";

/**
 * One creation entry for visitors and signed-in accounts. Identity, feature
 * access and paid execution remain owned by the existing workbench modules.
 */
export function HomeGate() {
  return <WorkbenchClient appearance="creation" />;
}
