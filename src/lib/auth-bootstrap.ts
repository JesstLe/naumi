import { withBrowserReadDeadline } from './browser-read-deadline';

// Authentication discovery is a READ. Failure is not an anonymous session or a
// local deployment, and this helper never retries or changes stored identity.
export const AUTH_BOOTSTRAP_READ_TIMEOUT_MS = 15_000;
export type BootstrapConfig = { db: boolean; multiUser: boolean; authMode: 'mock' | 'supabase' };
export class AuthBootstrapReadError extends Error {
  constructor(readonly status: number) { super('账号服务暂时不可用'); }
}

export async function readAuthBootstrapJson(
  url: string,
  options: { signal: AbortSignal; headers?: () => Promise<Record<string, string>> },
): Promise<unknown> {
  return withBrowserReadDeadline(async signal => {
    const headers = options.headers ? await options.headers() : undefined;
    signal.throwIfAborted();
    const response = await fetch(url, { cache: 'no-store', headers, signal });
    if (!response.ok || response.status !== 200) throw new AuthBootstrapReadError(response.status);
    const data: unknown = await response.json();
    signal.throwIfAborted();
    return data;
  }, { timeoutMs: AUTH_BOOTSTRAP_READ_TIMEOUT_MS, signal: options.signal });
}

export function bootstrapConfig(value: unknown): BootstrapConfig {
  if (!value || typeof value !== 'object') throw new Error('账号配置读取失败');
  const cfg = value as Partial<BootstrapConfig>;
  if (typeof cfg.db !== 'boolean' || typeof cfg.multiUser !== 'boolean' ||
      !['mock', 'supabase'].includes(String(cfg.authMode)) || cfg.multiUser && !cfg.db) {
    throw new Error('账号配置读取失败');
  }
  return cfg as BootstrapConfig;
}

export function bootstrapSessionUser(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'user')) throw new Error('账号会话读取失败');
  const user = (value as { user: unknown }).user;
  if (user === null) return null;
  if (!user || typeof user !== 'object' || typeof (user as { email?: unknown }).email !== 'string' ||
      !(user as { email: string }).email.trim()) throw new Error('账号会话读取失败');
  return user as Record<string, unknown>;
}
