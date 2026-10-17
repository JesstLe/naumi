import type { EnterpriseIdentity, EnterpriseSnapshot } from '../contracts';

export type DeploymentPolicy = { mode: 'shared' | 'dedicated'; sourceInstanceId: string; allowedEnterpriseIds: string[] };
export type RecordKind = 'artworks' | 'generations' | 'ledger';
export type RecordQuery = { enterpriseId: string; kind: RecordKind; from?: string; to?: string; email?: string; page?: number; size?: number };
export type SourceReference = { instanceId: string; enterpriseId: string; kind: string; id: string };
export type IntegratedRecord = {
  ref: SourceReference; account: { sourceKey: string; email: string; name: string | null };
  createdAt: string | null; title: string | null; prompt: string | null; status: string | null;
  operation: string | null; sourceLabel: string | null; provenance: string | null;
  taskRefs: { imageJobId: string | null; canvasTaskId: string | null; videoTaskId: string | null; billingOperationId: string | null };
  credits: { quoted: number | null; charged: number | null; reserved: number | null; delta: number | null; settled: boolean | null; evidence: 'linked-ledger' | 'ledger-entry' | 'unrecorded' };
  ledgerKind: string | null; media: { available: boolean; href: string | null };
  attribution: { visibility: 'current-enterprise-scope'; businessOwnership: 'unconfirmed'; workflowTaskId: null };
};
export type IntegrationPage = { version: 1; source: 'naumi'; instanceId: string; enterpriseId: string; kind: RecordKind;
  rows: IntegratedRecord[]; total: number; page: number; size: number; generatedAt: string;
  consistency: 'source-read'; attribution: 'current-membership-not-historical-ownership' };

/** UI consumes this port, never deployment-specific database tables or an arbitrary base URL. */
export interface EnterpriseDataPort {
  readonly transport: 'in-process';
  readonly policy: DeploymentPolicy;
  list(): Promise<EnterpriseIdentity[]>;
  members(enterpriseId: string): Promise<EnterpriseSnapshot>;
  records(query: RecordQuery): Promise<IntegrationPage>;
}
