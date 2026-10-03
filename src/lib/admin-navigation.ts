/** Only allow return destinations inside existing admin pages. */
export function adminDestination(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/admin") || raw.includes("\\")) return "/admin/center";
  try {
    const url = new URL(raw, "http://internal");
    if (url.origin !== "http://internal" || !["/admin", "/admin/center", "/admin/bi", "/admin/billing", "/admin/pricing"].includes(url.pathname)) return "/admin/center";
    if (url.pathname === "/admin" && url.searchParams.get("view") !== "settings") return "/admin/center";
    return url.pathname + url.search;
  } catch { return "/admin/center"; }
}
