import "server-only";
import {getSettings} from "@/lib/settings/repository";
import { decryptAtRest } from "@/lib/settings";

/** Only server configuration selects the Router address; never a browser URL. */
const unavailable=()=>({status:"unavailable",attempts:[]});
async function readTrace(operationId:string,url:string,key:string,signal:AbortSignal) {
  try {
    const response = await fetch(
      `${url.replace(/\/$/, "")}/internal/operations/${encodeURIComponent(operationId)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        redirect: "error",
        signal,
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
    return unavailable();
  }
}

/** A single deadline covers the entire external phase, independent of the
 * number of attempts. Omitted lookups stay explicitly unavailable. */
export async function readRouterTraces(operationIds:readonly string[],requestSignal?:AbortSignal) {
  const results=new Map<string,Awaited<ReturnType<typeof readTrace>>>();
  const valid=[...new Set(operationIds)].filter(id=>{
    if(/^[A-Za-z0-9._:-]{8,160}$/.test(id))return true;
    results.set(id,{status:"invalid-id",attempts:[]});return false;
  });
  if(!valid.length)return results;
  const deadline=AbortSignal.timeout(5000);
  const signal=requestSignal?AbortSignal.any([requestSignal,deadline]):deadline;
  const keys:string[]=[];
  if(!process.env.NAUMI_BI_ROUTER_URL)keys.push("bi_router_url");
  if(!process.env.NAUMI_BI_ROUTER_TOKEN)keys.push("bi_router_key_enc");
  const settings:Record<string,string|null>=signal.aborted?{}:await getSettings(keys);
  const url=process.env.NAUMI_BI_ROUTER_URL||settings.bi_router_url||"";
  const key=process.env.NAUMI_BI_ROUTER_TOKEN||(settings.bi_router_key_enc?decryptAtRest(settings.bi_router_key_enc):"");
  const configured=Boolean(url&&key);
  for(const id of valid)results.set(id,signal.aborted||configured?unavailable():{status:"not-configured",attempts:[]});
  if(!url||!key)return results;
  for(let i=0;i<valid.length&&!signal.aborted;i+=4)
    await Promise.all(valid.slice(i,i+4).map(async id=>{results.set(id,await readTrace(id,url,key,signal));}));
  return results;
}
