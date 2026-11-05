import { z } from "zod";
import {sceneDirectorSnapshotSchema} from "../scene/project";

/** JSONB may reorder object keys. Project identity ignores that representation
 * detail, but preserves entity/keyframe array order and every actual value. */
export function directorProjectFingerprint(project:DirectorProject):string{
  return JSON.stringify(project,(_key,value)=>value&&typeof value==="object"&&!Array.isArray(value)
    ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])):value);
}

const id = z.string().min(1).max(160);
const value = z.number().finite().min(-10000).max(10000);
const vector = z.tuple([value, value, value]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
export const directorPoseSchema = z.object({
  head: z.number().min(-90).max(90), leftArm: z.number().min(-180).max(180), rightArm: z.number().min(-180).max(180),
  leftElbow: z.number().min(-150).max(150), rightElbow: z.number().min(-150).max(150),
  leftLeg: z.number().min(-130).max(130), rightLeg: z.number().min(-130).max(130),
  leftKnee: z.number().min(0).max(150), rightKnee: z.number().min(0).max(150),
}).strict();
export type DirectorPose = z.infer<typeof directorPoseSchema>;
export const DIRECTOR_POSES: Record<string, DirectorPose> = {
  stand: { head: 0, leftArm: 0, rightArm: 0, leftElbow: 0, rightElbow: 0, leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0 },
  walk: { head: 0, leftArm: -28, rightArm: 28, leftElbow: -15, rightElbow: -15, leftLeg: 32, rightLeg: -28, leftKnee: 22, rightKnee: 8 },
  sit: { head: 0, leftArm: -30, rightArm: -30, leftElbow: -70, rightElbow: -70, leftLeg: -90, rightLeg: -90, leftKnee: 90, rightKnee: 90 },
  reach: { head: -10, leftArm: -80, rightArm: -100, leftElbow: -20, rightElbow: -10, leftLeg: 0, rightLeg: 0, leftKnee: 0, rightKnee: 0 },
};
export const directorTransformSchema = z.object({
  position: vector, rotation: vector, scale: z.tuple([z.number().finite().min(0.05).max(100), z.number().finite().min(0.05).max(100), z.number().finite().min(0.05).max(100)]), pose: directorPoseSchema,
}).strict();
export const directorEntitySchema = directorTransformSchema.extend({ id, name: z.string().trim().min(1).max(100), kind: z.enum(["character", "box", "sphere", "cylinder"]), color }).strict();
export const directorCameraViewSchema = z.object({ position: vector, target: vector, fov: z.number().finite().min(10).max(120) }).strict()
  .refine(view => view.position.some((n, i) => Math.abs(n - view.target[i]) > 0.001), "机位与目标点不能重合");
const camera = z.object({ id, name: z.string().trim().min(1).max(100), view: directorCameraViewSchema }).strict();
const frame = z.object({ id, time: z.number().finite().min(0).max(120), cameraId: id, view: directorCameraViewSchema,
  entities: z.array(directorTransformSchema.extend({ id })).max(256), easing: z.enum(["linear", "smooth"]) }).strict();
export const directorProjectSchema = z.object({
  version: z.literal(1), name: z.string().trim().min(1).max(100), aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
  duration: z.number().finite().min(1).max(120), background: color, floor: color,
  sceneReference: sceneDirectorSnapshotSchema.nullable().optional(),
  backgroundProjection: z.enum(["image", "panorama"]).optional(),
  panoramaArtworkId: id.nullable(), panoramaRotation: z.number().finite().min(-360).max(360),
  entities: z.array(directorEntitySchema).max(256), cameras: z.array(camera).min(1).max(64), activeCameraId: id,
  keyframes: z.array(frame).max(1024),
}).strict().superRefine((project, ctx) => {
  const entities = new Set(project.entities.map(entity => entity.id)), cameras = new Set(project.cameras.map(camera => camera.id));
  if (entities.size !== project.entities.length || cameras.size !== project.cameras.length || new Set(project.keyframes.map(frame => frame.id)).size !== project.keyframes.length)
    ctx.addIssue({ code: "custom", message: "工程对象身份重复" });
  if (!cameras.has(project.activeCameraId)) ctx.addIssue({ code: "custom", path: ["activeCameraId"], message: "当前机位不存在" });
  const times = new Set<string>();
  for (const [index, frame] of project.keyframes.entries()) {
    const key = `${frame.cameraId}:${frame.time}`;
    if (!cameras.has(frame.cameraId) || frame.time > project.duration || times.has(key) || new Set(frame.entities.map(entity => entity.id)).size !== frame.entities.length || frame.entities.some(entity => !entities.has(entity.id)))
      ctx.addIssue({ code: "custom", path: ["keyframes", index], message: "关键帧机位、时间或对象无效" });
    times.add(key);
  }
});
export type DirectorProject = z.infer<typeof directorProjectSchema>;
export type DirectorEntity = z.infer<typeof directorEntitySchema>;
export type DirectorView = z.infer<typeof directorCameraViewSchema>;
export type DirectorKeyframe = DirectorProject["keyframes"][number];
export type DirectorTransform = z.infer<typeof directorTransformSchema>;
export function newDirectorEntity(id: string, kind: DirectorEntity["kind"], name: string, x = 0): DirectorEntity {
  return { id, kind, name, color: kind === "character" ? "#8198ba" : "#d7b89b", position: [x, kind === "character" ? 0 : 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], pose: { ...DIRECTOR_POSES.stand } };
}
export function newDirectorProject(): DirectorProject {
  return { version: 1, name: "3D 导演台", aspectRatio: "16:9", duration: 5, background: "#edf0f5", floor: "#e2e6ec", panoramaArtworkId: null, panoramaRotation: 0,
    entities: [newDirectorEntity("actor-1", "character", "角色 1")], cameras: [{ id: "camera-1", name: "机位 1", view: { position: [4, 2.7, 5], target: [0, 1, 0], fov: 40 } }], activeCameraId: "camera-1", keyframes: [] };
}
export function directorOutputSize(ratio: DirectorProject["aspectRatio"]): [number, number] { return ratio === "9:16" ? [720, 1280] : ratio === "1:1" ? [1024, 1024] : [1280, 720]; }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angle = (a: number, b: number, t: number) => a + (((b - a + 540) % 360 + 360) % 360 - 180) * t;
function interpolateVector(a: number[], b: number[], t: number, rotate = false): [number, number, number] { return a.map((n, i) => (rotate ? angle : lerp)(n, b[i], t)) as [number, number, number]; }
/** One selected shot interpolates camera and the same scene identities, never another camera's track. */
export function sampleDirectorProject(project: DirectorProject, time: number): DirectorProject {
  const frames = project.keyframes.filter(frame => frame.cameraId === project.activeCameraId).sort((a, b) => a.time - b.time);
  if (!frames.length) return project;
  const t = Math.max(0, Math.min(project.duration, time));
  const before = frames.filter(frame => frame.time <= t).at(-1) || frames[0], after = frames.find(frame => frame.time >= t) || frames[frames.length - 1];
  let progress = before === after ? 0 : (t - before.time) / (after.time - before.time);
  if (before.easing === "smooth") progress = progress * progress * (3 - 2 * progress);
  const view: DirectorView = { position: interpolateVector(before.view.position, after.view.position, progress), target: interpolateVector(before.view.target, after.view.target, progress), fov: lerp(before.view.fov, after.view.fov, progress) };
  return { ...project, cameras: project.cameras.map(camera => camera.id === project.activeCameraId ? { ...camera, view } : camera), entities: project.entities.map(entity => {
    const a = before.entities.find(item => item.id === entity.id) || entity, b = after.entities.find(item => item.id === entity.id) || a;
    const pose = Object.fromEntries(Object.keys(a.pose).map(key => [key, lerp(a.pose[key as keyof DirectorPose], b.pose[key as keyof DirectorPose], progress)])) as DirectorPose;
    return { ...entity, position: interpolateVector(a.position, b.position, progress), rotation: interpolateVector(a.rotation, b.rotation, progress, true), scale: interpolateVector(a.scale, b.scale, progress), pose };
  }) };
}
export function recordDirectorKeyframe(project: DirectorProject, time: number, id: string): DirectorProject {
  const value = Math.max(0, Math.min(project.duration, Math.round(time * 100) / 100)), current = project.keyframes.find(frame => frame.cameraId === project.activeCameraId && frame.time === value);
  const frame: DirectorKeyframe = { id: current?.id || id, time: value, cameraId: project.activeCameraId, view: structuredClone(project.cameras.find(camera => camera.id === project.activeCameraId)!.view),
    entities: project.entities.map(({ id, position, rotation, scale, pose }) => structuredClone({ id, position, rotation, scale, pose })), easing: current?.easing || "smooth" };
  return { ...project, keyframes: [...project.keyframes.filter(item => item.id !== current?.id), frame].sort((a, b) => a.time - b.time) };
}
