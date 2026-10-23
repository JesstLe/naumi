import { z } from 'zod';
import { tenantQuerySchema } from './tenant-contracts';

export const tenantUsageQuery = z.object({
  tenantId: z.string().uuid(), from: z.string().optional(), to: z.string().optional(),
}).strict().superRefine((value, ctx) => {
  const result = tenantQuerySchema.safeParse({ from: value.from, to: value.to });
  if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
});
export type TenantUsageQuery = z.infer<typeof tenantUsageQuery>;
export type TenantUsage = {
  tenantId: string; scope: 'tenant' | 'current_subordinates';
  fundingModel: 'platform_shared'; billingModel: 'member_accounts';
  period: { from: string; to: string }; generatedAt: string;
  availability: 'available' | 'not_recorded';
  creations: number | null; chargedCredits: number | null; reservedCredits: number | null;
  settledOperations: number | null; pendingOperations: number | null; unrecordedCreations: number | null;
};
