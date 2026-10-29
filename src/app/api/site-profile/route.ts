import { siteProfile } from '@/lib/site-control/store';
import { accessJson } from '@/lib/feature-access/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return accessJson(await siteProfile()); }
  catch { return accessJson({ error: '站点配置暂时不可用' }, 503); }
}
