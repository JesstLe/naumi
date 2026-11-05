import { Activity, ArrowDownLeft, ImageIcon, Receipt, Users, Wallet } from "lucide-react";
import { money, number } from "./model";
import type { BusinessTotals, BusinessView } from "./types";
import styles from "./business-data.module.css";

/** Render view-specific summary cards from confirmed aggregate totals; format unavailable values as unknown rather than zero. */
export function BusinessMetrics({ totals, view }: { totals: BusinessTotals | null; view: BusinessView }) {
  const cards = view === "orders" ? [
    { label: "订单实付", value: money(totals?.paidAmount), Icon: Wallet },
    { label: "已支付订单", value: number(totals?.paidOrders), Icon: Receipt },
    { label: "消费积分", value: number(totals?.credits), Icon: Activity },
    { label: "当前余额", value: number(totals?.balance), Icon: Wallet },
  ] : [
    { label: view === "users" ? "账户数量" : view === "creations" ? "当前作品" : "消费积分", value: number(view === "users" ? totals?.users : view === "creations" ? totals?.artworks : totals?.credits), Icon: view === "users" ? Users : view === "creations" ? ImageIcon : Activity },
    { label: "退回积分", value: number(totals?.refundCredits), Icon: ArrowDownLeft },
    { label: "当前余额", value: number(totals?.balance), Icon: Wallet },
    { label: "活跃账户", value: number(totals?.activeUsers), Icon: Users },
  ];
  return <section className={styles.metrics} aria-label="站点合计" data-complete={Boolean(totals)}>
    {cards.map(({ label, value, Icon }, index) => <div className={styles.metric} key={label}>
      <div><span>{label}</span><span className={styles.metricIcon} data-index={index}><Icon size={17}/></span></div>
      <strong data-metric={label}>{value}</strong>
    </div>)}
  </section>;
}
