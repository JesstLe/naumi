import 'server-only';
import { NextResponse } from 'next/server';
import { biAuthorize, biJson } from '@/lib/bi/access';
import { enterpriseAuthorize } from '@/lib/enterprise/access';
import { TeamError } from "@/lib/teams/errors";
import type { TeamActor } from '@/lib/teams/grants';
import { tenantUsageQuery } from './tenant-usage-contracts';
import { enterpriseTenantUsage, platformTenantUsage } from './tenant-usage';

export async function tenantUsageRoute(request: Request, enterprise = false) {
  if (!enterprise && (process.env.FLEET_PORTAL_ONLY === '1' || process.env.NAUMI_AUTH_LOGIN_ONLY === '1')) return biJson({ error: '页面不存在' }, 404);
  const auth = enterprise ? await enterpriseAuthorize(request) : await biAuthorize(request);
  if (auth instanceof NextResponse) return auth;
  if (request.method !== 'GET') return biJson({ error: '请求方法无效' }, 405);
  const search = new URL(request.url).searchParams;
  const parsed = tenantUsageQuery.safeParse(Object.fromEntries(search));
  if (!parsed.success || [...search.keys()].some(key => search.getAll(key).length !== 1)) return biJson({ error: '用量筛选参数无效' }, 400);
  try {
    return biJson(enterprise ? await enterpriseTenantUsage(auth as TeamActor, parsed.data, request.signal) :
      await platformTenantUsage(parsed.data, undefined, request.signal));
  } catch (error) {
    if (request.signal.aborted) return biJson({ error: '查询已取消' }, 499);
    return error instanceof TeamError ? biJson({ error: error.message }, error.status) : biJson({ error: '企业用量暂不可用，请重试' }, 503);
  }
}
