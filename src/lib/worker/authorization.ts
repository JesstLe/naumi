import "server-only";
import {timingSafeEqual} from "node:crypto";
import {workerSecret} from "../settings-secret";

export function imageWorkerAuthorized(request: Request): boolean {
  let configured: string;
  try { configured=workerSecret(); } catch { return false; }
  const supplied = request.headers.get("x-video-worker-secret") || "";
  const a=Buffer.from(configured), b=Buffer.from(supplied);
  return configured.length >= 32 && a.length === b.length && timingSafeEqual(a,b);
}
