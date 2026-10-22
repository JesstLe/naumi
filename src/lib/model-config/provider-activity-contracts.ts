export const activityErrorMessages = {
  NOT_RECORDED: '尚未记录调用审计', ACTIVITY_UNAVAILABLE: '调用审计暂不可用',
  ROW_LIMIT: '记录超过本次查询上限，统计未知', HEALTH_NOT_RECORDED: '尚未记录通道状态',
  HEALTH_UNAVAILABLE: '通道状态暂不可用', CONFIG_NOT_RECORDED: '发布通道配置未记录',
} as const;
export type ActivityErrorCode = keyof typeof activityErrorMessages;
export type AcceptanceWindow = { total: number; accepted: number; rejected: number; failed: number; unknown: number; processing: number };
export type ProviderActivity = {
  id: string; name: string; enabled: boolean; maxConcurrent: number; timeoutMs: number; routingModes: ('priority' | 'balanced')[] | null;
  stats: { h1: AcceptanceWindow | null; h24: AcceptanceWindow | null; errorCode: ActivityErrorCode | null };
  circuit: { configuredChannels: number | null; observedChannels: number | null; openChannels: number | null; recoveringChannels: number | null; unobservedChannels: number | null; errorCode: ActivityErrorCode | null };
};
export type ProviderActivityOverview = { providers: ProviderActivity[]; from: string; until: string; generatedAt: string; rowLimit: number };
