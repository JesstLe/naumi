import { z } from 'zod';
import type { DeploymentPolicy } from './contracts';

export class IntegrationError extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
const schema = z.strictObject({ mode: z.enum(['shared','dedicated']), sourceInstanceId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,79}$/),
  allowedEnterpriseIds: z.array(z.string().uuid()).max(100) }).superRefine((p,c)=>{
  if(p.mode==='dedicated'&&p.allowedEnterpriseIds.length!==1)c.addIssue({code:'custom',message:'Dedicated deployment requires exactly one pinned enterprise'});
  if(new Set(p.allowedEnterpriseIds).size!==p.allowedEnterpriseIds.length)c.addIssue({code:'custom',message:'Duplicate enterprise binding'});
});
export function deploymentPolicy(env: Record<string,string|undefined> = process.env): DeploymentPolicy {
  const parsed = schema.safeParse({ mode: env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE ?? 'shared',
    sourceInstanceId: env.NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID,
    allowedEnterpriseIds: (env.NAUMI_ENTERPRISE_ALLOWED_IDS ?? '').split(',').map(s=>s.trim()).filter(Boolean) });
  if(!parsed.success)throw new IntegrationError('ENTERPRISE_INTEGRATION_NOT_CONFIGURED');
  return parsed.data;
}
export function assertEnterpriseAllowed(policy:DeploymentPolicy,id:string) {
  if(!z.string().uuid().safeParse(id).success)throw new IntegrationError('INVALID_ENTERPRISE_ID',400);
  if(policy.allowedEnterpriseIds.length&&!policy.allowedEnterpriseIds.includes(id))throw new IntegrationError('ENTERPRISE_NOT_FOUND',404);
}
/** Existing enterprise endpoints also honor a dedicated binding; unconfigured shared installations stay compatible. */
export function pinnedEnterpriseIds(env:Record<string,string|undefined>=process.env):string[] {
  const mode=env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE;
  if(mode===undefined||mode==='shared')return [];
  return deploymentPolicy(env).allowedEnterpriseIds;
}
