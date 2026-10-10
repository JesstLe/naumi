import Link from "next/link";
const entries = [
  ["prices", "/admin/billing/price-table", "模型价格表"],
  ["config", "/admin/billing", "模型与计费配置"],
  ["cost", "/admin/billing/supplier-cost", "调用成本与对账"],
  ["wallet", "/admin/billing?section=wallet", "钱包与充值"],
] as const;
export function BillingNavigation({ active }: { active: (typeof entries)[number][0] }) {
  return <nav aria-label="计费管理分区" className="mx-auto flex max-w-7xl gap-5 overflow-x-auto border-b border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
    {entries.map(([id, href, label]) => <Link key={id} href={href} prefetch={false} aria-current={active === id ? "page" : undefined} className={`whitespace-nowrap ${active === id ? "font-semibold text-slate-950 underline underline-offset-8" : "hover:text-slate-950"}`}>{label}</Link>)}
  </nav>;
}
