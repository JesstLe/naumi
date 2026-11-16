"use client";
import { USER_POSITIONS } from "@/lib/accounts/positions";

import { useRouter,useSearchParams } from "next/navigation";
import { AdminCenterShell } from "@/components/admin/center-shell";
import {microsToDecimal} from "@/lib/billing/decimal";
import { ModelChain } from "./model-chain";
import { ArtworkMedia } from "./artwork-media";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type {
  BiOverview,
  BiResponse,
  BiRow,
  BiSection,
} from "@/lib/bi/contracts";
import { biCsvCell } from "@/lib/bi/contracts";
import { ARTWORK_COLUMNS, ARTWORK_DETAIL_VALUES } from "@/lib/bi/artwork-view";
import styles from "./dashboard.module.css";
import { UserManager } from "./user-manager";
import { BiTooltip } from "./tooltip";

const sections: { id: BiSection; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "运营概览", icon: BarChart3 },
  { id: "users", label: "用户与企业", icon: Users },
  { id: "operations", label: "业务任务", icon: Layers },
  { id: "ledger", label: "积分流水", icon: Wallet },
  { id: "artworks", label: "图片与操作内容", icon: ImageIcon },
  { id: "models", label: "模型与质量审计", icon: Activity },
  { id: "calls", label: "模型调用记录", icon: Activity },
  { id: "conversations", label: "对话与操作内容", icon: Layers },
  { id: "orders", label: "充值订单", icon: Building2 },
  { id: "access", label: "后台访问记录", icon: ShieldCheck },
  { id: "management", label: "用户管理日志", icon: ShieldCheck },
];
type Filter = {
  from: string;
  to: string;
  email: string;
  q: string;
  accountType: string;
  status: string;
  position: string;
  period: string;
  id: string;
  source: string;
};
type Column = {
  key: string;
  label: string;
  format?:
    | "micros"
    | "time"
    | "credits"
    | "money"
    | "quality"
    | "type"
    | "discount"
    | "changes"
    | "status";
};
const columns: Record<Exclude<BiSection, "overview">, Column[]> = {
  management: [
    { key: "created_at", label: "操作时间", format: "time" },
    { key: "actor", label: "管理员" },
    { key: "email", label: "目标账户" },
    { key: "action", label: "管理操作", format: "status" },
    { key: "reason", label: "操作原因" },
    { key: "changes", label: "变更前后", format: "changes" },
    { key: "ledger_id", label: "关联流水" },
  ],
  conversations: [
    { key: "updated_at", label: "最后活动", format: "time" },
    { key: "email", label: "账户" },
    { key: "title", label: "对话标题" },
    { key: "source", label: "来源", format: "status" },
    { key: "entries", label: "存储条目数" },
    { key: "created_at", label: "创建时间", format: "time" },
  ],
  users: [
    { key: "name", label: "用户" },
    { key: "email", label: "账户" },
    { key: "account_type", label: "身份", format: "type" },
    { key: "position", label: "岗位" },
    { key: "role", label: "权限", format: "status" },
    { key: "banned", label: "已封禁" },
    { key: "company", label: "企业" },
    { key: "agreed_pay_percent", label: "约定实付比例", format: "discount" },
    { key: "available", label: "当前可用", format: "credits" },
    { key: "reserved", label: "当前预留", format: "credits" },
    { key: "consumed", label: "期间消费", format: "credits" },
    { key: "artworks", label: "期间作品" },
    { key: "last_login_at", label: "最后登录", format: "time" },
  ],
  ledger: [
    { key: "created_at", label: "发生时间", format: "time" },
    { key: "email", label: "账户" },
    { key: "kind", label: "类型", format: "status" },
    { key: "delta", label: "积分变动", format: "credits" },
    { key: "reason", label: "操作与说明" },
    { key: "management_reason", label: "管理员调整原因" },
    { key: "expires_at", label: "到期时间", format: "time" },
    { key: "id", label: "流水 ID" },
  ],
  operations: [
    { key: "created_at", label: "提交时间", format: "time" },
    { key: "email", label: "账户" },
    { key: "kind", label: "操作", format: "status" },
    { key: "status", label: "状态", format: "status" },
    { key: "frontend_model_label", label: "前端显示模型" },
    { key: "requested_model", label: "接口请求值" },
    { key: "actual_request_model", label: "实际请求模型" },
    { key: "actual_executed_model", label: "上游确认模型" },
    { key: "requested_quality", label: "请求质量", format: "quality" },
    { key: "resolution", label: "尺寸" },
    { key: "quoted_credits", label: "冻结报价", format: "credits" },
    { key: "billed_credits", label: "实际落账", format: "credits" },
    { key: "content", label: "操作内容" },
  ],
  artworks: ARTWORK_COLUMNS,
  models: [
    { key: "created_at", label: "审计时间", format: "time" },
    { key: "email", label: "账户" },
    { key: "frontend_model_label", label: "前端显示模型" },
    { key: "requested_model", label: "接口请求值" },
    { key: "actual_request_model", label: "实际请求模型" },
    { key: "actual_executed_model", label: "上游确认模型" },
    { key: "upstream", label: "接口执行记录" },
    { key: "requested_quality", label: "请求质量", format: "quality" },
    { key: "executed_quality", label: "实际质量", format: "quality" },
    { key: "images", label: "审计图数" },
    { key: "billed_credits", label: "已落账积分", format: "credits" },
    { key: "reason", label: "执行说明", format: "status" },
    { key: "billing_config_version", label: "计费版本" },
    { key: "cost_currency", label: "成本单位", format:"status" },
    { key: "cost_amount_micros", label: "估计成本", format:"micros" },
    { key: "cost_source", label: "成本来源", format:"status" },
  ],
  orders: [
    { key: "created_at", label: "创建时间", format: "time" },
    { key: "email", label: "账户" },
    { key: "title", label: "购买内容" },
    { key: "provider", label: "支付渠道", format: "status" },
    { key: "status", label: "状态", format: "status" },
    { key: "amount_cents", label: "订单金额", format: "money" },
    { key: "credits", label: "购入积分", format: "credits" },
    { key: "paid_at", label: "付款时间", format: "time" },
  ],
  access: [
    { key: "created_at", label: "时间", format: "time" },
    { key: "actor", label: "管理员" },
    { key: "action", label: "操作", format: "status" },
    { key: "section", label: "数据分类", format: "status" },
    { key: "target_email", label: "指定账户" },
  ],
  calls: [
    { key: "created_at", label: "调用时间", format: "time" },
    { key: "email", label: "账户" },
    { key: "operation", label: "操作" },
    { key: "frontend_model_label", label: "前端显示模型" },
    { key: "frontend_model_id", label: "展示模型关联 ID" },
    { key: "public_model_id", label: "平台解析 ID" },
    { key: "provider_id", label: "执行通道" },
    { key: "model_version", label: "模型版本" },
    { key: "billing_version", label: "计费版本" },
    { key: "wire_model", label: "接口请求值" },
    { key: "actual_request_model", label: "实际请求模型" },
    { key: "actual_executed_model", label: "上游确认模型" },
    { key: "response_model", label: "上游响应模型" },
    { key: "state", label: "调用状态", format: "status" },
    { key: "duration_ms", label: "响应耗时（ms）" },
    { key: "input_tokens", label: "输入 Token" },
    { key: "output_tokens", label: "输出 Token" },
  ],
};
const qualityNames: Record<string, string> = {
  low: "经济",
  medium: "标准",
  high: "高质量",
  xhigh: "超高质量",
  max: "极致质量",
  auto: "自动",
};
const names: Record<string, string> = {
  personal: "个人",
  enterprise: "企业",
  unknown: "未登记",
  'enterprise-membership': '实际企业成员关系',
  'manual-profile': '运营登记',
  purchase: "充值",
  consume: "消费",
  grant: "赠送",
  refund: "退款",
  expire: "到期",
  generate: "生图",
  suite: "套图",
  aplus: "A+",
  video: "视频",
  "canvas-text-edit": "画布改字",
  queued: "排队",
  processing: "执行中",
  pending: "处理中",
  done: "完成",
  completed: "完成",
  error: "失败",
  failed: "失败",
  needs_attention: "待核查",
  paid: "已支付",
  expired: "已过期",
  wechat: "微信",
  alipay: "支付宝",
  mock: "模拟支付",
  generated: "成功",
  "quality-downgrade": "质量回退",
  "upstream-unsupported": "上游不支持参数",
  "provider-fallback": "接口回退",
  view: "查看",
  "view-image": "查看图片",
  "view-input-image": "查看原图",
  "view-trace": "查看执行链路",
  "update-profile": "更新账户资料",
};
for (const section of sections) names[section.id] = section.label;
Object.assign(names, {
  CNY:"人民币",USD:"美元",credits:"积分", "manual-estimate":"手工估计", "legacy-credit-estimate":"历史积分估计",
  main: "商品主图",
  scene: "场景图",
  detail: "详情图",
  retouch: "商品精修",
  upload: "导入图片",
  user: "普通用户",
  admin: "管理员",
  succeeded: "接口返回成功",
  "stream-opened": "流式连接已打开",
  "response-received": "已收到 HTTP 响应",
  rejected: "接口明确拒绝",
  "unknown-result": "结果待核查",
  agent: "智能助手",
  genchat: "生图对话",
  "agent-completed": "助手响应完成",
  "agent-error": "助手响应失败",
  "agent-aborted": "助手响应中止",
  "agent-deferred": "助手响应暂停",
  "view-conversation": "查看对话内容",
  create: "创建账户",
  profile: "编辑用户资料",
  position: "绑定岗位",
  ban: "封禁状态修改",
  role: "权限修改",
  adjust: "调整积分",
  "reset-password": "重置密码",
  "manage-create": "创建账户",
  "manage-profile": "编辑用户资料",
  "manage-position": "绑定岗位",
  "manage-ban": "封禁状态修改",
  "manage-role": "权限修改",
  "manage-adjust": "调整积分",
  "manage-reset-password": "重置密码",
  delete: "删除账户",
  note: "修改备注",
  "ban-ip": "封禁 IP",
  "unban-ip": "解除 IP 封禁",
  "settings-update": "系统设置更新",
  "owner-account": "站长账号设置",
  "artwork-delete": "删除作品",
});
Object.assign(names, ARTWORK_DETAIL_VALUES);
const n = (value: unknown) =>
  Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
function display(value: unknown, format?: Column["format"]) {
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined || value === "") return "未记录";
  if (value === "unrecorded") return "未记录";
  if(format==="micros")return microsToDecimal(String(value));
  if (format === "changes") {
    try {
      const data = JSON.parse(String(value));
      const out: string[] = [];
      for (const [key, label] of [
        ["before", "修改前"],
        ["after", "修改后"],
      ]) {
        if (data[key]) {
          const r = data[key];
          out.push(
            `${label}：姓名 ${r.name || "未登记"}；手机 ${r.phone || "未登记"}；权限 ${r.role === "admin" ? "管理员" : "普通用户"}；${r.banned ? "已封禁" : "正常"}；备注 ${r.note || "无"}`,
          );
        }
      }
      if (data.delta)
        out.push(
          `积分变动 ${data.delta > 0 ? "+" : ""}${data.delta}，可用 ${data.availableBefore} → ${data.availableAfter}`,
        );
      if (data.expiresAt)
        out.push(`新增积分到期：${display(data.expiresAt, "time")}`);
      if (data.sessionsRevoked) out.push("旧登录会话已失效");
      return out.join("\n") || "无账户字段变更";
    } catch {
      return "无法读取变更详情";
    }
  }
  if (format === "time") {
    const d = new Date(String(value));
    return Number.isFinite(d.getTime())
      ? d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })
      : "未记录";
  }
  if (format === "money") return `¥${(Number(value) / 100).toFixed(2)}`;
  if (format === "discount")
    return `${n(value)}%（${n(Number(value) / 10)} 折）`;
  if (format === "credits") return n(value);
  if (format === "type" || format === "status")
    return names[String(value)] || String(value);
  if (format === "quality") return qualityNames[String(value)] || String(value);
  return String(value);
}
function initialFilter(params?:URLSearchParams): Filter {
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  return {
    from: new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400_000)
      .toISOString()
      .slice(0, 10),
    to: today,
    email: "",
    q: "",
    accountType: "",
    status: "",
    position: "",
    period: 'range',
    id: '',
    source: '',
    ...Object.fromEntries(['from','to','email','q','accountType','status','position','period','id','source'].filter(key=>params?.has(key)).map(key=>[key,params!.get(key)!])),
  };
}
const descriptions: Record<BiSection, string> = {
  management:
    "用户管理操作的原因、变更前后与关联积分流水。密码与密钥不会进入日志；积分操作按编号防止重复提交。",
  conversations:
    "按最后活动时间筛选历史对话，详情仅展示用户与助手的文字内容。条目数为助手消息或生图轮次，不等同于请求次数；系统消息、工具内部数据和凭据不展示。",
  overview:
    "以已落账流水核对用量，按北京时间自然日统计。当前余额与期间用量分开展示。",
  users:
    "实际企业归属与账号资料；期间用量按筛选日期统计。",
  operations:
    "持久化业务任务：生图、套图、A+、画布改字与视频。其他工具的成功操作可在作品和流水中查看。",
  ledger:
    "完整积分事件。消费、赠送、充值、退款、到期与管理员调整分别保留，作品数量不代表消费积分。",
  artworks:
    "查看保存的图片、提示词、操作类型与作品来源。默认排除回收站；作品数包含导入和中间产物。",
  models:
    "请求模型、接口执行模型与质量回退来自持久审计记录。网关别名的真实模型请打开执行链路查看。",
  orders:
    "人民币金额按订单的分单位换算。已支付筛选按付款日期，其余按创建日期。模拟支付与真实收款分开；购入积分单价不等于账户专属折扣。",
  access:
    "记录 BI 数据访问、图片查看、执行链路查看和账户资料修改。此记录从 BI 上线后开始。",
  calls:
    "上线后开始采集文本、视觉与图片的 SDK 调用。每次尝试分别记录；流式响应仅表示连接已打开，不代表生成最终成功。网关别名的真实路由见任务执行链路。",
};
const statuses: Partial<Record<BiSection, [string, string][]>> = {
  conversations: [
    ["agent", "智能助手"],
    ["genchat", "生图对话"],
  ],
  users: [
    ["active", "正常"],
    ["banned", "已封禁"],
  ],
  ledger: [
    ["consume", "消费"],
    ["purchase", "充值"],
    ["grant", "赠送"],
    ["refund", "退款"],
    ["expire", "到期"],
  ],
  operations: [
    ["pending", "处理中"],
    ["queued", "排队"],
    ["processing", "执行中"],
    ["done", "完成（图片）"],
    ["completed", "完成（画布/视频）"],
    ["error", "失败"],
    ["failed", "失败（视频）"],
    ["review", "待审核 / 核查"],
  ],
  artworks: [
    ["all", "含回收站"],
    ["deleted", "仅回收站"],
  ],
  models: [["fallback", "仅回退记录"]],
  orders: [
    ["paid", "已支付"],
    ["pending", "待支付"],
    ["failed", "失败"],
    ["expired", "过期"],
  ],
  calls: [
    ["succeeded", "接口返回成功"],
    ["stream-opened", "流式响应已打开"],
    ["rejected", "明确拒绝"],
    ["unknown-result", "结果待核查"],
  ],
};

export function BiDashboard({ initialSection = "overview", embedded = false }: { initialSection?: BiSection; embedded?:boolean }) {
  const router = useRouter();
  const searchParams=useSearchParams(),searchKey=searchParams.toString();
  const [section, setSection] = useState<BiSection>(initialSection);
  const [draft, setDraft] = useState<Filter>(()=>initialFilter(new URLSearchParams(searchKey)));
  const [filter, setFilter] = useState<Filter>(()=>initialFilter(new URLSearchParams(searchKey)));
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<BiResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<{
    section: BiSection;
    row: BiRow;
  } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sourceRead = useRef<AbortController | null>(null), selectedOwner = useRef(selected);
  const [sourceLoading, setSourceLoading] = useState(false);
  selectedOwner.current = selected;
  // URL synchronization creates new filter objects; only a changed query should
  // start a read. Navigation previously sent the same expensive request twice.
  const requestQuery = new URLSearchParams({ ...filter, section, page: String(page), size: "30" }).toString();
  useEffect(() => {
    setSourceLoading(false);
    return () => sourceRead.current?.abort();
  }, [selected, requestQuery]);
  const navigatedSection = useRef(initialSection);
  useEffect(() => {
    navigatedSection.current = initialSection;
    setSection(initialSection);
    setPage(1);
    setSelected(null);
    const incoming=initialFilter(new URLSearchParams(searchKey));
    if(initialSection==='overview')incoming.period='range';
    setFilter(incoming);
    setDraft(incoming);
  }, [initialSection,searchKey]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setData(null);
    void fetch(`/api/admin/bi?${requestQuery}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "读取失败");
        return body as BiResponse;
      })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [requestQuery, reload]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [selected]);
  function navigate(next: BiSection, day?: string) {
    navigatedSection.current = next;
    const nextFilter={...filter,status:'',position:'',id:'',source:'',...(next==='overview'?{period:'range'}:{}),...(day?{from:day,to:day,period:'range',status:next==='orders'?'paid':''}:{})};
    router.push(`/admin/center?${new URLSearchParams({...nextFilter,section:next})}`, { scroll: false });
    setSection(next);
    setPage(1);
    setSelected(null);
    setFilter(nextFilter);
    setDraft(nextFilter);
    if (day) {
      const value = {
        ...filter,
        from: day,
        to: day,
        status: next === "orders" ? "paid" : "",
        period:'range',id:'',source:'',
      };
      setDraft(value);
      setFilter(value);
    }
  }
  function account(email: string, next: BiSection) {
    navigatedSection.current = next;
    const value = { ...filter, email,q:'',accountType:'',status: "",position:'',id:'',source:'' };
    router.push(`/admin/center?${new URLSearchParams({...value,section:next})}`, { scroll: false });
    setDraft(value);
    setFilter(value);
    setSection(next);
    setPage(1);
    setSelected(null);
  }
  async function openSourceArtwork(id: string, email: string) {
    const owner=selectedOwner.current;if(!owner)return;
    sourceRead.current?.abort();const abort=new AbortController();sourceRead.current=abort;setSourceLoading(true);
    const current=()=>!abort.signal.aborted&&selectedOwner.current===owner;
    try {
      const params = new URLSearchParams({ section: "artworks", id, email, status: "all" });
      const response = await fetch(`/api/admin/bi?${params}`, { cache: "no-store", signal: abort.signal });
      const body = await response.json();
      if(!current())return;
      if (!response.ok || !body.rows?.[0]) throw new Error(body.error || "源作品已清理或不存在");
      setSelected({ section: "artworks", row: body.rows[0] });
    } catch (error) {
      if(current())setNotice(error instanceof Error ? error.message : "读取源作品失败");
    } finally { if(current())setSourceLoading(false); }
  }
  function exportPage() {
    if (!data || section === "overview") return;
    const cs = columns[section];
    const text =
      "\uFEFF" +
      [
        cs.map((c) => biCsvCell(c.label)).join(","),
        ...data.rows.map((row) =>
          cs.map((c) => biCsvCell(display(row[c.key], c.format))).join(","),
        ),
      ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `naumi-bi-${section}-${filter.period==='all'?'all-history':`${filter.from}-${filter.to}`}-page${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const active = sections.find((s) => s.id === section)!;
  return (
    <AdminCenterShell embedded={embedded} active={section} onBiNavigate={navigate}>
    <div className={styles.shell}>
      <BiTooltip />
      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1>{active.label}</h1>
            <p>{descriptions[section]}</p>
          </div>
          <button
            className={styles.button}
            type="button"
            onClick={() => setReload((x) => x + 1)}
            disabled={busy}
          >
            <RefreshCw size={16} className={busy ? styles.spin : ""} />
            刷新
          </button>
        </header>
        {notice && (
          <div className={styles.success} role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label="关闭操作提示">
              关闭
            </button>
          </div>
        )}
        <form
          className={styles.filters}
          onSubmit={(event) => {
            event.preventDefault();
            setFilter({ ...draft });
            router.replace(`/admin/center?${new URLSearchParams({...draft,section})}`,{scroll:false});
            setPage(1);
            setSelected(null);
          }}
        >
          {section!=='overview'&&<label>历史范围<select aria-label="历史范围" value={draft.period} onChange={e=>setDraft(f=>({...f,period:e.target.value}))}><option value="range">指定日期</option><option value="all">全部历史</option></select></label>}
          <label>
            开始日期
            <input
              aria-label="开始日期"
              type="date"
              required
              disabled={draft.period==='all'}
              value={draft.from}
              onChange={(e) =>
                setDraft((f) => ({ ...f, from: e.target.value }))
              }
            />
          </label>
          <label>
            结束日期
            <input
              aria-label="结束日期"
              type="date"
              required
              disabled={draft.period==='all'}
              value={draft.to}
              onChange={(e) => setDraft((f) => ({ ...f, to: e.target.value }))}
            />
          </label>
          <label>
            账户类型
            <select
              aria-label="账户类型"
              value={draft.accountType}
              onChange={(e) =>
                setDraft((f) => ({ ...f, accountType: e.target.value }))
              }
            >
              <option value="">全部类型</option>
              <option value="personal">个人</option>
              <option value="enterprise">企业</option>
              <option value="unknown">未登记</option>
            </select>
          </label>
          {section === "users" && (
            <label>
              岗位
              <select
                aria-label="岗位"
                value={draft.position}
                onChange={(e) =>
                  setDraft((f) => ({ ...f, position: e.target.value }))
                }
              >
                <option value="">全部岗位</option>
                {USER_POSITIONS.filter(Boolean).map(value => <option key={value} value={value}>{value}</option>)}
                <option value="unassigned">未分组</option>
              </select>
            </label>
          )}
          <label className={styles.search}>
            搜索账户
            <input
              aria-label="搜索账户"
              value={draft.q}
              placeholder="姓名、邮箱、企业名称"
              onChange={(e) => setDraft((f) => ({ ...f, q: e.target.value }))}
            />
          </label>
          {statuses[section] && (
            <label>
              记录筛选
              <select
                aria-label="记录筛选"
                value={draft.status}
                onChange={(e) =>
                  setDraft((f) => ({ ...f, status: e.target.value }))
                }
              >
                <option value="">
                  {section === "artworks" ? "正常作品" : "全部状态"}
                </option>
                {statuses[section]!.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          )}
          {section==='operations'&&<label>任务编号<input aria-label="任务编号" value={draft.id} placeholder="精确查询，不受日期限制" maxLength={240} onChange={e=>setDraft(f=>({...f,id:e.target.value}))}/></label>}
          <button className={styles.primary} type="submit">
            <Search size={16} />
            查询
          </button>
        </form>
        <div className={styles.scope}>
          <span>
            {filter.period==='all'?'全部历史（分页读取）':`统计日期：${filter.from} 至 ${filter.to} · 北京时间`}
          </span>
          {filter.email && (
            <button
              type="button"
              onClick={() => {
                const f = { ...filter, email: "" };
                setFilter(f);
                setDraft(f);
                router.replace(`/admin/center?${new URLSearchParams({...f,section})}`,{scroll:false});
                setPage(1);
              }}
            >
              当前账户：{filter.email}
              <X size={14} />
            </button>
          )}
          <span className={styles.updated}>
            {data
              ? `更新于 ${new Date(data.generatedAt).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`
              : ""}
          </span>
        </div>
        {busy ? (
          <div className={styles.empty} role="status">
            <Loader2 size={24} className={styles.spin} />
            正在读取数据…
          </div>
        ) : error ? (
          <div className={styles.error} role="alert">
            {error}
            <button onClick={() => setReload((x) => x + 1)}>重试</button>
          </div>
        ) : data?.overview ? (
          <Overview data={data.overview} onNavigate={navigate} />
        ) : data && section !== "overview" ? (
          <>
            <div className={styles.tableTop}>
              {section === "users" && (
                <button
                  className={styles.primary}
                  onClick={() => setSelected({ section: "users", row: {} })}
                >
                  新增用户
                </button>
              )}
              <span>
                共 <strong>{n(data.total)}</strong> 条 · 本页 {data.rows.length}{" "}
                条
              </span>
              <button
                className={styles.button}
                type="button"
                disabled={!data.rows.length}
                onClick={exportPage}
              >
                <Download size={15} />
                导出本页 CSV
              </button>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    {section === "artworks" && <th>图片</th>}
                    {columns[section].map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, i) => (
                    <tr key={`${row.source_table||''}:${row.email||''}:${row.id||i}`}>
                      {section === "artworks" && (
                        <td>
                          <ArtworkMedia row={row} onOpen={() => setSelected({ section, row })} />
                        </td>
                      )}
                      {columns[section].map((c) => (
                        <td
                          key={c.key}
                          className={
                            c.format === "credits" || c.format === "money"
                              ? styles.number
                              : undefined
                          }
                        >
                          <span
                            tabIndex={0}
                            data-bi-tip={`${c.label}：${display(row[c.key], c.format)}`}
                            aria-label={`${c.label}：${display(row[c.key], c.format)}`}
                            className={
                              c.key === "title" || c.key === "name" || c.key === "prompt" ||
                              c.key === "prompt_display" ||
                              c.key === "content" ||
                              c.key === "reason" ||
                              c.key === "changes"
                                ? styles.truncated
                                : undefined
                            }
                          >
                            {display(row[c.key], c.format)}
                          </span>
                        </td>
                      ))}
                      <td>
                        <button
                          className={styles.textButton}
                          onClick={() => setSelected({ section, row })}
                        >
                          {section === "users" ? "管理用户" : "查看"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!data.rows.length && (
                    <tr>
                      <td
                        colSpan={columns[section].length + 2}
                        className={styles.noRows}
                      >
                        当前筛选下没有记录。可扩大日期范围或清除账户筛选。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <button
                className={styles.button}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
                上一页
              </button>
              <span>
                第 {page} 页 / {Math.max(1, Math.ceil(data.total / data.size))}{" "}
                页
              </span>
              <button
                className={styles.button}
                disabled={page * data.size >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
                <ChevronRight size={16} />
              </button>
            </div>
          </>
        ) : null}
        <footer className={styles.notes}>
          <strong>统计口径</strong>
          <p>
            积分消费来自已提交的消费流水，退款单独列示；管理员调整不计入使用量。可用积分为有效批次余额减当前预留。作品数量包含导入、编辑与中间产物。模型审计仅覆盖有记录的图片，不能当作全部请求成功率；预估成本积分不代表人民币成本或利润。
          </p>
        </footer>
      </main>
      {selected && (
        <div
          className={styles.overlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <section
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="记录详情"
            onKeyDown={(e) => {
              if (e.key === "Escape") setSelected(null);
              if (e.key === "Tab") {
                const nodes = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), input, select, textarea, a[href]",
                  ),
                );
                const first = nodes[0],
                  last = nodes.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className={styles.drawerHead}>
              <div>
                <span>{names[selected.section]}</span>
                <h2>
                  {String(
                    selected.row.name ||
                      selected.row.title ||
                      (selected.row.kind && names[String(selected.row.kind)]) ||
                      "记录详情",
                  )}
                </h2>
              </div>
              <button
                ref={closeRef}
                className={styles.iconButton}
                aria-label="关闭详情"
                onClick={() => setSelected(null)}
              >
                <X size={22} />
              </button>
            </div>
            {selected.row.email && (
              <div className={styles.drill}>
                <p>{String(selected.row.email)}</p>
                <div>
                  <a href={`/admin/usage?${new URLSearchParams({email:String(selected.row.email),from:filter.from,to:filter.to})}`}>用量统计</a>
                  {["operations","artworks","calls"].includes(selected.section)&&selected.row.id&&<a href={`/admin/creations/resolve?${new URLSearchParams({type:selected.section==="artworks"?"artwork":selected.section==="calls"?"model-call":({app_image_jobs:"image-job",app_canvas_image_tasks:"canvas-task",app_video_tasks:"video-task"} as Record<string,string>)[String(selected.row.source_table)]||"image-job",id:String(selected.row.id),email:String(selected.row.email)})}`}>创作全链路</a>}
                  <button
                    onClick={() => account(String(selected.row.email), "users")}
                  >
                    账户资料
                  </button>
                  <button
                    onClick={() =>
                      account(String(selected.row.email), "ledger")
                    }
                  >
                    积分流水
                  </button>
                  <button
                    onClick={() =>
                      account(String(selected.row.email), "artworks")
                    }
                  >
                    所有图片
                  </button>
                  <button
                    onClick={() =>
                      account(String(selected.row.email), "operations")
                    }
                  >
                    业务任务
                  </button>
                  <button
                    onClick={() =>
                      account(String(selected.row.email), "models")
                    }
                  >
                    模型记录
                  </button>
                  <button
                    onClick={() => account(String(selected.row.email), "calls")}
                  >
                    模型调用
                  </button>
                  <button
                    onClick={() =>
                      account(String(selected.row.email), "conversations")
                    }
                  >
                    对话内容
                  </button>
                </div>
              </div>
            )}
            {selected.section === "artworks" && <ArtworkMedia key={String(selected.row.id)} row={selected.row} detail />}
            {selected.section === "artworks" && selected.row.source_artwork_id && (
              <button className={styles.textButton} disabled={sourceLoading} onClick={() => void openSourceArtwork(String(selected.row.source_artwork_id), String(selected.row.email))}>
                {sourceLoading ? "正在读取源作品…" : "查看复制源作品"}
              </button>
            )}
            {selected.section === "users" && (
              <UserManager
                row={selected.row.email ? selected.row : undefined}
                onSaved={(email) => {
                  const value = {
                    ...filter,
                    q: "",
                    email,
                    accountType: "",
                    status: "",
                    position: "",
                  };
                  setFilter(value);
                  setDraft(value);
                  router.replace(`/admin/center?${new URLSearchParams({...value,section:'users'})}`,{scroll:false});
                  setPage(1);
                  setSelected(null);
                  setReload((x) => x + 1);
                  setNotice("用户管理操作已完成，账户数据已更新。");
                }}
              />
            )}
            {["calls", "operations", "models"].includes(selected.section) && <ModelChain row={selected.row}/>}
            <dl className={styles.details}>
              {Object.entries(selected.row)
                .filter(
                  ([key]) =>
                    !["has_image", "has_video", "profile_note", "model_attempts"].includes(key),
                )
                .map(([key, value]) => {
                  const column = (
                    selected.section !== "overview"
                      ? columns[selected.section]
                      : []
                  ).find((c) => c.key === key);
                  const labels: Record<string, string> = {
                    management_version: "管理资料版本",
                    management_actor: "调整管理员",
                    ledger_id: "关联积分流水",
                    status: "状态",
                    ratio: "比例",
                    state: "调用状态",
                    operation_id: "稳定操作 ID",
                    frontend_model_label: "前端显示模型",
                    frontend_model_id: "展示模型关联 ID",
                    actual_request_model: "实际请求模型",
                    actual_executed_model: "上游确认模型",
                    model_evidence: "模型证据",
                    model_evidence_scope: "证据范围",
                    id: "记录 ID",
                    job_id: "任务 ID",
                    parent_id: "上游作品 ID",
                    batch_id: "批次 ID",
                    origin: "当前画布标记（非创建来源）",
                    source_label: "创建来源",
                    provenance_status: "溯源状态",
                    provenance_ref: "来源事件 / 任务编号",
                    provenance_evidence: "溯源证据",
                    source_artwork_id: "复制源作品编号",
                    template_id: "模板编号",
                    dimensions: "实际图片尺寸",
                    operation_label: "创建操作",
                    prompt_display: "提示词 / 操作内容",
                    generation_mode: "生成方式",
                    input_count: "原图数量",
                    input_status: "原图关联",
                    image_width: "图片宽度",
                    image_height: "图片高度",
                    deleted_at: "回收时间",
                    phone: "手机号",
                    role: "权限",
                    plan: "历史套餐标识",
                    banned: "封禁状态",
                    joined_at: "注册时间",
                    last_ip: "最近登录 IP",
                    note: "管理员备注",
                    principal: "当前有效积分本金",
                    expiring_30d: "30 天内到期积分",
                    refunded: "期间退款积分",
                    ledger_events: "期间流水条数",
                    received_cents: "期间实际收款（元）",
                    purchased_credits: "期间已支付购入积分",
                    profile_updated_at: "资料更新时间",
                    organization_source: '归属来源',
                    registered_account_type: '运营登记类型',
                    registered_company: '运营登记企业',
                    stage: "任务阶段",
                    error: "错误记录",
                    reserved_credits: "任务预留记录",
                    settled: "是否已完成结算",
                    updated_at: "更新时间",
                    artwork_id: "对应作品 ID",
                    cents_per_credit: "购买单价（分 / 积分）",
                  };
                  return (
                    <div key={key}>
                      <dt>{column?.label || labels[key] || key}</dt>
                      <dd>
                        {display(
                          value,
                          column?.format ||
                            (key === "changes"
                              ? "changes"
                              : [
                                    "role",
                                    "status",
                                    "state",
                                    "category",'organization_source','registered_account_type',
                                  ].includes(key)
                                ? "status"
                                : key.endsWith("_at")
                                  ? "time"
                                  : key === "received_cents"
                                    ? "money"
                                    : undefined),
                        )}
                      </dd>
                    </div>
                  );
                })}
            </dl>
            {selected.section === "users" && selected.row.email && (
              <ProfileEditor
                row={selected.row}
                onSaved={() => {
                  setSelected(null);
                  setReload((x) => x + 1);
                }}
              />
            )}
            {selected.section === "conversations" && (
              <ConversationViewer
                key={JSON.stringify([selected.row.email,selected.row.source,selected.row.id])}
                id={String(selected.row.id)}
                email={String(selected.row.email)}
                kind={selected.row.source === "agent" ? "agent" : "genchat"}
              />
            )}
            {(selected.section === "operations" ||
              selected.section === "models" || (selected.section === "artworks" && selected.row.job_id)) && (
              <ExecutionTrace
                key={JSON.stringify([selected.row.email,selected.row.job_id||selected.row.id])}
                id={String(selected.row.job_id || selected.row.id)}
                email={String(selected.row.email)}
              />
            )}
          </section>
        </div>
      )}
    </div>
    </AdminCenterShell>
  );
}

function Overview({
  data,
  onNavigate,
}: {
  data: BiOverview;
  onNavigate: (s: BiSection, day?: string) => void;
}) {
  const [mode, setMode] = useState<"credits" | "money" | "images">("credits");
  const metric = (d: BiOverview["daily"][number]) =>
    mode === "credits"
      ? d.consumed
      : mode === "money"
        ? d.receivedCents / 100
        : d.artworks;
  const max = Math.max(1, ...data.daily.map(metric));
  const metrics: [string, string, string, BiSection][] = [
    [
      "用户账户",
      n(data.accounts),
      `企业 ${n(data.enterprises)} · 有消费用户 ${n(data.activeUsers)}`,
      "users",
    ],
    [
      "期间已落账消费",
      `${n(data.consumed)} 积分`,
      `退款 ${n(data.refunded)} 积分（单独列示）`,
      "ledger",
    ],
    [
      "当前可用积分",
      n(data.available),
      `当前预留 ${n(data.reserved)} 积分`,
      "users",
    ],
    [
      "期间保存作品",
      n(data.artworks),
      `回收站另有 ${n(data.deletedArtworks)} 件`,
      "artworks",
    ],
    [
      "期间业务任务",
      n(data.tasks),
      `失败 ${n(data.failed)} · 待审核 / 核查 ${n(data.review)}`,
      "operations",
    ],
    [
      "期间实际收款",
      `¥${(data.receivedCents / 100).toFixed(2)}`,
      `模拟支付 ¥${(data.mockCents / 100).toFixed(2)}（未计入）`,
      "orders",
    ],
  ];
  return (
    <>
      <div className={styles.metrics}>
        {metrics.map(([title, value, note, section]) => (
          <button
            key={title}
            data-bi-tip={`${title}：${value}\n${note}\n点击查看明细`}
            onClick={() => onNavigate(section)}
          >
            <span>{title}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </button>
        ))}
      </div>
      <section className={styles.chart}>
        <div className={styles.panelHead}>
          <div>
            <h2>
              {mode === "credits"
                ? "积分消费趋势"
                : mode === "money"
                  ? "实际收款趋势"
                  : "保存作品趋势"}
            </h2>
            <p>
              北京时间自然日 ·{" "}
              {mode === "credits"
                ? "积分"
                : mode === "money"
                  ? "人民币元（模拟支付未计入）"
                  : "件"}{" "}
              · 悬停查看，点击查看当日明细
            </p>
          </div>
          <span>{data.daily.length} 天</span>
        </div>
        <div className={styles.chartModes} role="group" aria-label="趋势指标">
          {(
            [
              ["credits", "消费积分"],
              ["money", "实际收款"],
              ["images", "作品数量"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className={styles.bars}
          role="group"
          aria-label={
            mode === "money"
              ? `所选日期实际收款，累计 ${(data.receivedCents / 100).toFixed(2)} 元`
              : mode === "images"
                ? `所选日期作品，累计 ${data.artworks} 件`
                : `所选日期每日消费，累计 ${data.consumed} 积分`
          }
        >
          {data.daily.map((day) => (
            <button
              type="button"
              key={day.date}
              data-bi-tip={`${day.date}\n消费：${n(day.consumed)} 积分\n退款：${n(day.refunded)} 积分\n实际收款：¥${(day.receivedCents / 100).toFixed(2)}\n模拟支付：¥${(day.mockCents / 100).toFixed(2)}（未计入）\n作品：${n(day.artworks)} 件\n点击查看当日明细`}
              aria-label={`${day.date} ${mode === "money" ? "实际收款 " + (day.receivedCents / 100).toFixed(2) + " 元" : mode === "credits" ? "消费 " + day.consumed + " 积分" : "作品 " + day.artworks + " 件"}，点击查看明细`}
              onClick={() =>
                onNavigate(
                  mode === "credits"
                    ? "ledger"
                    : mode === "money"
                      ? "orders"
                      : "artworks",
                  day.date,
                )
              }
            >
              <i
                style={{
                  height: `${(metric(day) / max) * 100}%`,
                  minHeight: metric(day) ? "3px" : "0",
                }}
              />
              <span>{day.date.slice(5)}</span>
            </button>
          ))}
        </div>
        <details className={styles.chartDetails}>
          <summary>查看每日精确数据</summary>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>消费积分</th>
                  <th>退款积分</th>
                  <th>正常作品</th>
                  <th>实际收款（元）</th>
                  <th>模拟支付（元）</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{n(d.consumed)}</td>
                    <td>{n(d.refunded)}</td>
                    <td>{n(d.artworks)}</td>
                    <td>{(d.receivedCents / 100).toFixed(2)}</td>
                    <td>{(d.mockCents / 100).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className={styles.modelOverview}>
        <div className={styles.panelHead}>
          <div>
            <h2>接口执行模型分布</h2>
            <p>
              有审计记录的 {n(data.auditImages)} 张图片 · 质量差异{" "}
              {n(data.downgradedImages)} 张
            </p>
          </div>
          <button
            className={styles.textButton}
            onClick={() => onNavigate("models")}
          >
            查看审计
          </button>
        </div>
        {data.models.length ? (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>接口执行记录</th>
                  <th>审计图数</th>
                  <th>已落账积分</th>
                  <th>质量差异记录</th><th>估计成本（按币种分组）</th>
                </tr>
              </thead>
              <tbody>
                {data.models.map((row) => (
                  <tr
                    key={`${row.upstream}:${row.cost_currency}`}
                    tabIndex={0}
                    data-bi-tip={`${display(row.upstream)}\n审计图片：${n(row.images)} 张\n已落账：${n(row.billed_credits)} 积分\n质量差异：${n(row.fallbacks)} 条`}
                  >
                    <td>{display(row.upstream)}</td>
                    <td>{n(row.images)}</td>
                    <td>{n(row.billed_credits)}</td>
                    <td>{n(row.fallbacks)}</td><td>{display(row.cost_amount_micros,"micros")} {row.cost_amount_micros!==null&&`${display(row.cost_currency,"status")} · ${row.cost_actual?"实际":"估计"}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.noRows}>
            所选日期没有模型审计记录。历史未采集的请求不会推算补齐。
          </p>
        )}
      </section>
    </>
  );
}

function ProfileEditor({ row, onSaved }: { row: BiRow; onSaved: () => void }) {
  const [type, setType] = useState(String(row.registered_account_type || "unknown"));
  const [company, setCompany] = useState(String(row.registered_company || ""));
  const [percent, setPercent] = useState(
    row.agreed_pay_percent === null ? "" : String(row.agreed_pay_percent),
  );
  const [note, setNote] = useState(String(row.profile_note || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/bi/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: row.email,
          accountType: type,
          company,
          agreedPayPercent: percent.trim() ? Number(percent) : null,
          note,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.profile} onSubmit={save}>
      <h3>账户运营资料</h3>
      <p>
        此处只维护运营标签；企业成员归属在组织管理中修改，登记折扣不改变实际扣费。
      </p>
      <label>
        账户类型
        <select
          aria-label="登记账户类型"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="unknown">未登记</option>
          <option value="personal">个人</option>
          <option value="enterprise">企业</option>
        </select>
      </label>
      <label>
        企业名称
        <input
          aria-label="企业名称"
          maxLength={200}
          required={type === "enterprise"}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </label>
      <label>
        约定实付比例（%）
        <input
          aria-label="约定实付比例"
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          placeholder="例如 80 代表 8 折，留空为未登记"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
        />
      </label>
      <label>
        运营备注
        <textarea
          aria-label="运营备注"
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={styles.primary} disabled={busy} type="submit">
        {busy ? "正在保存…" : "保存运营资料"}
      </button>
    </form>
  );
}

type TraceAttempt = {
  operationId: string;
  model: string;
  state: string;
  gateway: boolean;
  router: {
    status: string;
    attempts: {
      model: string;
      provider: string;
      route: string;
      state: string;
      durationMs: number | null;
    }[];
  } | null;
};
function ExecutionTrace({ id, email }: { id: string; email: string }) {
  const [data, setData] = useState<TraceAttempt[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef<{version:number;abort:AbortController|null}>({ version: 0, abort: null });
  useEffect(() => {
    const state = current.current;
    state.version++;
    setData(null);
    setBusy(false);
    setError("");
    return () => {
      state.version++;
      state.abort?.abort();
    };
  }, [id, email]);
  async function load() {
    const version = ++current.current.version;
    current.current.abort?.abort();const abort=new AbortController();current.current.abort=abort;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/bi/trace?${new URLSearchParams({ id, email })}`,
        { cache: "no-store", signal: abort.signal },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "读取失败");
      if (!abort.signal.aborted && current.current.version === version) setData(body.attempts);
    } catch (e) {
      if (current.current.version === version)
        setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      if (current.current.version === version) setBusy(false);
    }
  }
  return (
    <section className={styles.trace}>
      <h3>实际执行链路</h3>
      <p>读取持久操作证据和网关真实路由。此操作只查询记录，不会触发生成。</p>
      <button className={styles.button} disabled={busy} onClick={load}>
        {busy ? (
          <Loader2 size={16} className={styles.spin} />
        ) : (
          <Activity size={16} />
        )}
        读取执行证据
      </button>
      {error && <p className={styles.error}>{error}</p>}
      {data &&
        (!data.length ? (
          <p>没有持久执行记录。请以接口审计信息为准；历史真实路由无法还原。</p>
        ) : (
          data.map((a) => (
            <div className={styles.attempt} key={a.operationId}>
              <strong>{a.model || "接口模型未记录"}</strong>
              <p>操作 ID：{a.operationId}</p>
              <p>
                持久状态：{a.state} · {a.gateway ? "网关路由" : "直接调用"}
              </p>
              {a.router?.attempts.length ? (
                a.router.attempts.map((r, i) => (
                  <dl key={i}>
                    <div>
                      <dt>实际触发模型</dt>
                      <dd>{r.model || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>供应商 / 路由</dt>
                      <dd>
                        {r.provider} / {r.route}
                      </dd>
                    </div>
                    <div>
                      <dt>尝试状态</dt>
                      <dd>{r.state}</dd>
                    </div>
                    <div>
                      <dt>耗时</dt>
                      <dd>
                        {r.durationMs === null
                          ? "未记录"
                          : `${n(r.durationMs / 1000)} 秒`}
                      </dd>
                    </div>
                  </dl>
                ))
              ) : a.gateway ? (
                <p className={styles.warning}>
                  {a.router?.status === "not-configured"
                    ? "网关审计连接尚未配置"
                    : a.router?.status === "unavailable"
                      ? "网关审计暂时不可用"
                      : "网关没有对应记录"}
                  ，无法确认真实供应商模型。
                </p>
              ) : null}
            </div>
          ))
        ))}
    </section>
  );
}

function ConversationViewer({
  id,
  email,
  kind,
}: {
  id: string;
  email: string;
  kind: "agent" | "genchat";
}) {
  const [page, setPage] = useState(1);
  const [reload,setReload] = useState(0);
  const [result, setResult] = useState<{
    messages: { role: string; text: string; truncated: boolean }[];
    total: number;
    size: number;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    const params = new URLSearchParams({ id, email, kind, page: String(page) });
    fetch(`/api/admin/bi/conversation?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法读取对话内容");
        return response.json();
      })
      .then(value=>{if(!controller.signal.aborted)setResult(value);})
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [id, email, kind, page, reload]);
  return (
    <section className={styles.trace}>
      <h3>对话文字内容</h3>
      {error ? (
        <div><p role="alert">{error}</p><button className={styles.button} onClick={()=>setReload(value=>value+1)}>重试</button></div>
      ) : !result ? (
        <p>正在读取…</p>
      ) : (
        <>
          {result.messages.length === 0 && <p>没有可展示的文字消息。</p>}
          {result.messages.map((m, i) => (
            <div key={i}>
              <strong>{m.role === "user" ? "用户" : "助手"}</strong>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {m.text}
              </p>
              {m.truncated && (
                <small>此消息超过 20,000 字，当前展示前 20,000 字。</small>
              )}
            </div>
          ))}
          <div className={styles.pagination}>
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <span>
              第 {page} 页 · 共 {result.total} 条文字消息
            </span>
            <button
              disabled={page * result.size >= result.total}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </section>
  );
}
