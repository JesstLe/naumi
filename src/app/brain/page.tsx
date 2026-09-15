import { HomeAgent } from "@/components/home/home-agent";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `智能工作台 — ${BRAND}` };

export default function BrainPage() {
  return <HomeAgent />;
}
