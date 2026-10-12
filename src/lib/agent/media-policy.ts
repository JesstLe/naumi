/** Browser-compatible: model text cannot initiate arbitrary network requests via media tags. */
export function agentMediaUrl(raw: string, origin?: string): string {
  if (!raw || /[\u0000-\u0020\\]/.test(raw) || raw.startsWith("//")) return "";
  try {
    const current = origin || (typeof window !== "undefined" ? window.location.origin : "http://agent.invalid");
    const url = new URL(raw, current);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) return "";
    const decoded = decodeURIComponent(url.pathname);
    if (/[\\\u0000]/.test(decoded) || decoded.split("/").includes("..")) return "";
    if (url.origin === current && /^\/(?:media|api\/media|uploads)\/[\w%./-]+$/.test(url.pathname) && !url.search) return raw;
    const publicBase = process.env.NEXT_PUBLIC_IMAGE_BASE_URL;
    if (publicBase) { const base = new URL(publicBase); if (url.origin === base.origin && url.pathname.startsWith(base.pathname.replace(/\/$/, "") + "/") && !url.search) return raw; }
  } catch { /* Invalid URLs remain plain text. */ }
  return "";
}
