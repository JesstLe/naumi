"use client";

import Link from "next/link";
import { ArrowUpRight, Coins } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import { usePaymentConfig } from "@/lib/payment-context";
import { Button } from "@/components/ui/button";

// 报价预览与现有充值包分离；保留公开商业化门控。
export function Pricing() {
  const { locale } = useI18n();
  const { commerceVisible } = usePaymentConfig();
  if (!commerceVisible) return null;
  const en = locale === "en";

  return (
    <section id="pricing" className="scroll-mt-20 py-16 sm:py-24">
      <div className="container">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-7 rounded-2xl border border-border bg-card p-8 text-center sm:p-12">
          <Coins className="h-8 w-8 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">{en ? "A plan for your creative rhythm" : "选一份适合创作节奏的套餐"}</h2>
            <p className="mt-4 text-sm leading-7 text-c-text2">{en ? "Explore monthly and annual credit plans. Quote preview only; online purchase is not yet available." : "了解月度与年度豆套餐，清楚规划创作预算。方案预览，暂未开放在线购买。"}</p>
          </div>
          <Button asChild><Link href="/plans">{en ? "Explore plans (中文)" : "查看套餐与定价"}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
        </div>
      </div>
    </section>
  );
}
