"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {usePathname,useRouter,useSearchParams} from "next/navigation";
import {ShieldCheck,KeyRound,Users,ImageIcon,Server,Database,LayoutGrid,MessageSquare,Shirt,Palette,FileText,Ticket,Activity} from "lucide-react";
import {AdminUsagePanel} from "./usage/usage-panel";
import {AdminTemplates} from "./admin-templates";
import {AdminTryon} from "./admin-tryon";
import {AdminPrompts} from "./admin-prompts";
import {DeployCenter} from "@/components/operator/deploy-center";
import {RelayTokensClient} from "@/components/operator/relay-tokens-client";
import {CardkeysAdmin} from "@/components/operator/cardkeys-admin";
import {useSettingsSession} from "./settings/use-settings-session";
import {AdminApiSettings} from "./settings/api-panel";
import {AdminAuthSettings} from "./settings/auth-panel";
import {AdminSiteSettings} from "./settings/site-panel";
import {AdminCreditSettings} from "./settings/credits-panel";

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


export function AdminSettings({localAdmin=false}:{localAdmin?:boolean}){
const settingsQuery = useSearchParams(), settingsRouter = useRouter(), settingsPath = usePathname() ?? "";
const requestedSection = settingsQuery?.get('tab') || settingsQuery?.get('section') || 'api';
const canonicalSection = Object.hasOwn(SETTINGS_ALIASES, requestedSection) ? SETTINGS_ALIASES[requestedSection] : requestedSection;
const [migrationMessage, setMigrationMessage] = useState('');
  const [usageDays, setActiveUsageDays] = useState(30);
  useEffect(() => { const days = Number(settingsQuery?.get('days')); setActiveUsageDays([7, 30, 90, 365].includes(days) ? days : 30); }, [settingsQuery]);
  function setUsageDays(days: number) { setActiveUsageDays(days); const params = new URLSearchParams(settingsQuery?.toString()); params.set('days', String(days)); settingsRouter.replace(`${settingsPath}?${params}`, { scroll: false }); }
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
    const params = new URLSearchParams(settingsQuery?.toString()); params.set('view', 'settings'); params.set('tab', next); params.delete('section');
    if (email) params.set('email', email);
    settingsRouter.replace(`${settingsPath}?${params}`, { scroll: false });
  }
  useEffect(() => {
    const compatibility = requestedSection === 'account-credits' || requestedSection === 'legacy-deploy';
    const moved = !compatibility && Object.hasOwn(SETTINGS_MOVED, canonicalSection) ? SETTINGS_MOVED[canonicalSection] : undefined;
    if (moved) {
      const params = new URLSearchParams(settingsQuery?.toString()); params.delete('view'); params.delete('tab'); params.delete('section');
      if (moved.section) params.set('section', moved.section); if (moved.tab) params.set('tab', moved.tab);
      setMigrationMessage('正在打开此功能的新位置…');
      settingsRouter.replace(`${moved.path}${params.size ? `?${params}` : ''}`, { scroll: false }); return;
    }
    const available = SECTIONS.some(item => item.id === canonicalSection);
    setActiveSection(available ? canonicalSection as SettingsSection : 'api');
    setMigrationMessage(available ? '' : `旧标签“${requestedSection.slice(0, 80)}”没有对应设置，请选择下方分区。`);
  }, [canonicalSection, requestedSection, settingsQuery, settingsRouter]);

 const settings=useSettingsSession(localAdmin);
 if(!settings)return null;const {token,msg}=settings;
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
          <Link href={`/admin?${(() => { const params = new URLSearchParams(settingsQuery?.toString()); params.set('view', 'settings'); params.set('tab', 'account-credits'); params.delete('section'); return params; })()}`} aria-current={requestedSection === 'account-credits' ? 'page' : undefined} className="flex flex-none items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium hover:bg-secondary">账号积分调整</Link>
          <Link href={`/admin?${(() => { const params = new URLSearchParams(settingsQuery?.toString()); params.set('view', 'settings'); params.set('tab', 'legacy-deploy'); params.delete('section'); return params; })()}`} aria-current={requestedSection === 'legacy-deploy' ? 'page' : undefined} className="flex flex-none items-center whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium hover:bg-secondary">旧部署与中转密钥</Link>
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

      <AdminApiSettings key={settings.epoch+"-AdminApiSettings"} section={section} settings={settings}/>
      <AdminAuthSettings key={settings.epoch+"-AdminAuthSettings"} section={section} settings={settings}/>
      <AdminSiteSettings key={settings.epoch+"-AdminSiteSettings"} section={section} settings={settings}/>
      <AdminCreditSettings key={settings.epoch+"-AdminCreditSettings"} section={section} settings={settings} prefillEmail={requestedSection==='account-credits'?(settingsQuery?.get('email') ?? null):null}/>

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
