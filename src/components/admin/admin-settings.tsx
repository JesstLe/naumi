"use client";
import {AdminUsagePanel} from "./usage/usage-panel";
import { CachedImage } from "@/components/cached-image";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  ShieldCheck,
  KeyRound,
  Cpu,
  Users,
  ImageIcon,
  Upload,
  Server,
  Database,
  RefreshCw,
  Check,
  LayoutGrid,
  MessageSquare,
  Scissors,
  Shirt,
  ExternalLink,
  Palette,
  FileText,
  Sparkles,
  Ticket,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { browserSupabase } from "@/lib/supabase";
import { AdminTemplates } from "@/components/admin/admin-templates";
import { AdminTryon } from "@/components/admin/admin-tryon";
import { SelectMenu } from "@/components/ui/select-menu";
import { AdminPrompts } from "@/components/admin/admin-prompts";
import { DeployCenter } from "@/components/operator/deploy-center";
import { RelayTokensClient } from "@/components/operator/relay-tokens-client";
import { CardkeysAdmin } from "@/components/operator/cardkeys-admin";
import { OPERATOR_EMAIL } from "@/lib/operator";

type View = {
  modelConfigurationActive?: boolean;
  model: string;
  models?: string[];
  cutoutModel: string;
  keyMasked: string;
  hasKey: boolean;
  source: "db" | "env" | "none";
  openaiBaseUrlMasked?: string;
  openaiBaseUrlSet?: boolean;
  cutoutBackend?: "openai" | "replicate";
  cutoutReplicateReady?: boolean;
  cutoutReplicateModel?: string;
  cutoutReplicateTokenMasked?: string;
  signupBonus?: number;
  // 微信登录
  wechatAppid?: string;
  wechatToken?: string;
  wechatEmailDomain?: string;
  wechatSecretMasked?: string;
  wechatReady?: boolean;
  // 原生多用户开关
  multiUserEnabled?: boolean;
  // 积分计费开关
  creditsMetering?: boolean;
  // SMTP(忘记密码用)
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpFrom?: string;
  smtpConfigured?: boolean;
  // 支付
  payEnabled?: boolean;
  alipayAppid?: string;
  alipayPublicKey?: string;
  alipayPrivateKeyMasked?: string;
  alipayPrivateKeyReady?: boolean;
  alipayDerivedPublicKey?: string;
  wxpayMchid?: string;
  wxpayApiv3Masked?: string;
  wxpayApiv3Ready?: boolean;
  wxpayCertMasked?: string;
  wxpayCertReady?: boolean;
  wxpayCertSerial?: string;
  wxpayAppid?: string;

  brandName?: string;
  brandLogo?: string;
  pageAbout?: string;
  pageContact?: string;
  pagePlans?: string;
};

const MODELS = [
  "gpt-image-1",
  "gpt-image-1-mini",
  "gpt-image-1.5",
  "gpt-image-2",
  "dall-e-3",
];

// 供应商充值入口(站长自助充值)。若图像走第三方中转,把 OPENAI_TOPUP_URL 换成中转商充值页。
const OPENAI_TOPUP_URL =
  "https://platform.openai.com/settings/organization/billing/overview";
const REPLICATE_TOPUP_URL = "https://replicate.com/account/billing";

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// In-browser RSA-OAEP(SHA-256) so the key never leaves as plaintext.
// RSA-OAEP(4096) 单块明文上限 ~446B;支付宝/微信「应用私钥·证书」是 1600+ 字符,
// 超限会抛 "data too large" → 分块加密(每块 ≤400B),用 "|" 拼;服务端按块解密拼回。
// 短 key(如 sk-/r8_)只有一块、无 "|",与旧逻辑完全一致,向后兼容。
async function encryptKey(plain: string, token: string): Promise<string> {
  const res = await fetch("/api/admin/pubkey", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "获取公钥失败");
  const pub = await crypto.subtle.importKey(
    "spki",
    pemToDer(data.pem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  const all = new TextEncoder().encode(plain);
  const CHUNK = 400; // < 446B 安全边界(调用方已保证 plain 非空)
  const parts: string[] = [];
  for (let off = 0; off < all.length; off += CHUNK) {
    const slice = all.slice(off, off + CHUNK);
    const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, slice);
    let bin = "";
    const bytes = new Uint8Array(ct);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    parts.push(btoa(bin));
  }
  return parts.join("|");
}

// 是否安全上下文(HTTPS / localhost)——只有此时浏览器才有 crypto.subtle。
// HTTP 自托管(裸 IP,如 http://1.2.3.4)下 crypto.subtle=undefined,加密字段
// 改走「明文传输 + 服务端 AES 加密落库」:HTTP 本就无 TLS,transit 加密无意义,
// 真正保护的 at-rest 加密仍由服务端完成。
function hasSubtle(): boolean {
  return typeof window !== "undefined" && !!window.crypto?.subtle;
}

// 后台左侧分栏(方案 A)

const SECTIONS = [
  { id: "users", label: "用户与会员", icon: Users },
  { id: "usage", label: "用户用量", icon: Activity },
  { id: "artworks", label: "作品库", icon: ImageIcon },
  { id: "templates", label: "模板管理", icon: LayoutGrid },
  { id: "tryon", label: "试穿素材库", icon: Shirt },
  { id: "prompts", label: "提示词配置", icon: MessageSquare },
  { id: "api", label: "接口与模型", icon: KeyRound },
  { id: "auth", label: "登录与支付", icon: ShieldCheck },
  { id: "brand", label: "品牌与站点", icon: Palette },
  { id: "pages", label: "站点页面", icon: FileText },
  { id: "credits", label: "积分计费", icon: Database },
  { id: "ledger", label: "积分流水", icon: Database },
  { id: "deploy", label: "部署与更新", icon: Server },
  { id: "cardkeys", label: "兑换码", icon: Ticket },
] as const;
type SettingsSection = (typeof SECTIONS)[number]['id'];
const SETTINGS_ALIASES: Record<string, SettingsSection> = {
  login: 'auth', payment: 'auth', payments: 'auth', pay: 'auth', wechat: 'auth', smtp: 'auth',
  branding: 'brand', site: 'brand', page: 'pages', template: 'templates', prompt: 'prompts', cardkey: 'cardkeys', redeem: 'cardkeys',
  'account-credits': 'credits', 'legacy-deploy': 'deploy',
};
const SETTINGS_MOVED: Record<string, { path: string; section?: string; tab?: string }> = {
  users: { path: '/admin/center', section: 'users' }, artworks: { path: '/admin/center', section: 'artworks' },
  ledger: { path: '/admin/center', section: 'ledger' }, credits: { path: '/admin/billing', section: 'wallet', tab: 'credits' },
  wallet: { path: '/admin/billing', section: 'wallet', tab: 'products' }, recharge: { path: '/admin/billing', section: 'wallet', tab: 'products' },
  deploy: { path: '/admin/deployments' }, models: { path: '/admin/model-management' }, 'model-config': { path: '/admin/bi/models' },
};

// 配置块状态徽标:已生效(绿)/ 未生效(琥珀)。登录与支付各卡片头部统一用它。
function ReadyBadge({
  ready,
  className = "",
}: {
  ready: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        ready
          ? "bg-emerald-500/10 text-emerald-600"
          : "bg-amber-500/10 text-amber-600"
      } ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          ready ? "bg-emerald-500" : "bg-amber-500"
        }`}
      />
      {ready ? "已生效" : "未生效"}
    </span>
  );
}

// Self-gating: renders only when the signed-in user is the configured admin
// (the API returns 403 otherwise). Drop it anywhere inside an authed page.
export function AdminSettings({ localAdmin = false }: { localAdmin?: boolean }) {
  const settingsQuery = useSearchParams(), settingsRouter = useRouter(), settingsPath = usePathname();
  const requestedSection = settingsQuery.get('tab') || settingsQuery.get('section') || 'api';
  const canonicalSection = Object.hasOwn(SETTINGS_ALIASES, requestedSection) ? SETTINGS_ALIASES[requestedSection] : requestedSection;
  const [migrationMessage, setMigrationMessage] = useState('');

  // 配置自己实例要用的分栏(接口与模型/提示词/模板),隐藏运营/变现/多用户向的分栏。

  const [token, setToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [model, setModel] = useState("");
  const [imageModels, setImageModels] = useState("");
  const [cutoutModel, setCutoutModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [baseUrlMasked, setBaseUrlMasked] = useState("");
  const [baseUrlSet, setBaseUrlSet] = useState(false);
  const [cutoutBackend, setCutoutBackend] = useState<"openai" | "replicate">(
    "replicate"
  );
  const [replicateModel, setReplicateModel] = useState("");
  const [replicateTokenInput, setReplicateTokenInput] = useState("");
  // ── 登录与支付板块 ──
  // 微信登录(明文字段 + AppSecret 加密输入)
  const [wechatAppid, setWechatAppid] = useState("");
  const [wechatToken, setWechatToken] = useState("");
  const [wechatEmailDomain, setWechatEmailDomain] = useState("");
  const [wechatSecretInput, setWechatSecretInput] = useState("");
  // 收款开关
  const [payEnabled, setPayEnabled] = useState(false);
  const [multiUserOn, setMultiUserOn] = useState(false);
  const [meteringOn, setMeteringOn] = useState(false);
  const [grantEmail, setGrantEmail] = useState(OPERATOR_EMAIL);
  const [grantAmount, setGrantAmount] = useState("100");
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  // 站长邮箱账号(邮箱+密码登录,与官方站一致)
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [ownerEmailInput, setOwnerEmailInput] = useState("");
  const [ownerPwInput, setOwnerPwInput] = useState("");
  // 支付宝商户
  const [alipayAppid, setAlipayAppid] = useState("");
  const [alipayPublicKey, setAlipayPublicKey] = useState("");
  const [alipayPrivateKeyInput, setAlipayPrivateKeyInput] = useState("");
  // 微信支付商户
  const [wxpayMchid, setWxpayMchid] = useState("");
  const [wxpayAppid, setWxpayAppid] = useState("");
  const [wxpayCertSerial, setWxpayCertSerial] = useState("");
  const [wxpayApiv3Input, setWxpayApiv3Input] = useState("");
  const [wxpayCertInput, setWxpayCertInput] = useState("");

  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  // 站点页面(关于/联系/定价)自定义内容
  const [pageAbout, setPageAbout] = useState("");
  const [pageContact, setPageContact] = useState("");
  const [pagePlans, setPagePlans] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [usageDays, setActiveUsageDays] = useState(30);
  useEffect(() => { const days = Number(settingsQuery.get('days')); setActiveUsageDays([7, 30, 90, 365].includes(days) ? days : 30); }, [settingsQuery]);
  function setUsageDays(days: number) { setActiveUsageDays(days); const params = new URLSearchParams(settingsQuery.toString()); params.set('days', String(days)); settingsRouter.replace(`${settingsPath}?${params}`, { scroll: false }); }
  // 左侧分栏:当前板块(方案 A,大厂式后台)
  const [section, setActiveSection] = useState<
    | "users"
    | "usage"
    | "artworks"
    | "templates"
    | "tryon"
    | "prompts"
    | "api"
    | "auth"
    | "brand"
    | "pages"
    | "credits"
    | "ledger"
    | "deploy"
    | "cardkeys"
  >("api");
  function setSection(next: SettingsSection, email?: string) {
    const params = new URLSearchParams(settingsQuery.toString()); params.set('view', 'settings'); params.set('tab', next); params.delete('section');
    if (email) params.set('email', email);
    settingsRouter.replace(`${settingsPath}?${params}`, { scroll: false });
  }
  useEffect(() => {
    const compatibility = requestedSection === 'account-credits' || requestedSection === 'legacy-deploy';
    const moved = !compatibility && Object.hasOwn(SETTINGS_MOVED, canonicalSection) ? SETTINGS_MOVED[canonicalSection] : undefined;
    if (moved) {
      const params = new URLSearchParams(settingsQuery.toString()); params.delete('view'); params.delete('tab'); params.delete('section');
      if (moved.section) params.set('section', moved.section); if (moved.tab) params.set('tab', moved.tab);
      setMigrationMessage('正在打开此功能的新位置…');
      settingsRouter.replace(`${moved.path}${params.size ? `?${params}` : ''}`, { scroll: false }); return;
    }
    const available = SECTIONS.some(item => item.id === canonicalSection);
    setActiveSection(available ? canonicalSection as SettingsSection : 'api');
    setMigrationMessage(available ? '' : `旧标签“${requestedSection.slice(0, 80)}”没有对应设置，请选择下方分区。`);
  }, [canonicalSection, requestedSection, settingsQuery, settingsRouter]);
  useEffect(() => { if (requestedSection === 'account-credits' && settingsQuery.get('email')) setGrantEmail(settingsQuery.get('email')!); }, [requestedSection, settingsQuery]);
  const probe = useCallback(async () => {
    // 本地管理员:无 Supabase token,鉴权靠 HttpOnly cookie(同源请求自动带);
    // 用 "local" 哨兵值填 token,让下游 `if (!token) return` 守卫通过、请求照发
    //(服务端 requireAdmin 先验 cookie,忽略这个无效 Bearer)。
    let tok: string | null = null;
    if (!localAdmin) {
      const sb = browserSupabase();
      const { data } = await sb.auth.getSession();
      tok = data.session?.access_token ?? null;
      if (!tok) return;
    }
    const res = await fetch("/api/admin/settings", {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    });
    if (!res.ok) return; // 403 -> not admin -> stay hidden
    const v = (await res.json()) as View;
    setToken(tok ?? "local");
    setView(v);
    setModel(v.model);
    setImageModels((v.models ?? [v.model]).join(", "));
    setCutoutModel(v.cutoutModel);
    setBaseUrl(""); // 不回显明文
    setBaseUrlMasked(v.openaiBaseUrlMasked ?? "");
    setBaseUrlSet(!!v.openaiBaseUrlSet);
    setCutoutBackend(v.cutoutBackend ?? "replicate");
    setReplicateModel(v.cutoutReplicateModel ?? "men1scus/birefnet");
    // 登录与支付:回填明文字段(敏感字段只看掩码,不回填输入框)
    setWechatAppid(v.wechatAppid ?? "");
    setWechatToken(v.wechatToken ?? "");
    setWechatEmailDomain(v.wechatEmailDomain ?? "");
    setPayEnabled(!!v.payEnabled);
    setMultiUserOn(!!v.multiUserEnabled);
    setMeteringOn(!!v.creditsMetering);
    setSmtpHost(v.smtpHost ?? "");
    setSmtpPort(v.smtpPort || "465");
    setSmtpUser(v.smtpUser ?? "");
    setSmtpFrom(v.smtpFrom ?? "");
    setAlipayAppid(v.alipayAppid ?? "");
    setAlipayPublicKey(v.alipayPublicKey ?? "");
    setWxpayMchid(v.wxpayMchid ?? "");
    setWxpayAppid(v.wxpayAppid ?? "");
    setWxpayCertSerial(v.wxpayCertSerial ?? "");
    setBrandName(v.brandName ?? "");
    setBrandLogo(v.brandLogo ?? "");
    setPageAbout(v.pageAbout ?? "");
    setPageContact(v.pageContact ?? "");
    setPagePlans(v.pagePlans ?? "");
    setIsAdmin(true);
  }, [localAdmin]);

  useEffect(() => {
    void probe();
  }, [probe]);

  // 站长邮箱账号:读当前绑定状态(仅自托管有意义;官方云该接口按管理员校验放行也无妨)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/owner-account", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const d = await r.json().catch(() => null);
        if (!cancelled && r.ok) setOwnerEmail(d?.ownerEmail || null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, token]);

  if (!isAdmin) return null;

  async function save(opts: { withKey: boolean }) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload: {
        model?: string;
        models?: string[];
        cutoutModel?: string;
        cutoutBackend?: string;
        replicateModel?: string;
        encryptedKey?: string;
        keyPlain?: string; // HTTP 无 crypto.subtle 时的明文兜底(服务端仍加密落库)
      } = {
        model,
        models: imageModels.split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
        cutoutModel,
        cutoutBackend,
        replicateModel,
      };
      if (opts.withKey) {
        if (!keyInput.trim()) throw new Error("请输入新的 API Key");
        if (hasSubtle())
          payload.encryptedKey = await encryptKey(keyInput.trim(), token);
        else payload.keyPlain = keyInput.trim();
      }
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setView(data as View);
      setModel((data as View).model);
      setImageModels(((data as View).models ?? [(data as View).model]).join(", "));
      setCutoutModel((data as View).cutoutModel);
      setCutoutBackend((data as View).cutoutBackend ?? "replicate");
      setReplicateModel(
        (data as View).cutoutReplicateModel ?? "men1scus/birefnet"
      );
      setKeyInput("");
      setMsg({
        ok: true,
        text: opts.withKey ? "Key 已加密更新" : "模型已更新",
      });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setBusy(false);
    }
  }

  // 保存「新用户注册赠送积分」
  // 保存 Replicate(第三方抠图)Token + 模型(Token 浏览器内 RSA 加密后再传)
  async function saveReplicate() {
    if (!token) return;
    if (!replicateTokenInput.trim()) {
      setMsg({ ok: false, text: "请输入新的 Replicate Token" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const encryptedReplicateToken = await encryptKey(
        replicateTokenInput.trim(),
        token
      );
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ replicateModel, encryptedReplicateToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      setView(data as View);
      setReplicateModel((data as View).cutoutReplicateModel ?? replicateModel);
      setReplicateTokenInput("");
      setMsg({ ok: true, text: "Replicate Token 已加密更新" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setBusy(false);
    }
  }

  // ── 登录与支付板块:统一的 POST + 回填 helper ──
  // payload 里的 encrypted* 字段由调用方先用 encryptKey 在浏览器内加密好。
  async function postSettings(
    payload: Record<string, unknown>,
    okText: string,
    clear?: () => void
  ) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失败");
      const v = data as View;
      setView(v);
      // 用回包的安全视图同步明文回显(敏感字段只看掩码)
      setWechatAppid(v.wechatAppid ?? "");
      setWechatToken(v.wechatToken ?? "");
      setWechatEmailDomain(v.wechatEmailDomain ?? "");
      setPayEnabled(!!v.payEnabled);
    setMultiUserOn(!!v.multiUserEnabled);
    setMeteringOn(!!v.creditsMetering);
    setSmtpHost(v.smtpHost ?? "");
    setSmtpPort(v.smtpPort || "465");
    setSmtpUser(v.smtpUser ?? "");
    setSmtpFrom(v.smtpFrom ?? "");
      setAlipayAppid(v.alipayAppid ?? "");
      setAlipayPublicKey(v.alipayPublicKey ?? "");
      setWxpayMchid(v.wxpayMchid ?? "");
      setWxpayAppid(v.wxpayAppid ?? "");
      setWxpayCertSerial(v.wxpayCertSerial ?? "");
      setBrandName(v.brandName ?? "");
      setBrandLogo(v.brandLogo ?? "");
      setBaseUrlMasked(v.openaiBaseUrlMasked ?? "");
      setBaseUrlSet(!!v.openaiBaseUrlSet);
      clear?.();
      setMsg({ ok: true, text: okText });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "保存失败" });
    } finally {
      setBusy(false);
    }
  }

  // 保存微信登录明文字段(AppID / Token / 邮箱域名)
  async function saveWechatLogin() {
    await postSettings(
      {
        wechatAppid,
        wechatToken,
        wechatEmailDomain,
      },
      "微信登录已保存"
    );
  }

  // 用 postSettings 走同一 POST + 回填(它会读回包同步 brandName/brandLogo)。
  async function saveBrandName() {
    await postSettings({ brandName }, "站点名称已保存");
  }
  async function saveBrandLogo() {
    await postSettings({ brandLogo }, "Logo 已保存");
  }

  // 保存站点页面(关于/联系/定价)。空串=清空→前台回退默认。
  async function saveSitePages() {
    await postSettings(
      { pageAbout, pageContact, pagePlans },
      "站点页面已保存"
    );
  }

  // 给某邮箱加/减积分(复用 /api/admin/users 的 adjust;months:0=永久不过期)。
  async function grantCredits() {
    if (!token) return;
    const email = grantEmail.trim().toLowerCase();
    const delta = Math.trunc(Number(grantAmount) || 0);
    if (!email || !delta) {
      setGrantMsg("请填写邮箱和有效的积分数");
      return;
    }
    setBusy(true);
    setGrantMsg(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "adjust", email, delta, months: 0 }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "操作失败");
      setGrantMsg(
        `已给 ${email} ${delta > 0 ? "增加" : "扣减"} ${Math.abs(delta)} 积分`
      );
    } catch (e) {
      setGrantMsg(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  // 上传 Logo 图片 → 存储返回 URL → 落库 brand_logo(与手填 URL 同一个值)。
  async function uploadBrandLogo(file: File) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    let url = "";
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/admin/brand-logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      url = data.url as string;
      setBrandLogo(url);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "上传失败" });
      setBusy(false);
      return;
    }
    // 上传成功 → 直接落库(postSettings 自管 busy/msg)。
    await postSettings({ brandLogo: url }, "Logo 已上传并保存");
  }

  // 加密更新一个敏感字段(浏览器内 RSA 加密 → POST 对应 encrypted* 字段)
  async function saveEncrypted(
    fieldName: string,
    plain: string,
    okText: string,
    clear: () => void
  ) {
    if (!token) return;
    if (!plain.trim()) {
      setMsg({ ok: false, text: "请输入内容" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const enc = await encryptKey(plain.trim(), token);
      await postSettings({ [fieldName]: enc }, okText, clear);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "保存失败" });
      setBusy(false);
    }
  }

  // 各收款/登录块「是否已生效」——用于卡片头部状态徽标(已生效 / 未生效)。
  const alipayReady = !!view?.alipayAppid && !!view?.alipayPrivateKeyReady;
  const wxpayReady =
    !!view?.wxpayMchid &&
    !!view?.wxpayAppid &&
    !!view?.wxpayCertSerial &&
    !!view?.wxpayApiv3Ready &&
    !!view?.wxpayCertReady;
  // 收款「实际生效」= 总开关已开 且 至少一个商户齐全(前端真正显示在线充值的条件)。
  const payLive = !!view?.payEnabled && (alipayReady || wxpayReady);

  return (
    <div className="mt-6">
      {migrationMessage && <p role="status" className="mb-4 rounded-lg border border-border bg-secondary/40 px-4 py-3 text-sm">{migrationMessage}</p>}
      {/* 统一大卡:左导航 + 右内容同框,竖线分隔,两列边框天然对齐 */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        {/* 左侧分栏导航(方案 A) */}
        <nav className="flex flex-row gap-1 overflow-x-auto border-b border-border bg-card p-2">
          {SECTIONS.filter(s=>!["users","artworks","ledger","credits","deploy"].includes(s.id)).map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={section === s.id ? 'page' : undefined}
                className={`flex flex-none items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors ${
                  section === s.id
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4 flex-none" />
                {s.label}
              </button>
            );
          })}
          <Link href={`/admin?${(() => { const params = new URLSearchParams(settingsQuery.toString()); params.set('view', 'settings'); params.set('tab', 'account-credits'); params.delete('section'); return params; })()}`} aria-current={requestedSection === 'account-credits' ? 'page' : undefined} className="flex flex-none items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium hover:bg-secondary">账号积分调整</Link>
          <Link href={`/admin?${(() => { const params = new URLSearchParams(settingsQuery.toString()); params.set('view', 'settings'); params.set('tab', 'legacy-deploy'); params.delete('section'); return params; })()}`} aria-current={requestedSection === 'legacy-deploy' ? 'page' : undefined} className="flex flex-none items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium hover:bg-secondary">旧部署与中转密钥</Link>
        </nav>

        {/* 内容区:一次只显示一个板块(浅灰底,白卡片落其上更清爽) */}
        <div className="min-w-0 flex-1 bg-secondary/30 p-5 sm:p-6">
      {msg && (
        <p
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            msg.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-600"
          }`}
        >
          {msg.text}
        </p>
      )}

      {section === "usage" && <AdminUsagePanel token={token} usageDays={usageDays} setUsageDays={setUsageDays} onManageUsers={()=>setSection("users")} />}

      {/* 模板管理 */}
      {section === "templates" && <AdminTemplates token={token} />}

      {section === "tryon" && <AdminTryon token={token} />}

      {/* 提示词配置 */}
      {section === "prompts" && <AdminPrompts />}

      {/* 管理员 · OpenAI 接口设置 */}
      {section === "api" && view?.modelConfigurationActive && (
        <div className="rounded-xl border border-c-border2 bg-c-card p-6">
          <h2 className="text-lg font-semibold">模型与供应商管理</h2>
          <p className="my-3 text-sm text-c-text3">接口、密钥、模型能力、默认用途与混合路由统一在模型配置中心维护。修改先保存为草稿，再核对差异发布。</p>
          <a href="/admin/bi/models" className="inline-block rounded-lg bg-primary px-4 py-2 text-sm text-white">进入模型配置中心</a>
          <div className="mt-6 space-y-3 border-t border-border pt-5">
            <h3 className="font-semibold">Replicate 商品抠图服务</h3>
            <p className="text-sm text-c-text3">独立的商品分割服务保留原配置；生成式图片模型与兜底通道在模型配置中心维护。当前 Token：{view.cutoutReplicateTokenMasked || "未配置"}。</p>
            <label className="block text-xs">Replicate 模型 slug
              <Input value={replicateModel} onChange={event => setReplicateModel(event.target.value)} placeholder="men1scus/birefnet" />
            </label>
            <label className="block text-xs">更新 Replicate API Token
              <Input type="password" value={replicateTokenInput} onChange={event => setReplicateTokenInput(event.target.value)} autoComplete="new-password" placeholder="提交前浏览器内 RSA 加密" />
            </label>
            <Button onClick={() => void saveReplicate()} disabled={busy || !replicateTokenInput.trim()}>加密保存 Replicate 配置</Button>
          </div>
        </div>
      )}
      {section === "api" && !view?.modelConfigurationActive && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 接口与模型</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>

        {/* 大陆服务器:模型接口地址配置帮助 */}
        <div className="mb-5 rounded-xl border border-c-border2 bg-c-subtle2 p-4 text-[13px] leading-relaxed">
          <p className="font-semibold text-c-text">
            🇨🇳 大陆服务器:生图报「无法连接 AI 服务」怎么办
          </p>
          <p className="mt-1.5 text-c-text3">
            大陆服务器直连不了 AI 模型,需要给模型配置一个可访问的接口地址才能生图。两种办法:
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-c-text3">
            <li>
              用一台海外服务器搭一个 OpenAI 兼容的接口,把地址填到运行环境变量{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                OPENAI_BASE_URL
              </code>
              (compose 里加这行后 <code className="rounded bg-black/5 px-1 dark:bg-white/10">docker compose up -d</code> 重启)。
            </li>
            <li>也可以使用已配置好的 OpenAI 兼容网关地址。</li>
          </ul>
          <p className="mt-1.5 text-c-text4">海外服务器一般直连即可,忽略本条。</p>
        </div>

        {/* AI 模型接口地址:后台直接填,加密存储,即时生效(免改 compose / 免重启) */}
        <div className="mb-5 space-y-2 rounded-2xl border border-border bg-card p-6 card-shadow">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-primary" />
            AI 模型接口地址
          </label>
          <p className="text-xs text-muted-foreground">
            大陆服务器把模型接口地址填这里,<b>保存后加密存储、即时生效(免改 compose、免重启)</b>。
            留空 = 直连(海外默认)。
            {baseUrlSet && (
              <>
                {" "}当前已配置:
                <code className="rounded bg-black/5 px-1 dark:bg-white/10">
                  {baseUrlMasked || "已设置"}
                </code>
                (出于安全不显示完整地址;重填即可覆盖)。
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={baseUrlSet ? "重新填写以更新" : "https://模型接口域名/v1"}
              className="min-w-[260px] flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !baseUrl.trim()}
              onClick={() => {
                if (hasSubtle()) {
                  void saveEncrypted(
                    "encryptedBaseUrl",
                    baseUrl,
                    "接口地址已保存(加密)",
                    () => setBaseUrl("")
                  );
                } else {
                  // HTTP 自托管:明文传输(本就无 TLS),服务端仍 AES 加密落库
                  void postSettings(
                    { baseUrlPlain: baseUrl.trim() },
                    "接口地址已保存(加密存储)",
                    () => setBaseUrl("")
                  );
                }
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
            {baseUrlSet && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (
                    !window.confirm(
                      "清除后将恢复直连(海外默认),大陆服务器会无法生图。确定清除?"
                    )
                  )
                    return;
                  void postSettings({ baseUrlClear: true }, "已清除,恢复直连");
                }}
              >
                清除
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 左:图像模型 + 对应 OpenAI Key + 充值入口 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-primary" />
              图像模型
            </div>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例如 gpt-image-2"
            />
            <div className="flex flex-wrap gap-2">
              {MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    model === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                前台可切换模型（逗号或换行分隔）
              </label>
              <Input
                value={imageModels}
                onChange={(e) => setImageModels(e.target.value)}
                placeholder="gpt-image-2, gpt-image-1.5, gpt-image-1"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save({ withKey: false })}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存图像模型
            </Button>

            {/* OpenAI API Key(图像模型对应的 key) */}
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-3 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              OpenAI API Key
            </div>
            <p className="text-sm text-muted-foreground">
              当前：
              <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                {view?.hasKey ? view.keyMasked : "未设置"}
              </code>
              <span className="ml-2 text-xs">
                来源：
                {view?.source === "db"
                  ? "后台"
                  : view?.source === "env"
                    ? "环境变量"
                    : "无"}
              </span>
            </p>
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="粘贴新的 sk-...（提交前浏览器内 RSA 加密）"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                浏览器内 RSA 加密传输 + 服务端 AES 加密存储，永不明文
              </p>
              <Button
                variant="gradient"
                size="sm"
                onClick={() => void save({ withKey: true })}
                disabled={busy || !keyInput.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新 Key
              </Button>
            </div>
            <a
              href={OPENAI_TOPUP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              前往 OpenAI 充值
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* 右:抠图模型(后端 / Replicate / 兜底)+ 对应 Token + 充值入口 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Scissors className="h-4 w-4 text-primary" />
              抠图模型
            </div>
            <p className="text-xs text-muted-foreground">
              「AI 抠图」与画布抠图的识别引擎。Replicate BiRefNet：发丝级边缘、像素级
              保真，适合商品主体；OpenAI gpt-image：备选引擎，风格化更强。默认推荐
              Replicate。
            </p>
            {/* 后端切换 */}
            <div className="flex flex-wrap gap-2">
              {[
                { id: "replicate" as const, label: "Replicate BiRefNet（推荐）" },
                { id: "openai" as const, label: "OpenAI gpt-image（备选）" },
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => setCutoutBackend(b.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    cutoutBackend === b.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* Replicate BiRefNet(第三方,后台可改 Token + 模型) */}
            <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span>Replicate BiRefNet</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                    view?.cutoutReplicateReady
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-amber-500/10 text-amber-600"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      view?.cutoutReplicateReady ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  {view?.cutoutReplicateReady
                    ? `已配置 · ${view.cutoutReplicateTokenMasked || "••••"}`
                    : "未配置 Token"}
                </span>
              </div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                模型 slug
              </label>
              <Input
                value={replicateModel}
                onChange={(e) => setReplicateModel(e.target.value)}
                placeholder="men1scus/birefnet"
              />
              <label className="block text-[11px] font-medium text-muted-foreground">
                API Token
              </label>
              <Input
                type="password"
                value={replicateTokenInput}
                onChange={(e) => setReplicateTokenInput(e.target.value)}
                placeholder="粘贴新的 r8_…（提交前浏览器内 RSA 加密）"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  RSA 加密传输 + AES 加密存储,永不明文、不回显
                </p>
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={() => void saveReplicate()}
                  disabled={busy || !replicateTokenInput.trim()}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  加密更新 Token
                </Button>
              </div>
            </div>

            {/* gpt-image 备用模型 */}
            <p className="text-xs font-medium text-muted-foreground">
              gpt-image 备用模型
            </p>
            <Input
              value={cutoutModel}
              onChange={(e) => setCutoutModel(e.target.value)}
              placeholder="例如 gpt-image-1"
            />
            <div className="flex flex-wrap gap-2">
              {["gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5", "gpt-image-2"].map(
                (m) => (
                  <button
                    key={m}
                    onClick={() => setCutoutModel(m)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      cutoutModel === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {m}
                  </button>
                )
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void save({ withKey: false })}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存抠图设置
            </Button>
            <a
              href={REPLICATE_TOPUP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              前往 Replicate 充值
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
      )}

      {/* 管理员 · 登录与支付 */}
      {section === "auth" && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 登录与支付</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          开源自部署时在此填入自己的微信公众号与收款凭证。所有敏感字段均「浏览器内 RSA
          加密传输 + 服务端 AES 加密存储」，永不明文、不回显；留空则自动回退环境变量配置。
        </p>

        {/* 多用户模式开关 */}
        <div className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-primary" />
            多用户模式
          </div>
          <p className="text-xs text-muted-foreground">
            开启后：访客可注册 / 登录（邮箱 + 密码），新用户获赠积分，生图按积分扣费，
            你可对外卖积分运营（和官方站一样）。关闭则为单用户自托管（仅你自己用、不计费）。
            开启前请先在下方配好收款（支付宝 / 微信），否则用户买不了积分。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              多用户开关：
            </span>
            {[
              { v: true, label: "开启" },
              { v: false, label: "关闭" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setMultiUserOn(o.v)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  multiUserOn === o.v
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {o.label}
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void postSettings(
                  { multiUserEnabled: multiUserOn },
                  "多用户开关已保存"
                )
              }
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存
            </Button>
          </div>
        </div>

        {/* 站长邮箱账号:让站长也能像官方站一样在登录框用邮箱+密码登录 */}
        <div className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" />
            站长邮箱账号
            <ReadyBadge ready={!!ownerEmail} className="ml-auto" />
          </div>
          <p className="text-xs text-muted-foreground">
            设置后,你可以直接在网站登录框用<b>邮箱 + 密码</b>登录(与官方站一致),
            自动拥有管理员权限;原「管理员密码」仍可用于 /admin 应急。
            你现有的积分、作品会整体迁移到该邮箱名下。
            {ownerEmail && (
              <>
                {" "}当前:<code className="rounded bg-black/5 px-1 dark:bg-white/10">{ownerEmail}</code>
              </>
            )}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              type="email"
              value={ownerEmailInput}
              onChange={(e) => setOwnerEmailInput(e.target.value)}
              placeholder={ownerEmail ? "改绑新邮箱" : "you@example.com"}
            />
            <Input
              type="password"
              autoComplete="new-password"
              value={ownerPwInput}
              onChange={(e) => setOwnerPwInput(e.target.value)}
              placeholder="登录密码(至少 6 位)"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !ownerEmailInput.trim() || ownerPwInput.length < 6}
            onClick={async () => {
              setBusy(true);
              setMsg(null);
              try {
                const res = await fetch("/api/admin/owner-account", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    email: ownerEmailInput.trim(),
                    password: ownerPwInput,
                  }),
                });
                const d = await res.json().catch(() => null);
                if (res.ok && d?.ok) {
                  setOwnerEmail(String(d.ownerEmail || ownerEmailInput.trim()));
                  setOwnerEmailInput("");
                  setOwnerPwInput("");
                  setMsg({
                    ok: true,
                    text: "站长邮箱账号已设置,现在可以用邮箱+密码从登录框登录了",
                  });
                } else {
                  setMsg({ ok: false, text: d?.error || "设置失败" });
                }
              } catch {
                setMsg({ ok: false, text: "网络错误,请重试" });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {ownerEmail ? "改绑并迁移数据" : "设置站长账号"}
          </Button>
        </div>

        {/* 邮件服务(SMTP,忘记密码用) */}
        <div className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-primary" />
            邮件服务（SMTP）
            <ReadyBadge ready={!!view?.smtpConfigured} className="ml-auto" />
          </div>
          <p className="text-xs text-muted-foreground">
            用于多用户「忘记密码」发送重置邮件。填你的 SMTP（企业邮箱 / 阿里云邮件推送等）。
            密码加密存储、不回显。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                SMTP 服务器
              </label>
              <Input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.exmail.qq.com"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                端口
              </label>
              <Input
                value={smtpPort}
                inputMode="numeric"
                onChange={(e) =>
                  setSmtpPort(e.target.value.replace(/[^0-9]/g, ""))
                }
                placeholder="465"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                账号（用户名）
              </label>
              <Input
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                placeholder="noreply@yourdomain.com"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground">
                密码 / 授权码
                {view?.smtpConfigured ? "（已保存，留空不改）" : ""}
              </label>
              <Input
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-muted-foreground">
                发件人（可选，默认用账号）
              </label>
              <Input
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder='"你的站点" <noreply@yourdomain.com>'
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                void postSettings(
                  {
                    smtpHost,
                    smtpPort: Number(smtpPort) || 465,
                    smtpUser,
                    smtpFrom,
                    smtpPass,
                  },
                  "邮件配置已保存",
                  () => setSmtpPass("")
                )
              }
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存邮件配置
            </Button>
            {/* 一键验证连通性:先保存再点这个,不用走完整「忘记密码」流程 */}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                const to = window.prompt(
                  "把测试邮件发到哪个邮箱?(先点「保存邮件配置」再测试)"
                );
                if (!to || !to.trim()) return;
                setBusy(true);
                try {
                  const res = await fetch("/api/admin/smtp-test", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ to: to.trim() }),
                  });
                  const d = await res.json().catch(() => null);
                  if (res.ok && d?.ok) {
                    setMsg({ ok: true, text: `测试邮件已发出,去 ${to.trim()} 收件箱(含垃圾箱)确认` });
                  } else {
                    setMsg({ ok: false, text: d?.error || "发送失败" });
                  }
                } catch {
                  setMsg({ ok: false, text: "网络错误,请重试" });
                } finally {
                  setBusy(false);
                }
              }}
            >
              发送测试邮件
            </Button>
          </div>
        </div>

        {/* 当前收款模式(只读说明) */}
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-none" />
          <span>当前：原生对接模式（填好下方商户即可直接收款）。</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 卡 1:微信登录 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                微信登录（公众号扫码）
              </span>
              <ReadyBadge ready={!!view?.wechatReady} />
            </div>
            <label className="block text-[11px] font-medium text-muted-foreground">
              AppID
            </label>
            <Input
              value={wechatAppid}
              onChange={(e) => setWechatAppid(e.target.value)}
              placeholder="wx 开头的公众号 AppID"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              Token（服务器配置里的令牌）
            </label>
            <Input
              value={wechatToken}
              onChange={(e) => setWechatToken(e.target.value)}
              placeholder="回调验签用的 Token"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              合成邮箱域名
            </label>
            <Input
              value={wechatEmailDomain}
              onChange={(e) => setWechatEmailDomain(e.target.value)}
              placeholder="wx.naumi.local"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveWechatLogin()}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存微信登录
            </Button>

            {/* AppSecret(加密) */}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                AppSecret
              </span>
              <span className="text-muted-foreground">
                当前：{view?.wechatReady ? view?.wechatSecretMasked || "••••" : "未设置"}
              </span>
            </div>
            <Input
              type="password"
              value={wechatSecretInput}
              onChange={(e) => setWechatSecretInput(e.target.value)}
              placeholder="粘贴新的 AppSecret（提交前浏览器内 RSA 加密）"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                RSA 加密传输 + AES 加密存储，永不明文、不回显
              </p>
              <Button
                variant="gradient"
                size="sm"
                onClick={() =>
                  void saveEncrypted(
                    "encryptedWechatSecret",
                    wechatSecretInput,
                    "微信 AppSecret 已加密更新",
                    () => setWechatSecretInput("")
                  )
                }
                disabled={busy || !wechatSecretInput.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新 Secret
              </Button>
            </div>
          </div>

          {/* 卡 2:收款总开关 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              收款总开关
              <ReadyBadge ready={payLive} className="ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground">
              控制前端是否显示「在线充值」（需同时已配置收款信息：支付宝或微信商户齐全）。
            </p>
            {/* 收款开关 */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                收款总开关：
              </span>
              {[
                { v: true, label: "开启" },
                { v: false, label: "关闭" },
              ].map((o) => (
                <button
                  key={o.label}
                  onClick={() => setPayEnabled(o.v)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    payEnabled === o.v
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {o.label}
                </button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void postSettings({ payEnabled }, "收款开关已保存")
                }
                disabled={busy}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                保存开关
              </Button>
            </div>
          </div>

          {/* 卡 3:支付宝商户 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              支付宝商户
              <ReadyBadge ready={alipayReady} className="ml-auto" />
            </div>
            <label className="block text-[11px] font-medium text-muted-foreground">
              AppID
            </label>
            <Input
              value={alipayAppid}
              onChange={(e) => setAlipayAppid(e.target.value)}
              placeholder="支付宝应用 AppID"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              支付宝公钥
            </label>
            <Input
              value={alipayPublicKey}
              onChange={(e) => setAlipayPublicKey(e.target.value)}
              placeholder="支付宝公钥（非敏感，可明文存）"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void postSettings(
                  { alipayAppid, alipayPublicKey },
                  "支付宝商户已保存"
                )
              }
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存支付宝商户
            </Button>

            {/* 应用私钥(加密) */}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                应用私钥
              </span>
              <span className="text-muted-foreground">
                当前：
                {view?.alipayPrivateKeyReady
                  ? view?.alipayPrivateKeyMasked || "••••"
                  : "未设置"}
              </span>
            </div>
            <textarea
              value={alipayPrivateKeyInput}
              onChange={(e) => setAlipayPrivateKeyInput(e.target.value)}
              placeholder="粘贴应用私钥（提交前浏览器内 RSA 加密）"
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-card p-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                RSA 加密传输 + AES 加密存储，永不明文、不回显
              </p>
              <Button
                variant="gradient"
                size="sm"
                onClick={() =>
                  void saveEncrypted(
                    "encryptedAlipayPrivateKey",
                    alipayPrivateKeyInput,
                    "支付宝应用私钥已加密更新",
                    () => setAlipayPrivateKeyInput("")
                  )
                }
                disabled={busy || !alipayPrivateKeyInput.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新私钥
              </Button>
            </div>

            {/* 排错:从已存私钥反推出的应用公钥,须与支付宝平台上传的「应用公钥」一致 */}
            {view?.alipayDerivedPublicKey && (
              <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="mb-1 text-[11px] font-semibold text-amber-700">
                  🔍 排错 · 你私钥对应的「应用公钥」
                </p>
                <p className="mb-2 text-[11px] leading-relaxed text-amber-700">
                  下面这串,必须和你上传到支付宝平台「接口加签方式 →
                  应用公钥」里的<b>一字不差</b>。不一致 =
                  验签出错的根因(私钥与平台上传的公钥不是一对)。点框内全选复制去对照。
                </p>
                <textarea
                  readOnly
                  value={view.alipayDerivedPublicKey}
                  rows={3}
                  onClick={(e) =>
                    (e.target as HTMLTextAreaElement).select()
                  }
                  className="w-full resize-y rounded-md border border-amber-300 bg-white p-2 font-mono text-[11px] text-amber-900 outline-none"
                />
              </div>
            )}
          </div>

          {/* 卡 4:微信支付商户 */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-primary" />
              微信支付商户
              <ReadyBadge ready={wxpayReady} className="ml-auto" />
            </div>
            <label className="block text-[11px] font-medium text-muted-foreground">
              商户号 mchid
            </label>
            <Input
              value={wxpayMchid}
              onChange={(e) => setWxpayMchid(e.target.value)}
              placeholder="微信支付商户号 mchid"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              绑定 AppID（公众号 / 小程序）
            </label>
            <Input
              value={wxpayAppid}
              onChange={(e) => setWxpayAppid(e.target.value)}
              placeholder="Native 下单绑定的 appid"
            />
            <label className="block text-[11px] font-medium text-muted-foreground">
              证书序列号
            </label>
            <Input
              value={wxpayCertSerial}
              onChange={(e) => setWxpayCertSerial(e.target.value)}
              placeholder="商户证书序列号 serial_no"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void postSettings(
                  { wxpayMchid, wxpayAppid, wxpayCertSerial },
                  "微信支付商户已保存"
                )
              }
              disabled={busy || !wxpayMchid.trim()}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存微信支付商户
            </Button>

            {/* APIv3 Key(加密) */}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                APIv3 Key
              </span>
              <span className="text-muted-foreground">
                当前：
                {view?.wxpayApiv3Ready ? view?.wxpayApiv3Masked || "••••" : "未设置"}
              </span>
            </div>
            <Input
              type="password"
              value={wxpayApiv3Input}
              onChange={(e) => setWxpayApiv3Input(e.target.value)}
              placeholder="粘贴 APIv3 Key（提交前浏览器内 RSA 加密）"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="gradient"
                size="sm"
                onClick={() =>
                  void saveEncrypted(
                    "encryptedWxpayApiv3",
                    wxpayApiv3Input,
                    "微信支付 APIv3 Key 已加密更新",
                    () => setWxpayApiv3Input("")
                  )
                }
                disabled={busy || !wxpayApiv3Input.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新 APIv3
              </Button>
            </div>

            {/* 商户 API 私钥 apiclient_key.pem(加密) */}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-3 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                商户 API 私钥(apiclient_key.pem)
              </span>
              <span className="text-muted-foreground">
                当前：
                {view?.wxpayCertReady ? view?.wxpayCertMasked || "••••" : "未设置"}
              </span>
            </div>
            <textarea
              value={wxpayCertInput}
              onChange={(e) => setWxpayCertInput(e.target.value)}
              placeholder="粘贴 apiclient_key.pem 全文（提交前浏览器内 RSA 加密）"
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-card p-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                RSA 加密传输 + AES 加密存储，永不明文、不回显
              </p>
              <Button
                variant="gradient"
                size="sm"
                onClick={() =>
                  void saveEncrypted(
                    "encryptedWxpayCert",
                    wxpayCertInput,
                    "微信支付商户证书已加密更新",
                    () => setWxpayCertInput("")
                  )
                }
                disabled={busy || !wxpayCertInput.trim()}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                加密更新证书
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* 管理员 · 品牌与站点(自定义站点名 / Logo,运行时 DB 覆盖,免重建镜像)。
          全部品牌设置统一开放。 */}
      {section === "brand" && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 品牌与站点</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          自定义站点名称与 Logo,留空则用默认。此处修改即时生效,无需重新部署。
        </p>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 站点名称(复用首启向导的 site_name) */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Palette className="h-4 w-4 text-primary" />
              站点名称
            </div>
            <p className="text-xs text-muted-foreground">
              显示在导航栏 Logo 旁与页脚版权。留空则回退默认。
            </p>
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="例如 Naumi"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveBrandName()}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存站点名称
            </Button>
          </div>

          {/* Logo 图片(上传 或 填 URL) */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="h-4 w-4 text-primary" />
              Logo 图片
            </div>
            <p className="text-xs text-muted-foreground">
              上传图片,或手填站内路径(如 /logo.png)/ 图床 URL。留空则回退默认 Logo。
            </p>
            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-3">
              <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                建议:<b>PNG(透明底)</b>或 WebP,横版 wordmark 高约 <b>80–128px</b>、
                宽 ≤ 400px;方形图标 <b>128×128</b> 起。文件 &lt; 2MB。上传会自动压到
                合适尺寸并保存(导航栏按高度约 32px 显示,建议 2 倍图更清晰)。
              </p>
              <label
                className={`inline-flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors ${
                  busy
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                上传图片
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg,image/svg+xml"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadBrandLogo(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <Input
              value={brandLogo}
              onChange={(e) => setBrandLogo(e.target.value)}
              placeholder="或手填:/logo.png 或 https://…/logo.png"
            />
            {brandLogo.trim() && (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <CachedImage
                  src={brandLogo.trim()}
                  alt="Logo 预览"
                  className="h-8 w-auto rounded-lg"
                />
                <span className="text-xs text-muted-foreground">预览</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void saveBrandLogo()}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              保存 Logo
            </Button>
          </div>
        </div>
      </div>
      )}

      {/* 管理员 · 站点页面(关于/联系/定价 自定义内容;可自定义) */}
      {section === "pages" && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 站点页面</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          自定义「关于我们 / 联系我们 / 定价」页面内容(纯文本,空一行分段)。
          留空则显示「内容建设中」。改动即时生效。
        </p>

        <div className="space-y-5">
          <div className="space-y-2 rounded-2xl border border-border bg-card p-6 card-shadow">
            <label className="text-sm font-semibold">关于我们</label>
            <Textarea
              rows={6}
              value={pageAbout}
              onChange={(e) => setPageAbout(e.target.value)}
              placeholder="介绍你的团队 / 公司 / 产品…"
            />
          </div>
          <div className="space-y-2 rounded-2xl border border-border bg-card p-6 card-shadow">
            <label className="text-sm font-semibold">联系我们</label>
            <Textarea
              rows={5}
              value={pageContact}
              onChange={(e) => setPageContact(e.target.value)}
              placeholder="邮箱 / 微信 / 电话 / 地址 / 工作时间…"
            />
          </div>
          <div className="space-y-2 rounded-2xl border border-border bg-card p-6 card-shadow">
            <label className="text-sm font-semibold">定价</label>
            <Textarea
              rows={5}
              value={pagePlans}
              onChange={(e) => setPagePlans(e.target.value)}
              placeholder="套餐 / 价格 / 权益说明…(留空则该页显示「内容建设中」)"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void saveSitePages()}
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            保存站点页面
          </Button>
        </div>
      </div>
      )}

      {/* 管理员 · 积分计费(开关 + 给邮箱加/减积分;单用户也可用) */}
      {section === "credits" && (
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">管理员 · 积分计费</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            仅管理员可见
          </span>
        </div>

        <div className="mb-5 rounded-2xl border bg-card p-6"><h2 className="text-sm font-semibold">计费与充值开关</h2><p className="mt-2 text-sm text-muted-foreground">统一管理功能价格、成本、计费开关、注册赠送及大额确认门槛。</p><Link href="/admin/billing" className="mt-3 inline-block text-sm text-primary underline">打开计费管理</Link></div>
        {/* 加/减积分 */}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6 card-shadow">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
            给账号加 / 减积分
          </div>
          <p className="text-xs text-muted-foreground">
            填邮箱和数值(正=加,负=减),永久有效不过期。给自己充就填自己的账号邮箱
            (单用户模式默认已预填站长账号邮箱)。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              placeholder="账号邮箱"
              className="min-w-[220px] flex-1"
            />
            <Input
              value={grantAmount}
              inputMode="numeric"
              onChange={(e) =>
                setGrantAmount(e.target.value.replace(/[^0-9-]/g, ""))
              }
              placeholder="100"
              className="w-24"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void grantCredits()}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              执行
            </Button>
          </div>
          {grantMsg && (
            <p className="text-[12.5px] font-medium text-c-text2">{grantMsg}</p>
          )}
        </div>
      </div>
      )}

      {/* 部署与授权 */}
      {section === "deploy" && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">部署与更新</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              仅管理员可见
            </span>
          </div>

          {/* 部署中心 */}
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Server className="h-4 w-4 text-primary" />
            部署中心
          </div>
          <DeployCenter embedded />

          {/* 授权管理(仅签发站显示;组件自带标题,买家实例整块自动隐藏) */}

          {/* 中转密钥管理(仅签发站 配置的签发站 + 配置了 relay 时显示;
              非签发站/未配置时 embedded 自动隐藏,不占位) */}
          <RelayTokensClient embedded />
        </div>
      )}

      {/* 兑换码 */}
      {section === "cardkeys" && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">兑换码</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              仅管理员可见
            </span>
          </div>
          <CardkeysAdmin embedded />
        </div>
      )}

        </div>
      </div>

    </div>
  );
}
