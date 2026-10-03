import "server-only";

/** Hosting identity only affects publisher copy; it never gates product features. */
export const officialSite = process.env.NAUMI_OFFICIAL_SITE === "1";

// Legacy license issuance endpoints retain their original host and admin checks.
export function isLicenseIssuerHost(hostRaw: string | null | undefined): boolean {
  const flag = (process.env.LICENSE_ISSUER || "").trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  let serverHost = "ai.starzeco.com";
  try {
    serverHost = new URL(
      process.env.LICENSE_SERVER_URL || "https://ai.starzeco.com"
    ).host.toLowerCase();
  } catch {
    /* 用默认 */
  }
  const reqHost = (hostRaw || "").toLowerCase().trim();
  if (!reqHost) return false;
  return reqHost === serverHost;
}

export function isLicenseIssuer(request?: Request): boolean {
  return isLicenseIssuerHost(request?.headers.get("host"));
}
