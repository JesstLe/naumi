import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `批量出图 — ${BRAND}`,
};

export default function BatchShotPage() {
  return redirect("/batchshot/native/workbench");
}
