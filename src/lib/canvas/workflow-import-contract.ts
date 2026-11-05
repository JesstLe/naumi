import {z} from "zod";
import {WORKFLOW_CLIPBOARD_LIMIT,type ImportedManifest} from "./workflow-clipboard";
import type {ArtworkRecord} from "../artworks/types";
import type {CanvasTextNodeRecord} from "./text-node-repository";
import type {CanvasNodeSettings} from "./node-settings";
export const workflowImportRequest = z.object({
  operationId: z.string().uuid(), html: z.string().min(1).max(WORKFLOW_CLIPBOARD_LIMIT),
  projectKey: z.string().min(1).max(200).nullable().default(null),
  x: z.number().finite().min(-1e6).max(1e6), y: z.number().finite().min(-1e6).max(1e6),
}).strict();
export type WorkflowImportResult = { operationId: string; projectKey: string; artworks: ArtworkRecord[]; textNodes: CanvasTextNodeRecord[];
  manifest: ImportedManifest; settings: Record<string, CanvasNodeSettings>; missingReferences: number };


