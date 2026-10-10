"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, ChevronDown, Coins, ImageIcon, Layers3, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/lib/brand-context";
import { cn } from "@/lib/utils";
import { PRICING_FAQS, PRICING_PLANS } from "./pricing-catalog";

type Tier = { id: string; longSide: number };
const number = (value: number) => value.toLocaleString("zh-CN");
const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background";

export function PricingPage({ tiers }: { tiers: Tier[] }) {
  const [period, setPeriod] = useState<"month" | "year">("month");
  const { name } = useBrand();
  const plans = PRICING_PLANS[period];

  return (
    <div lang="zh-CN" className="mx-auto max-w-[1200px] px-5 pb-16 pt-10 text-c-text sm:px-8 sm:pt-16">
      <header className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {name} 创作套餐
        </span>
        <h1 className="mt-6 text-[34px] font-semibold leading-tight tracking-tight sm:text-5xl">让好创意，<br className="sm:hidden" />有合适的预算</h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-c-text2 sm:text-base">从第一张商品图，到持续上新。<br />选择适合创作节奏的豆套餐，把精力留给作品。</p>
        <a href="#usage" className={cn("mt-5 inline-flex items-center gap-1.5 rounded text-sm font-medium text-primary hover:underline", focus)}>了解尺寸与扣豆说明 <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></a>
      </header>

      <section aria-label="套餐方案" className="mt-10 sm:mt-12">
        <div className="flex flex-col items-center justify-center gap-3">
          <div role="group" aria-label="选择套餐周期" className="inline-flex rounded-xl border border-c-border2 bg-c-subtle p-1">
            {([['month', '月度套餐'], ['year', '年度套餐']] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={cn("min-w-[128px] rounded-lg px-5 py-2.5 text-sm font-medium transition-colors", focus, period === value ? "bg-c-card text-c-text shadow-sm" : "text-c-text2 hover:text-primary")}>{label}</button>
            ))}
          </div>
          <p className="text-xs text-c-text2">报价预览 · 暂未开放在线购买</p>
        </div>
        <div aria-live="polite" aria-atomic="true" className="sr-only">当前展示{period === "month" ? "月度套餐，共三款" : "年度套餐，共两款"}</div>
        <div className={cn("mx-auto mt-8 grid gap-5", period === "month" ? "md:grid-cols-3" : "max-w-[790px] md:grid-cols-2")}>
          {plans.map((plan) => (
            <article key={plan.id} className={cn("relative flex flex-col rounded-2xl border bg-c-card p-6 sm:p-7", plan.featured ? "border-primary shadow-[0_10px_40px_-24px_rgba(79,70,229,0.5)]" : "border-c-border2")}>
              <div className="flex min-h-6 items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                {plan.featured && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">{period === "month" ? "日常创作之选" : "长期创作之选"}</span>}
              </div>
              <p className="mt-2 text-sm text-c-text2">{plan.description}</p>
              <div className="mt-7 flex items-baseline gap-1.5"><span className="text-xl font-medium">¥</span><span className="text-[46px] font-semibold leading-none tracking-tight tabular-nums">{number(plan.price)}</span><span className="text-sm text-c-text2">/ {period === "month" ? "月包" : "年包"}</span></div>
              <p className="mt-3 flex items-center gap-2 text-sm text-c-text2"><Coins className="h-4 w-4 text-primary" aria-hidden="true" /><strong className="text-base font-semibold text-c-text">{number(plan.beans)} 豆</strong><span>{period === "year" ? "年度总额度" : "套餐额度"}</span></p>
              <div className="my-6 h-px bg-c-border" />
              <ul className="mb-7 space-y-3 text-sm text-c-text2">
                <li className="flex gap-2.5"><Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />按实际创作消耗额度</li>
                <li className="flex gap-2.5"><Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />可用于平台支持的创作工具</li>
                <li className="flex gap-2.5"><Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />开通前确认完整使用规则</li>
              </ul>
              <Button asChild variant={plan.featured ? "primary" : "secondary"} className={cn("mt-auto w-full", focus)}><Link href="/contact" aria-label={`咨询开通${plan.name}`}>咨询开通 <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-6 text-c-text2">价格单位为人民币。套餐价格及额度为待开放方案，实际开通条件需另行确认。<br />年度总额度不代表一次到账；发放节奏、有效期与续费规则将在开通前说明。</p>
      </section>

      <section id="usage" aria-labelledby="usage-title" className="mt-20 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold tracking-widest text-primary">每次创作，心里有数</p><h2 id="usage-title" className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">按需选尺寸，创作更清楚</h2><p className="mt-3 text-sm leading-6 text-c-text2">套餐扣豆规则将在正式开放前确认；实际操作请查看生成前的消耗提示。</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-c-card px-3 py-2 text-xs text-c-text2"><Coins className="h-3.5 w-3.5" aria-hidden="true" />正式规则待确认</span>
        </div>
        <div className="mt-7 overflow-hidden rounded-2xl border border-c-border2 bg-c-card">
          <div className="border-b border-c-border bg-c-subtle2 px-5 py-4 sm:px-6"><p className="flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4 text-primary" aria-hidden="true" />平台生图模型</p><p className="mt-1.5 text-xs leading-6 text-c-text2">模型以创作页当前可选项为准，以下仅说明现有输出尺寸档位。</p></div>
          <table className="w-full text-left text-sm"><caption className="sr-only">当前平台 AI 生图尺寸及套餐扣豆确认状态</caption><thead className="text-xs text-c-text2"><tr><th scope="col" className="px-5 py-4 font-medium sm:px-6">输出档位</th><th scope="col" className="px-2 py-4 font-medium">尺寸说明</th><th scope="col" className="px-5 py-4 text-right font-medium sm:px-6">套餐扣豆</th></tr></thead><tbody>
            {tiers.map((tier) => <tr key={tier.id} className="border-t border-c-border"><th scope="row" className="px-5 py-4 font-semibold sm:px-6">{tier.id}</th><td className="px-2 py-4 text-xs leading-5 text-c-text2 sm:text-sm">{tier.longSide ? `目标长边 ${number(tier.longSide)} px` : "沿用模型返回尺寸"}</td><td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums sm:px-6"><span className="text-xs font-normal text-c-text2">待确认</span></td></tr>)}
          </tbody></table>
          <div className="border-t border-c-border bg-c-subtle2 px-5 py-4 text-xs leading-6 text-c-text2 sm:px-6">2K / 4K / 5K 可能由生成后放大实现，不代表原生生成分辨率。此表不适用于自定义模型、视频、3D 服装或其他工具，实际消耗请查看提交前的提示。</div>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-c-text2"><Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><p><strong className="font-medium text-c-text">先确认消耗，再开始创作。</strong> 套餐总额度不等同于固定出图张数。模型、尺寸与工具的扣豆标准将在开通前说明，本页暂不提供每张价格或可生成张数的换算。</p></div>
      </section>

      <section aria-labelledby="faq-title" className="mx-auto mt-20 max-w-3xl">
        <h2 id="faq-title" className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">你可能还想了解</h2>
        <div className="mt-8 divide-y divide-c-border2 border-y border-c-border2">
          {PRICING_FAQS.map((faq) => <details key={faq.question} className="group"><summary className={cn("flex cursor-pointer list-none items-center justify-between gap-5 rounded py-5 text-sm font-medium [&::-webkit-details-marker]:hidden", focus)}>{faq.question}<ChevronDown className="h-4 w-4 shrink-0 text-c-text2 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><p className="pb-6 pr-7 text-sm leading-7 text-c-text2">{faq.answer}</p></details>)}
        </div>
      </section>
      <section aria-label="开通咨询" className="mt-16 flex flex-col items-center justify-between gap-6 rounded-2xl border border-c-border2 bg-c-card px-6 py-8 text-center sm:flex-row sm:px-8 sm:text-left"><div><h2 className="text-lg font-semibold">还不确定选哪一款？</h2><p className="mt-2 text-sm leading-6 text-c-text2">告诉我们你的创作频率与出图需求，一起确认合适的方案。</p></div><Button asChild variant="secondary" className={focus}><Link href="/contact">咨询套餐 <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link></Button></section>
      <p className="mt-7 text-center text-xs leading-6 text-c-text2">开通前请了解 <Link href="/terms" className={cn("rounded underline underline-offset-4 hover:text-primary", focus)}>服务条款</Link> 与 <Link href="/privacy" className={cn("rounded underline underline-offset-4 hover:text-primary", focus)}>隐私政策</Link>。具体套餐条件以开通前确认内容为准。</p>
    </div>
  );
}
