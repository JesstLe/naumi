import { ReplicateClient } from "@/components/replicate/replicate-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `爆款复刻 — ${BRAND}` };

export default function ReplicatePage() {
  return <ReplicateClient />;
}
