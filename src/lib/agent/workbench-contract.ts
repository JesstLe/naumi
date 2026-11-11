import type { CreationSettings } from "./creation-settings";
import type { WorkbenchStep } from "./workbench-activity";
/** Browser-side conversation contracts. No React, HTTP implementation or task ownership. */
export type WorkbenchMessage = {
  role: "user" | "assistant";
  content: string;
  steps?: WorkbenchStep[];
  creationSettings?: CreationSettings;
  agentModel?: string;
  turnId?: string;
  pending?: boolean;
};
export type WorkbenchAccountScope = { readonly account: string; active: boolean };
export type WorkbenchAccountOwner = {
  current(): WorkbenchAccountScope | null;
  owns(scope: WorkbenchAccountScope | null): scope is WorkbenchAccountScope;
};
export type WorkbenchSessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  pinnedAt?: string | null;
  preview?: import("./workbench-session-preview").WorkbenchSessionPreview;
};
export type WorkbenchTransport = {
  headers(): Promise<Record<string, string>>;
  request: typeof fetch;
};
