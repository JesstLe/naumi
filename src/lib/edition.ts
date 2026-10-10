import "server-only";

/** Hosting identity only affects publisher copy; it never gates product features. */
export const officialSite = process.env.NAUMI_OFFICIAL_SITE === "1";

// Issuance requires an explicit flag or an explicitly configured server host.
export function isLicenseIssuerHost(hostRaw: string | null | undefined): boolean {
  const flag = (process.env.LICENSE_ISSUER || "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  let serverHost: string;
  try {
    const url = new URL((process.env.LICENSE_SERVER_URL || "").trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    serverHost = url.host.toLowerCase();
  } catch {
    return false;
  }
  const reqHost = (hostRaw || "").toLowerCase().trim();
  if (!reqHost) return false;
  return reqHost === serverHost;
}

export function isLicenseIssuer(request?: Request): boolean {
  return isLicenseIssuerHost(request?.headers.get("host"));
}
