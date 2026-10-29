import 'server-only';
import { NextResponse } from 'next/server';
import { bearer, emailFromToken } from '@/lib/supabase-admin';
import { activeNativeUserEmail } from '@/lib/native-auth';
import { supabaseEnabled } from '@/lib/auth-mode';
import { dbEnabled } from "@/platform/db/pool";
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/ip';
import { teamJson } from '@/lib/teams/access';
import {userFeaturePolicy} from "@/lib/feature-access/repository";
import { allows } from '@/lib/feature-access/catalog';
export async function enterpriseUserEmail(request:Request){return await emailFromToken(bearer(request))||(!supabaseEnabled?await activeNativeUserEmail(request):null);}
export async function enterpriseAuthorize(request:Request) {
  // This is the customer workspace. A coexisting platform cookie must never
  // widen its identity, tenant picker, mutations, or analytics permissions.
  const email=await enterpriseUserEmail(request);
  if(!email)return teamJson({error:'请先登录企业账号'},401);
  if(!dbEnabled)return teamJson({error:'数据库未配置'},503);
  if(!allows(await userFeaturePolicy(email,{site:false}),'team'))return teamJson({error:'企业管理功能尚未授权'},403);
  const actor={email,admin:false,consoleAdmin:false};
  if(!rateLimit(`enterprise:${actor.email}:${clientIp(request)}`,240,60_000))return teamJson({error:'操作过于频繁'},429);
  return actor;
}
