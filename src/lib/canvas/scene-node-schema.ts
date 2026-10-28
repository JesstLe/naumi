import { z } from "zod";
import { sceneIdSchema, sceneProjectSchema, type SceneProject } from "../scene/project";
import { videoProjectKeySchema } from "./project-key";

const coordinate = z.number().finite().min(-1e8).max(1e8);
const size = z.number().finite().min(64).max(32768);
export const sceneNodeWriteSchema = z.strictObject({
  id: sceneIdSchema,
  projectKey: videoProjectKeySchema.optional(),
  expectedRevision: z.number().int().nonnegative(),
  operationId: z.uuid(),
  title: z.string().trim().max(200).optional(),
  x: coordinate.optional(), y: coordinate.optional(), width: size.optional(), height: size.optional(),
  scene: sceneProjectSchema.optional(),
  deleted: z.boolean().optional(),
});
export type SceneNodeWrite = z.infer<typeof sceneNodeWriteSchema>;
export type CanvasSceneNode = {
  id: string; projectKey: string; revision: number; title: string;
  x: number; y: number; width: number; height: number; scene: SceneProject;
  deletedAt: string | null; createdAt: string; updatedAt: string;
};
