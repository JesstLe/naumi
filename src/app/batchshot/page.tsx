import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { WorkbenchClient } from "@/components/labs/workbench-client";

export const metadata: Metadata = {
  title: `批量出图 — ${BRAND}`,
};

export default function BatchShotPage() {
  return <WorkbenchClient />;
}
