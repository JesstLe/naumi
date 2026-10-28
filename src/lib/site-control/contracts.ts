import { z } from 'zod';
import { ALL_FEATURE_IDS, type AccessPolicy } from '@/lib/feature-access/catalog';

export const WORKSPACE_MODULES = [
  { id: 'dashboard', label: '工作台' },
  { id: 'requirements', label: '需求中心' },
  { id: 'tasks', label: '任务中心' },
  { id: 'schedule', label: '团队排期' },
  { id: 'assets', label: '素材与交付' },
  { id: 'performance', label: '贡献与绩效' },
  { id: 'notifications', label: '通知' },
  { id: 'people', label: '成员与团队' },
  { id: 'routing', label: '归属规则' },
] as const;
const unique = (values: string[]) => new Set(values).size === values.length;
export const sitePolicyInputSchema = z.object({
  enterpriseId: z.string().uuid(),
  sourceInstanceId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/),
  brand: z.string().trim().min(1).max(80),
  enabledFeatures: z.array(z.string().refine(id => ALL_FEATURE_IDS.includes(id))).max(100).refine(unique),
  workspaceModules: z.array(z.string().refine(id => WORKSPACE_MODULES.some(m => m.id === id))).max(9).refine(unique),
}).strict();
export const sitePolicySchema = sitePolicyInputSchema.extend({
  revision: z.number().int().min(1),
  updatedAt: z.string().datetime(),
}).strict();
export type SitePolicyInput = z.infer<typeof sitePolicyInputSchema>;
export type SitePolicy = z.infer<typeof sitePolicySchema>;
export type SiteProfile = { mode: 'platform' } | { mode: 'enterprise'; policy: SitePolicy };

/** Site availability can only narrow a person's grant, never grant a role. */
export function intersectSitePolicy(user: AccessPolicy, site: SitePolicy): AccessPolicy {
  return { ...user, mode: 'custom', allowed: site.enabledFeatures.filter(id => user.mode === 'default' || user.allowed.includes(id)) };
}
