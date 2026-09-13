import { RecolorClient } from "@/components/recolor/recolor-client";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `产品换色 — ${BRAND}` };

export default function RecolorPage() {
  return <RecolorClient />;
}
