import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterpriseAuthorize } from '@/lib/enterprise/access';
import { enterpriseOverviewMeta, enterpriseProfileCommand, updateEnterpriseProfile } from '@/lib/saas/enterprise-overview';
import { teamJson, teamMutationOrigin } from '@/lib/teams/access';
import { TeamError } from "@/lib/teams/errors";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const failure = (error: unknown) => error instanceof TeamError ? teamJson({ error: error.message, code: `ENTERPRISE_${error.status}` }, error.status) : teamJson({ error: '企业资料暂不可读取，请使用原操作编号核对结果', code: 'ENTERPRISE_UNAVAILABLE', uncertain: true }, 503);
export async function GET(request: Request) {
  const actor = await enterpriseAuthorize(request); if (actor instanceof NextResponse) return actor;
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get('tenantId'));
  if (!id.success) return teamJson({ error: '企业参数无效' }, 400);
  try { return teamJson(await enterpriseOverviewMeta(actor, id.data)); } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  const actor = await enterpriseAuthorize(request); if (actor instanceof NextResponse) return actor;
  if (!teamMutationOrigin(request)) return teamJson({ error: '请求来源无效' }, 403);
  const parsed = enterpriseProfileCommand.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return teamJson({ error: '企业资料参数无效' }, 400);
  try { return teamJson(await updateEnterpriseProfile(actor, parsed.data)); } catch (error) { return failure(error); }
}
