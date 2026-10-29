import "server-only";
import {dbEnabled} from "@/platform/db/pool";
import {requireAdmin,resolveUserEmail} from "@/lib/admin-auth";
import {DEFAULT_POLICY,allows,meets,requestRequirement,TOOL_ACCESS} from "./catalog";
import {FeatureAccessError,userFeaturePolicy} from "./repository";
export {FeatureAccessError,ensureFeatureAccessSchema,policyFromRow,userFeaturePolicy,featureAccessUsers,validatePolicyCommand,saveFeaturePolicy} from "./repository";
export type {PolicyCommand} from "./repository";

export async function requestFeaturePolicy(request: Request,options:{site?:boolean}={}) {
  const email = await resolveUserEmail(request);
  const admin = await requireAdmin(request);
  if (admin) return { email, admin: true, policy: { ...DEFAULT_POLICY } };
  return { email, admin: false, policy: email ? await userFeaturePolicy(email,options) : null };
}
export async function featureRequestGate(request: Request): Promise<Response | null> {
  const url = new URL(request.url), requirement = requestRequirement(url.pathname, request.method);
  if (!requirement || !dbEnabled) return null;
  const path=url.pathname.startsWith('/desktop/api/')?url.pathname.slice('/desktop'.length):url.pathname;
  const management=(path==='/api/enterprise'||path.startsWith('/api/enterprise/'))&&!path.startsWith('/api/enterprise/workflow');
  const receiptAware=['/api/imagegen','/api/generate-image','/api/imagegen/cancel','/api/canvas/image-versions'].includes(path)
    || /^\/api\/imagegen\/batches\/[^/]+(?:\/download)?$/.test(path)||/^\/api\/canvas\/timeline-nodes\/[^/]+\/render$/.test(path);
  const enforceSite=!management&&!receiptAware&&(request.method!=='GET'&&request.method!=='HEAD'||!path.startsWith('/api/'));
  const { email, admin, policy } = await requestFeaturePolicy(request,{site:enforceSite});
  if (admin) return null;
  const canonicalPath = url.pathname.startsWith("/desktop/api/") ? url.pathname.slice("/desktop".length) : url.pathname;
  const api = canonicalPath.startsWith("/api/");
  // Public previews remain public. Existing APIs still enforce their authentication.
  if (!email) return api && !["templates", "tpl-image"].includes(canonicalPath.split("/")[2]) ? accessJson({ error: "请先登录" }, 401) : null;
  return policy && meets(policy, requirement) ? null : accessJson({ error: "此功能尚未授权", code: "FEATURE_DENIED" }, 403);
}
export const ACCESS_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" };
export function accessJson(data: unknown, status = 200) { return Response.json(data, { status, headers: ACCESS_HEADERS }); }
export async function assertAgentToolAccess(email: string, name: string, entry: "canvas" | "workbench" = "workbench", request?: Request) {
  const id = TOOL_ACCESS[name];
  if (!id) throw new FeatureAccessError("工具尚未授权");
  if (!dbEnabled) return;
  if (request) {
    if ((await resolveUserEmail(request))?.toLowerCase() !== email.toLowerCase()) throw new FeatureAccessError("登录状态已失效", 401);
    if (await requireAdmin(request)) return;
  }
  const policy = await userFeaturePolicy(email);
  if (!allows(policy, "agent") || (entry === "canvas" && !allows(policy, "canvas")) || !allows(policy, id)) throw new FeatureAccessError("此功能尚未授权");
}
