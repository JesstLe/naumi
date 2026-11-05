import "server-only";
import { requireAdmin, resolveUserEmail } from "@/lib/admin-auth";

/** 当前请求的真实登录邮箱。写接口必须使用它，不能信任客户端提交的 email。 */
export async function authenticatedEmail(request: Request, authenticatedActor?: string | null): Promise<string | null> {
  // Undefined retains unresolved/no-DB ingress; null is already-known anonymous.
  const email = authenticatedActor === undefined ? await resolveUserEmail(request) : authenticatedActor;
  return email?.trim().toLowerCase() || null;
}

/**
 * 将查询目标绑定到真实登录态。默认只允许本人；管理员只读查看时可显式放行。
 */
export async function authorizedTargetEmail(
  request: Request,
  requested: string | null | undefined,
  allowAdmin = false,
  authenticatedActor?: string | null
): Promise<string | null> {
  const actor = await authenticatedEmail(request, authenticatedActor);
  if (!actor) return null;
  const target = (requested ?? "").trim().toLowerCase();
  if (!target || target === actor) return actor;
  if (allowAdmin && (await requireAdmin(request))) return target;
  return null;
}
