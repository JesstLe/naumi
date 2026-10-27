import { z } from "zod";
import { directorProjectSchema } from "../director/project";
import { videoNodeIdSchema, videoProjectKeySchema } from "./video-node-schema";

const position = z.number().finite().min(-1e7).max(1e7);
export const directorNodeWriteSchema = z.strictObject({
  id: videoNodeIdSchema, projectKey: videoProjectKeySchema.optional(), expectedRevision: z.number().int().nonnegative(), operationId: z.uuid(),
  title: z.string().trim().min(1).max(100).optional(), x: position.optional(), y: position.optional(),
  width: z.number().finite().min(240).max(4096).optional(), height: z.number().finite().min(160).max(4096).optional(),
  project: directorProjectSchema.optional(), deleted: z.boolean().optional(),
});
export type DirectorNodeWrite = z.infer<typeof directorNodeWriteSchema>;
export type CanvasDirectorNode = {
  id: string; projectKey: string; revision: number; title: string; x: number; y: number; width: number; height: number;
  project: z.infer<typeof directorProjectSchema>; outputs: { artworkId: string; kind: "image" | "video" }[];
  deletedAt: string | null; createdAt: string; updatedAt: string;
};
export const directorOutputSchema = z.strictObject({ expectedRevision: z.number().int().positive(), operationId: z.uuid(), artworkId: videoNodeIdSchema, kind: z.enum(["image", "video"]) });
