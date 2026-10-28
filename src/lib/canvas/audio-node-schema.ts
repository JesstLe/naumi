import { z } from "zod";
import { audioNodeIdSchema, audioProjectSchema, type AudioProject } from "../audio/project";
import { videoProjectKeySchema } from "./video-node-schema";

const coordinate = z.number().finite().min(-1e8).max(1e8);
const size = z.number().finite().min(64).max(32768);
export const audioNodeWriteSchema = z.strictObject({
  id: audioNodeIdSchema,
  projectKey: videoProjectKeySchema.optional(),
  expectedRevision: z.number().int().nonnegative(),
  operationId: z.uuid(),
  title: z.string().trim().max(200).optional(),
  x: coordinate.optional(), y: coordinate.optional(), width: size.optional(), height: size.optional(),
  audio: audioProjectSchema.optional(),
  deleted: z.boolean().optional(),
});
export type AudioNodeWrite = z.infer<typeof audioNodeWriteSchema>;
export type CanvasAudioNode = {
  id: string; projectKey: string; revision: number; title: string;
  x: number; y: number; width: number; height: number; audio: AudioProject;
  deletedAt: string | null; createdAt: string; updatedAt: string;
};
