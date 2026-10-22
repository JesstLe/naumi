/** Only allow return destinations inside existing admin pages. */
export function adminDestination(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/admin") || raw.includes("\\")) return "/admin/center";
  try {
    const url = new URL(raw, "http://internal");
    if (url.origin !== "http://internal" || !["/admin/deployments", "/admin/feature-access", "/admin", "/admin/model-health", "/admin/model-management", "/admin/model-management/library", "/admin/mvp", "/admin/mvp/library", "/admin/center", "/admin/bi", "/admin/bi/models", "/admin/billing", "/admin/billing/price-table", "/admin/pricing", "/admin/tenants", "/admin/creations"].includes(url.pathname)&&!/^\/admin\/tenants\/[a-f0-9-]{36}$/i.test(url.pathname)&&!/^\/admin\/creations\/cr-[a-f0-9-]{36}$/i.test(url.pathname)) return "/admin/center";
    if (url.pathname === "/admin" && url.searchParams.get("view") !== "settings") return "/admin/center";
    return url.pathname.replace(/^\/admin\/mvp(?=\/|$)/, "/admin/model-management") + url.search;
  } catch { return "/admin/center"; }
}
