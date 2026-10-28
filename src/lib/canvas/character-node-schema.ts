import { z } from "zod";
import { characterIdSchema, characterProjectSchema, type CharacterProject } from "../character/project";
import { videoProjectKeySchema } from "./project-key";

const coordinate = z.number().finite().min(-1e8).max(1e8);
const size = z.number().finite().min(64).max(32768);
export const characterNodeWriteSchema = z.strictObject({
  id: characterIdSchema,
  projectKey: videoProjectKeySchema.optional(),
  expectedRevision: z.number().int().nonnegative(),
  operationId: z.uuid(),
  title: z.string().trim().max(200).optional(),
  x: coordinate.optional(), y: coordinate.optional(), width: size.optional(), height: size.optional(),
  character: characterProjectSchema.optional(),
  deleted: z.boolean().optional(),
});
export type CharacterNodeWrite = z.infer<typeof characterNodeWriteSchema>;
export type CanvasCharacterNode = {
  id: string; projectKey: string; revision: number; title: string;
  x: number; y: number; width: number; height: number; character: CharacterProject;
  deletedAt: string | null; createdAt: string; updatedAt: string;
};
