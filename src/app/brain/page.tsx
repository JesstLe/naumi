import { Suspense } from "react";
import { HomeAgent } from "@/components/home/home-agent";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `智能工作台 — ${BRAND}` };

export default function BrainPage() {
  return (
    <Suspense
      fallback={
        <div className="container py-20 text-sm text-muted-foreground">
          加载工作台…
        </div>
      }
    >
      <HomeAgent />
    </Suspense>
  );
}
