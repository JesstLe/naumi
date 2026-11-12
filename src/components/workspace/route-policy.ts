/** Presentation only. Page authorization remains owned by AppShell/feature-access. */
export function workspacePresentation(path: string): "excluded" | "creation" | "auth" | "page" | "immersive" {
  if (["/canvas", "/batchshot/native", "/admin", "/desktop", "/enterprise", "/brand-orb", "/setup"].some(root => path === root || path.startsWith(root + "/"))) return "excluded";
  if (["/", "/dashboard", "/agent"].includes(path)) return "creation";
  if (["/sign-in", "/sign-up", "/reset"].includes(path)) return "auth";
  if (["/studio3d", "/genchat"].includes(path)) return "immersive";
  return "page";
}

export function workspaceActiveSection(path: string): string {
  if (path === "/templates" || path.startsWith("/templates/")) return "/templates";
  if (path === "/works") return "/works";
  if (path.startsWith("/batchshot")) return "/batchshot";
  if (path === "/video") return "/video";
  if (["/", "/dashboard", "/agent"].includes(path)) return "/";
  if (["/account", "/team", "/contact", "/guides", "/plans", "/checkout", "/terms", "/privacy", "/about", "/licenses", "/access-denied"].some(root => path === root || path.startsWith(root + "/"))) return "";
  return "/tools";
}
