import 'server-only';
import { NextResponse } from 'next/server';
import { requireAdmin, resolveUserEmail } from '@/lib/admin-auth';
import { dbEnabled } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/ip';
import { teamJson } from '@/lib/teams/access';
import { userFeaturePolicy } from '@/lib/feature-access/server';
import { allows } from '@/lib/feature-access/catalog';
export async function enterpriseAuthorize(request:Request) {
  const admin=await requireAdmin(request),email=await resolveUserEmail(request);
  if(!email&&!admin)return teamJson({error:'请先登录'},401);
  if(!dbEnabled)return teamJson({error:'数据库未配置'},503);
  if(!admin&&!allows(await userFeaturePolicy(email!),'team'))return teamJson({error:'企业管理功能尚未授权'},403);
  const actor={email:email||'local-admin',admin,consoleAdmin:admin};
  if(!rateLimit(`enterprise:${actor.email}:${clientIp(request)}`,240,60_000))return teamJson({error:'操作过于频繁'},429);
  return actor;
}
