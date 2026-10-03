import "server-only";
import { getSetting } from "@/lib/db";
import { decryptAtRest } from "@/lib/settings";

/** Only server configuration selects the Router address; never a browser URL. */
export async function readRouterTrace(operationId: string) {
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(operationId))
    return { status: "invalid-id", attempts: [] };
  const url =
    process.env.NAUMI_BI_ROUTER_URL ||
    (await getSetting("bi_router_url")) ||
    "";
  const encrypted = await getSetting("bi_router_key_enc");
  const key =
    process.env.NAUMI_BI_ROUTER_TOKEN ||
    (encrypted ? decryptAtRest(encrypted) : "");
  if (!url || !key) return { status: "not-configured", attempts: [] };
  try {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/internal/operations/${encodeURIComponent(operationId)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!response.ok)
      return {
        status: response.status === 404 ? "not-recorded" : "unavailable",
        attempts: [],
      };
    const data = (await response.json()) as {
      state?: string;
      attempts?: {
        state?: string;
        duration_ms?: number;
        route?: { provider?: string; upstream_model?: string; id?: string };
      }[];
    };
    // Router records include identity tokens, request fingerprints and provider
    // receipts. These never cross the browser boundary.
    return {
      status: String(data.state || "unknown").slice(0, 50),
      attempts: (Array.isArray(data.attempts) ? data.attempts : [])
        .slice(0, 20)
        .map((a) => ({
          state: String(a.state || "").slice(0, 50),
          model: String(a.route?.upstream_model || "").slice(0, 200),
          provider: String(a.route?.provider || "").slice(0, 100),
          route: String(a.route?.id || "").slice(0, 100),
          durationMs: typeof a.duration_ms === "number" ? a.duration_ms : null,
        })),
    };
  } catch {
    return { status: "unavailable", attempts: [] };
  }
}
