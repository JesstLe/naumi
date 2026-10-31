import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { settingsSecret } from "../settings-secret";
import { ModelConfigError } from "./types";
import { resolveUserEmail } from "../admin-auth";

const lifetime = 15 * 60 * 1000;
const mac = (payload: string) => createHmac("sha256", settingsSecret()).update(`naumi-accepted-model-context-v1:${payload}`).digest("hex");
/** Server-to-server authorization for child operations of an already accepted Agent task. Never returned to a browser. */
export function signAcceptedModelContext(email: string, pair: { modelVersion: number; billingVersion: number }, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ actor: email.toLowerCase(), ...pair, expires: now + lifetime })).toString("base64url");
  return `${payload}.${mac(payload)}`;
}
export async function acceptedModelVersions(request: Request, authenticatedActor?:string|null): Promise<{ modelVersion: number; billingVersion: number } | null> {
  const raw = request.headers.get("x-naumi-accepted-model-context"); if (!raw) return null;
  const invalid = () => new ModelConfigError("INVALID_MODEL_CONTEXT", "任务版本凭证无效或已过期，请重新发起任务", 403);
  if (raw.length > 2048) throw invalid();
  const parts = raw.split(".");
  if (parts.length !== 2 || !/^[a-zA-Z0-9_-]+$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1]) || !timingSafeEqual(Buffer.from(parts[1], "hex"), Buffer.from(mac(parts[0]), "hex"))) throw invalid();
  let value: any; try { value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { throw invalid(); }
  if (!value || typeof value.actor !== "string" || !Number.isSafeInteger(value.modelVersion) || value.modelVersion < 1 || !Number.isSafeInteger(value.billingVersion) || value.billingVersion < 1 || !Number.isSafeInteger(value.expires) || value.expires < Date.now() || value.expires > Date.now() + lifetime) throw invalid();
  const actor = authenticatedActor===undefined?await resolveUserEmail(request):authenticatedActor; if (!actor || value.actor !== actor.toLowerCase()) throw invalid();
  return { modelVersion: value.modelVersion, billingVersion: value.billingVersion };
}
