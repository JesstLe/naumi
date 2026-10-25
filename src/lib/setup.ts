import "server-only";
import {getSetting,setSetting} from "@/lib/settings/repository";
import {dbEnabled} from "@/platform/db/pool";
import { getOpenAISettings, saveOpenAIKey } from "@/lib/settings";

// Initial configuration is a one-time operation, locked by an API key or admin password.
// Product features do not require an edition or license.
/** 站点名称(为后续白标铺路,先存着)。 */
export const SITE_NAME_SETTING = "site_name";

/** Database failures conservatively retain the setup lock. */
export async function isConfigured(): Promise<boolean> {
  try {
    const s = await getOpenAISettings();
    return !!s.apiKey || !!(await getSetting("admin_password_hash"));
  } catch {
    // 读设置失败 → 保守当作「已配置」,宁可不显示向导也不打扰正常实例。
    return true;
  }
}

/** 读向导填写的站点名称(DB);无则空串。 */
export async function getSiteName(): Promise<string> {
  if (!dbEnabled) return "";
  try {
    return (await getSetting(SITE_NAME_SETTING))?.trim() || "";
  } catch {
    return "";
  }
}

export type SetupInput = {
  /** 必填:OpenAI API Key(明文,经 TLS 传输;落库走 settings.ts 的 AES 加密)。 */
  apiKey: string;
  /** 选填:站点名称(白标铺路)。 */
  siteName?: string;
  /** 选填:管理员密码(自托管无 Supabase 时的后台入口;scrypt 哈希落库)。 */
  adminPassword?: string;
  /** 选填:管理员邮箱 —— 同密码一起建「站长邮箱账号」(role=admin),
   * 站长即可像官方站一样在普通登录框用邮箱+密码登录。 */
  adminEmail?: string;
};

export type SetupResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * 落库首启配置。**仅「未配置」时可写,写完即锁**(已配置 → 返回 403,自锁)。
 * 首启还没管理员,本函数供无需登录的 /api/setup 调用,靠 isConfigured() 自锁防滥用。
 */
export async function applySetup(input: SetupInput): Promise<SetupResult> {
  if (!dbEnabled) {
    return { ok: false, status: 503, error: "未配置数据库,无法保存设置" };
  }
  // 自锁:已配置的实例(含官方云)一律拒绝,防配置完成后被再次调用覆盖。
  if (await isConfigured()) {
    return { ok: false, status: 403, error: "本实例已完成配置" };
  }

  const apiKey = (input.apiKey ?? "").trim();
  if (!apiKey || apiKey.length < 8) {
    return { ok: false, status: 400, error: "请填写有效的 OpenAI API Key" };
  }

  // 1) OpenAI Key —— 和后台设置同一个 key,AES 加密落库(复用 settings.ts)。
  await saveOpenAIKey(apiKey);

  // 3) 站点名称(选填)—— 落库,为白标铺路。
  const siteName = (input.siteName ?? "").trim();
  if (siteName) {
    await setSetting(SITE_NAME_SETTING, siteName.slice(0, 80));
  }

  // 4) 管理员密码(选填但强烈建议)—— 自托管无 Supabase 时的后台入口。
  //    scrypt 哈希落库(动态 import 避免与 db/crypto 的加载顺序耦合)。
  const adminPassword = (input.adminPassword ?? "").trim();
  if (adminPassword) {
    const { setAdminPassword } = await import("@/lib/admin-auth");
    await setAdminPassword(adminPassword);
  }

  // 5) 管理员邮箱(选填)—— 建「站长邮箱账号」(role=admin,密码同管理员密码),
  //    站长即可像官方站一样在普通登录框用邮箱+密码登录;/admin 密码入口仍保留兜底。
  const adminEmail = (input.adminEmail ?? "").trim().toLowerCase();
  if (adminEmail && adminPassword && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    try {
      const {getOrCreateUser} = await import("@/lib/accounts/session");
const {setUserPassword, setUserRole} = await import("@/lib/accounts/repository");
      const { hashPassword } = await import("@/lib/pw");
      await getOrCreateUser(adminEmail, "站长");
      await setUserPassword(adminEmail, hashPassword(adminPassword));
      await setUserRole(adminEmail, "admin");
    } catch {
      /* 建号失败不阻断首启(密码入口仍可用,后台可再绑定) */
    }
  }

  // Setup is the explicit configuration write boundary. Do not let an earlier
  // empty boot freeze an empty registry or make the first catalog read import.
  if(process.env.NAUMI_ROUTER_MANAGEMENT_URL)await(await import("./model-config/startup")).prepareModelRegistry();
  return { ok: true };
}
