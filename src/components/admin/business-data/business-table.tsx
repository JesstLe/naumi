import { FileImage, ReceiptText } from "lucide-react";
import { accountIdentity, localTime, money, number, sourceRows, viewNames } from "./model";
import type { BusinessResponse, BusinessSource, BusinessView } from "./types";
import styles from "./business-data.module.css";

export const statusLabels = { pending: "查询中", succeeded: "已更新", failed: "查询失败", offline: "离线", unknown: "未确认" };
const columns: Record<BusinessView, string[]> = {
  usage: ["账户", "消费积分", "消费次数", "当前余额", "最近消费", "明细"],
  users: ["账户", "角色 / 套餐", "当前余额", "预留积分", "账户状态", "明细"],
  orders: ["订单", "账户", "积分", "金额", "状态", "时间"],
  ledger: ["账户", "类型", "积分变动", "原因", "时间"],
  creations: ["作品", "账户", "类型", "项目", "创建时间"],
};
const ledgerLabels: Record<string, string> = { consume: "消费", refund: "退回", purchase: "充值", grant: "发放", adjust: "调整" };
const orderLabels: Record<string, string> = { paid: "已支付", fulfilled: "已到账", pending: "待支付", created: "待支付", cancelled: "已取消", closed: "已关闭", failed: "失败", refunded: "已退款" };
const creationLabels: Record<string, string> = { image: "图片", video: "视频", unknown: "未知" };
function Account({ name, email }: { name?: string; email: string }) {
  return <div className={styles.account}><span className={styles.avatar}>{(name || email).slice(0, 1).toUpperCase()}</span><span><strong>{name || email}</strong>{name && <small>{email}</small>}</span></div>;
}
function SourceRows({ source, view, drill }: { source: BusinessSource; view: BusinessView; drill: (site: string, email: string, view: BusinessView) => void }) {
  const data = source.data, span = columns[view].length;
  if (source.status !== "succeeded" || !data) return <tr><td colSpan={span}><div className={styles.sourceMessage} role="status">{source.error || statusLabels[source.status]}</div></td></tr>;
  if (view === "usage" || view === "users") {
    const rows = sourceRows(source, "users");
    if (!rows.length) return <tr><td colSpan={span}><div className={styles.sourceMessage}>暂无符合条件的账户</div></td></tr>;
    return <>{rows.map(row => <tr key={accountIdentity(source.id, row.email)} data-account-identity={accountIdentity(source.id, row.email)}>
      <td><Account name={row.name} email={row.email}/></td>
      {view === "usage" ? <><td className={styles.numeric}><strong>{number(row.credits)}</strong></td><td className={styles.numeric}>{number(row.operations)}</td><td className={styles.numeric}>{number(row.balance)}</td><td className={styles.timestamp}>{localTime(row.lastUsedAt)}</td></>
        : <><td><div className={styles.stack}><span>{row.role === "admin" ? "管理员" : row.role === "unknown" ? "历史账户" : "用户"}</span><small>{row.plan || "—"}</small></div></td><td className={styles.numeric}><strong>{number(row.balance)}</strong></td><td className={styles.numeric}>{number(row.creditsUsed)}</td><td><span className={styles.rowStatus} data-tone={row.banned ? "muted" : "good"}>{row.banned ? "已停用" : "正常"}</span></td></>}
      <td><div className={styles.rowActions}><button type="button" onClick={() => drill(source.id, row.email, "ledger")}>账务</button><button type="button" onClick={() => drill(source.id, row.email, "creations")}>作品</button></div></td>
    </tr>)}</>;
  }
  if (view === "orders") {
    const rows = sourceRows(source, "orders");
    if (!rows.length) return <tr><td colSpan={span}><div className={styles.sourceMessage}>该时段暂无订单</div></td></tr>;
    return <>{rows.map(row => <tr key={source.id + ":" + row.id}><td><div className={styles.record}><ReceiptText size={16}/><span><strong>{row.title || row.kind}</strong><small>{row.id}</small></span></div></td><td>{row.email}</td><td className={styles.numeric}>{number(row.credits)}</td><td className={styles.numeric}><strong>{money(row.amount)}</strong></td><td><span className={styles.rowStatus} data-tone={["paid", "fulfilled"].includes(row.status) ? "good" : "muted"}>{orderLabels[row.status] || row.status}</span></td><td className={styles.timestamp}>{localTime(row.paidAt || row.createdAt)}</td></tr>)}</>;
  }
  if (view === "ledger") {
    const rows = sourceRows(source, "ledger");
    if (!rows.length) return <tr><td colSpan={span}><div className={styles.sourceMessage}>该时段暂无账务记录</div></td></tr>;
    return <>{rows.map(row => <tr key={source.id + ":" + row.id}><td>{row.email}</td><td>{ledgerLabels[row.kind] || row.kind}</td><td className={styles.numeric} data-delta={row.delta > 0 ? "positive" : "negative"}><strong>{row.delta > 0 ? "+" : ""}{number(row.delta)}</strong></td><td className={styles.reason} title={row.reason}>{row.reason || "—"}</td><td className={styles.timestamp}>{localTime(row.createdAt)}</td></tr>)}</>;
  }
  const rows = sourceRows(source, "creations");
  if (!rows.length) return <tr><td colSpan={span}><div className={styles.sourceMessage}>该时段暂无作品</div></td></tr>;
  return <>{rows.map(row => <tr key={source.id + ":" + row.id}><td><div className={styles.record}><FileImage size={17}/><span><strong>{row.title || "未命名作品"}</strong><small>{row.id}</small></span></div></td><td>{row.email}</td><td>{creationLabels[row.type] || "未知"}</td><td className={styles.reason} title={row.projectKey || ""}>{row.projectKey || "—"}</td><td className={styles.timestamp}>{localTime(row.createdAt)}</td></tr>)}</>;
}

export function BusinessTable({ response, view, drill, busy }: { response: BusinessResponse | null; view: BusinessView; drill: (site: string, email: string, view: BusinessView) => void; busy: boolean }) {
  const sources = response?.sources || [], headers = columns[view];
  return <section className={styles.tablePanel} aria-label={viewNames[view] + "明细"}>
    <div className={styles.panelTitle}><h2>{viewNames[view]}明细</h2><span>{response ? `${sources.length} 个站点` : "—"}</span></div>
    <div className={styles.tableScroll}><table><thead><tr>{headers.map(header => <th key={header}>{header}</th>)}</tr></thead>
      {sources.map(source => <tbody key={source.id} data-source-id={source.id}><tr className={styles.sourceHeading}><th colSpan={headers.length} scope="rowgroup"><div><strong>{source.name}</strong><span className={styles.status} data-status={source.status}>{statusLabels[source.status]}</span>{source.status === "succeeded" && source.data && <span className={styles.sourceCount}>{number(source.data.total)} 条 · 第 {source.data.page} 页</span>}</div></th></tr><SourceRows source={source} view={view} drill={drill}/></tbody>)}
      {!sources.length && <tbody><tr><td colSpan={headers.length}><div className={styles.sourceMessage}>{busy ? "正在读取站点数据" : "暂无已确认的数据"}</div></td></tr></tbody>}
    </table></div>
  </section>;
}
