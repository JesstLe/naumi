import 'server-only';
import { biAuthorize, biJson } from '@/lib/bi/access';
import { ProviderBalanceFailure, providerBalanceOverview } from './provider-balance';
import type { ProviderBalanceOverview } from './provider-balance-contracts';

export function createProviderOpsHandler(deps: { authorize: typeof biAuthorize; overview: (refresh: boolean) => Promise<ProviderBalanceOverview> }) {
  return async (request: Request) => {
    if (process.env.FLEET_PORTAL_ONLY === '1' || process.env.NAUMI_AUTH_LOGIN_ONLY === '1') return biJson({ error: '页面不存在', code: 'PLATFORM_ACCESS_REQUIRED' }, 404);
    const auth = await deps.authorize(request); if (auth instanceof Response) return auth;
    if (request.method !== 'GET') return biJson({ error: '请求方法无效', code: 'METHOD_NOT_ALLOWED' }, 405);
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => key !== 'refresh') || query.has('refresh') && !['0', '1'].includes(query.get('refresh')!)) return biJson({ error: '查询参数无效', code: 'INVALID_QUERY' }, 400);
    try { return biJson(await deps.overview(query.get('refresh') === '1')); }
    catch (error) {
      const code = error instanceof ProviderBalanceFailure ? error.code : 'PROVIDER_OPS_UNAVAILABLE';
      return biJson({ error: code === 'CONFIG_CHANGED' ? '发布配置已变化，请重新读取' : '供应商账户数据暂不可用', code }, code === 'CONFIG_CHANGED' ? 409 : 503);
    }
  };
}
export const providerOpsHandler = createProviderOpsHandler({ authorize: biAuthorize, overview: providerBalanceOverview });
