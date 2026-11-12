export type PendingSource = "billing-operation" | "image-job" | "canvas-task" | "video-task";
export type PendingItem = {
    source: PendingSource; id: string; email: string; kind: string;
    state: string; operationState: string | null; reservedCredits: number;
    errorCode: string | null; error: string | null;
    createdAt: string; updatedAt: string;
};
export type SourceSummary = { count: number; oldestAt: string | null };
export type PendingOverview = {
    summary: Record<PendingSource, SourceSummary> & { total: number };
    items: PendingItem[];
    generatedAt: string;
};
