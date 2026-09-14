import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CheckoutClient } from "@/components/checkout/checkout-client";
import { BRAND } from "@/lib/brand";
import { publicCommerceEnabled } from "@/lib/commerce";

export const metadata = { title: `结账 — ${BRAND}` };

export default function CheckoutPage() {
  if (!publicCommerceEnabled) redirect("/");
  return (
    <Suspense
      fallback={
        <div className="container py-20 text-sm text-muted-foreground">
          加载结账页…
        </div>
      }
    >
      <CheckoutClient />
    </Suspense>
  );
}
