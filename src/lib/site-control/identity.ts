import { deploymentPolicy } from '@/lib/enterprise/integration/policy';

/** Deployment identity is protected configuration, not a remotely editable tenant selector. */
export function enterpriseSiteIdentity(env: Record<string, string | undefined> = process.env) {
  if (env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE === undefined || env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE === 'shared') return null;
  const binding = deploymentPolicy(env);
  return { enterpriseId: binding.allowedEnterpriseIds[0], sourceInstanceId: binding.sourceInstanceId };
}
