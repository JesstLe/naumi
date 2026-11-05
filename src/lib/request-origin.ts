/**
 * Browser same-origin check for state-changing requests.
 *
 * Cross-site fetch metadata is rejected outright. A request without an Origin
 * header (server-to-server or legacy clients) is allowed, matching the
 * existing admin/billing/team behaviour. Next may build request.url with its
 * internal listening host, so the Host header (preserved by Nginx) and the
 * forwarded protocol identify the browser destination; an arbitrary forwarded
 * host is never accepted.
 */
export function isSameOriginRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin), target = new URL(request.url);
    const host = request.headers.get("host") || target.host;
    const protocol = request.headers.get("x-forwarded-proto") || target.protocol.replace(":", "");
    return source.host === host && source.protocol === `${protocol}:`;
  } catch {
    return false;
  }
}
