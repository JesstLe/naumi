import {z} from "zod";

// Live and frozen identities share the established ordered-input nodeId wire.
export const sceneIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/);
export const sceneStateIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/);
const artworkId = z.string().min(1).max(160);
const references = z.array(artworkId).max(128).refine(ids => new Set(ids).size === ids.length, "场景参考图片重复");
export const sceneBackgroundSchema = z.strictObject({
  artworkId,
  projection: z.enum(["image", "panorama"]),
});
export const sceneStateSchema = z.strictObject({
  id: sceneStateIdSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().max(4000),
  referenceArtworkIds: references,
  background: sceneBackgroundSchema.nullable(),
}).superRefine((state, context) => {
  if (state.background && !state.referenceArtworkIds.includes(state.background.artworkId)) context.addIssue({code: "custom", path: ["background"], message: "场景背景须来自此状态的参考图片"});
});
export const sceneProjectSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(8000),
  defaultStateId: sceneStateIdSchema,
  states: z.array(sceneStateSchema).min(1).max(128),
}).superRefine((project, context) => {
  const ids = project.states.map(state => state.id);
  if (new Set(ids).size !== ids.length) context.addIssue({code: "custom", path: ["states"], message: "场景状态身份重复"});
  if (!ids.includes(project.defaultStateId)) context.addIssue({code: "custom", path: ["defaultStateId"], message: "默认场景状态不存在"});
});
export type SceneProject = z.infer<typeof sceneProjectSchema>;
export type SceneState = SceneProject["states"][number];
export type SceneBackground = z.infer<typeof sceneBackgroundSchema>;

export function newSceneProject(name = "场景"): SceneProject {
  return {version: 1, name, description: "", defaultStateId: "base", states: [{id: "base", name: "默认", description: "", referenceArtworkIds: [], background: null}]};
}
export function sceneInputIdentity(id: string, stateId: string) {
  return `scene:${sceneIdSchema.parse(id)}#${sceneStateIdSchema.parse(stateId)}`;
}
export function parseSceneInputIdentity(nodeId: string): {id: string; stateId: string} | null {
  if (!nodeId.startsWith("scene:")) return null;
  const separator = nodeId.lastIndexOf("#");
  const id = sceneIdSchema.safeParse(nodeId.slice(6, separator));
  const stateId = sceneStateIdSchema.safeParse(nodeId.slice(separator + 1));
  return separator >= 6 && id.success && stateId.success ? {id: id.data, stateId: stateId.data} : null;
}
export function sceneReferenceText(project: SceneProject, stateId: string) {
  const state = project.states.find(item => item.id === stateId);
  if (!state) throw new Error("场景状态不存在");
  return [project.name, project.description.trim(), `${state.name}${state.description.trim() ? `：${state.description.trim()}` : ""}`].filter(Boolean).join("\n");
}
export function frozenSceneInputIdentity(id: string, stateId: string, revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("场景版本无效");
  return `inline:${sceneInputIdentity(id, stateId)}@${revision}`;
}

/** A director applies a selected state once. Later asset edits cannot silently
 * replace an existing director project's background, camera, entities or keyframes. */
export const sceneDirectorSnapshotSchema = z.strictObject({
  sceneId: sceneIdSchema,
  stateId: sceneStateIdSchema,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  name: z.string().trim().min(1).max(100),
  stateName: z.string().trim().min(1).max(80),
  text: z.string().min(1).max(16384),
  referenceArtworkIds: references,
  background: sceneBackgroundSchema.nullable(),
}).superRefine((snapshot, context) => {
  if (snapshot.background && !snapshot.referenceArtworkIds.includes(snapshot.background.artworkId)) context.addIssue({code: "custom", path: ["background"], message: "场景快照背景须来自已冻结的参考图片"});
});
export type SceneDirectorSnapshot = z.infer<typeof sceneDirectorSnapshotSchema>;
export function sceneDirectorSnapshot(id: string, project: SceneProject, stateId: string, revision: number): SceneDirectorSnapshot {
  const state = project.states.find(item => item.id === stateId);
  if (!state) throw new Error("场景状态不存在");
  return sceneDirectorSnapshotSchema.parse({sceneId: id, stateId, revision, name: project.name, stateName: state.name, text: sceneReferenceText(project, stateId), referenceArtworkIds: [...state.referenceArtworkIds], background: state.background ? {...state.background} : null});
}
