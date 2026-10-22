export type EnterpriseOverviewMeta = {
  tenantId: string;
  name: string;
  version: number;
  scope: 'tenant' | 'current_subordinates';
  members: { visible: number; effective: number; expiring: number };
  activities: { id: string; action: string; actor: string; target: string; createdAt: string }[];
  generatedAt: string;
};

export type EnterpriseCreationSummary = {
  summary: { total: number; activeMembers: number; settledCredits: number | null; pending: number; failed: number; needsReview: number };
  memberUsage: { email: string; name: string; settledCredits: number }[];
  items: { id: string; title: string; actorEmail: string; actorName: string; status: string; acceptedAt: string; settledCredits: number | null; sourceKind: string; scopeKind: string; tenantId: string | null; thumbnailAssetId: string | null; completeness: string }[];
  pagination: { total: number; page: number; size: number };
  generatedAt: string;
};
