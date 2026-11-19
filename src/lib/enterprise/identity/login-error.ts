/** Presentation only. Subject, organization and product grants remain owned by OIDC. */
export type LoginErrorCode =
  | "product_access_required"
  | "login_expired"
  | "account_changed"
  | "service_unavailable";

const messages = {
  product_access_required: [403, "当前账号尚未开通企业协作", "请联系企业管理员分配产品权限，或使用已开通的账号登录。"],
  login_expired: [400, "登录请求已过期", "请返回登录页重新发起登录。"],
  account_changed: [409, "登录账号已变化", "请返回登录页，使用同一个账号重新登录。"],
  service_unavailable: [503, "登录服务暂时不可用", "请稍后重新登录。"],
} as const;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

/** Only a configured, validated client callback can supply a product return origin. */
export function loginReturnUrl(redirectUri?: string): string {
  if (!redirectUri) return "/";
  try {
    const url = new URL(redirectUri);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "127.0.0.1")) ||
        url.username || url.password || url.search || url.hash ||
        url.pathname !== "/api/auth/central/callback") return "/";
    return new URL("/login", url.origin).href;
  } catch {
    return "/";
  }
}

export function loginErrorResponse(code: LoginErrorCode, configuredRedirectUri?: string) {
  const [status, title, message] = messages[code];
  const href = escapeHtml(loginReturnUrl(configuredRedirectUri));
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
    html: `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Naumi</title><style>html{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f5f7fb;color:#172033;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}main{width:min(100%,460px);padding:36px;background:white;border:1px solid #e5e9f1;border-radius:20px;box-shadow:0 12px 40px #17203308}h1{margin:0 0 12px;font-size:23px;line-height:1.4}p{margin:0 0 28px;color:#566176}a{display:inline-flex;padding:10px 20px;border-radius:10px;background:#315ce6;color:white;text-decoration:none;font-weight:600}a:focus-visible{outline:3px solid #9cb1ff;outline-offset:4px}</style></head><body><main><h1>${title}</h1><p>${message}</p><a href="${href}">返回登录页</a></main></body></html>`,
  };
}
