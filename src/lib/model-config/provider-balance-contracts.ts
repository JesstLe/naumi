import { z } from 'zod';
import type { ProviderActivityOverview } from './provider-activity-contracts';

export const balanceErrorMessages = {
  UNSUPPORTED: '暂未确认只读查询接口', CREDENTIAL_UNAVAILABLE: '当前发布凭据不可用',
  AUTH_FAILED: '上游未授权此凭据查询账户', RATE_LIMITED: '上游限制查询频率',
  UPSTREAM_UNAVAILABLE: '上游账户查询暂不可用', MALFORMED_RESPONSE: '上游账户字段尚未确认',
  NETWORK_ERROR: '账户查询连接失败', TIMEOUT: '账户查询超时',
  PROVIDER_OPS_UNAVAILABLE: '供应商账户数据暂不可用', CONFIG_CHANGED: '发布配置已变化，请重新读取',
} as const;
export type BalanceErrorCode = keyof typeof balanceErrorMessages;
export const balanceMeasurementSchema = z.object({
  kind: z.enum(['api_key_quota', 'account_balance']),
  remaining: z.number().finite().nullable(), used: z.number().finite().nullable(), total: z.number().finite().nullable(),
  unlimited: z.boolean().nullable(),
  unit: z.object({ kind: z.enum(['currency', 'credits', 'quota']), code: z.string().min(1).max(30), label: z.string().min(1).max(40) }).strict().nullable(),
}).strict();
export type BalanceMeasurement = z.infer<typeof balanceMeasurementSchema>;
export type ProviderBalanceProbe = {
  status: 'ok' | 'unsupported' | 'error'; measurement: BalanceMeasurement | null;
  errorCode: BalanceErrorCode | null; checkedAt: string | null; attemptedAt: string | null;
};
export type ProviderAccountBalance = ProviderBalanceProbe & {
  accountId: string; accountLabel: string; identity: 'published_credential';
  providers: { id: string; name: string; enabled: boolean }[];
  credentialAvailable: boolean;
  source: { label: string; documentationUrl: string | null; revision: string } | null;
  cache: { state: 'hit' | 'fresh' | 'none'; expiresAt: string | null; persisted: boolean; refreshLimited: boolean };
  lastKnown: { measurement: BalanceMeasurement; checkedAt: string } | null;
};
export type ProviderBalanceOverview = { accounts: ProviderAccountBalance[]; configVersion: number; generatedAt: string; cacheTtlSeconds: number; activity?: ProviderActivityOverview };
