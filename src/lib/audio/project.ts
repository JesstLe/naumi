import {z} from "zod";
import type {MediaJobRequest} from "../video/media-job-schema";

export const audioNodeIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/);
const artworkId = z.string().min(1).max(160);
export const audioEditSchema = z.strictObject({
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive().nullable(),
  gain: z.number().finite().min(0).max(4),
  fadeIn: z.number().finite().nonnegative(),
  fadeOut: z.number().finite().nonnegative(),
}).superRefine((edit, context) => {
  if (edit.end !== null && edit.end <= edit.start) context.addIssue({code: "custom", path: ["end"], message: "结束时间须晚于开始时间"});
});
export type AudioEdit = z.infer<typeof audioEditSchema>;
export function originalAudioEdit(): AudioEdit {return {start: 0, end: null, gain: 1, fadeIn: 0, fadeOut: 0};}

/** An adopted result is real media, not the editable selection or a preview URL. */
export const adoptedAudioSchema = z.strictObject({
  artworkId, sourceArtworkId: artworkId, edit: audioEditSchema, jobId: z.uuid().nullable(),
});
export const audioProjectSchema = z.strictObject({
  version: z.literal(1), sourceArtworkId: artworkId.nullable(), edit: audioEditSchema, adopted: adoptedAudioSchema.nullable(),
  render: z.strictObject({operationId: z.uuid(), baseRevision: z.number().int().positive(), sourceArtworkId: artworkId, edit: audioEditSchema}).nullable().default(null),
}).superRefine((project, context) => {
  if (!project.sourceArtworkId && project.adopted || project.adopted && project.adopted.sourceArtworkId !== project.sourceArtworkId) context.addIssue({code: "custom", path: ["adopted"], message: "采用结果与音频来源不一致"});
  if (project.adopted && !project.adopted.jobId && (project.adopted.artworkId !== project.sourceArtworkId || JSON.stringify(project.adopted.edit) !== JSON.stringify(originalAudioEdit()))) context.addIssue({code: "custom", path: ["adopted"], message: "剪辑结果须来自真实媒体任务"});
  if (project.render && project.render.sourceArtworkId !== project.sourceArtworkId) context.addIssue({code: "custom", path: ["render"], message: "处理回执与音频来源不一致"});
});
export type AudioProject = z.infer<typeof audioProjectSchema>;
export function newAudioProject(): AudioProject {return {version: 1, sourceArtworkId: null, edit: originalAudioEdit(), adopted: null, render: null};}
export function withAudioSource(artworkId: string): AudioProject {
  return audioProjectSchema.parse({version: 1, sourceArtworkId: artworkId, edit: originalAudioEdit(), adopted: {artworkId, sourceArtworkId: artworkId, edit: originalAudioEdit(), jobId: null}});
}
export function effectiveAudioEdit(edit: AudioEdit, duration: number) {
  const validation = audioEditSchema.safeParse(edit);
  if (!validation.success) throw new Error(validation.error.issues[0]?.message || "音频编辑设定无效");
  const parsed = validation.data, end = parsed.end ?? duration;
  if (!Number.isFinite(duration) || duration <= 0 || parsed.start >= end || end > duration + 0.001) throw new Error("音频裁剪范围超出真实时长");
  const result = {...parsed, end: Math.min(end, duration)}, length = result.end - result.start;
  if (result.fadeIn > length || result.fadeOut > length) throw new Error("淡入淡出时长超出所选片段");
  return {...result, duration: length};
}
export function hasUnappliedAudioEdit(project: AudioProject) {
  return !!project.sourceArtworkId && (!project.adopted || JSON.stringify(project.edit) !== JSON.stringify(project.adopted.edit));
}
/** The browser preview and the fixed FFmpeg filter use the same linear envelope. */
export function audioGainAt(edit: AudioEdit, sourceDuration: number, elapsed: number) {
  const range = effectiveAudioEdit(edit, sourceDuration);
  if (elapsed < 0 || elapsed >= range.duration) return 0;
  return range.gain * (range.fadeIn ? Math.min(1, elapsed / range.fadeIn) : 1) * (range.fadeOut ? Math.min(1, (range.duration - elapsed) / range.fadeOut) : 1);
}
const seconds = (value: number) => String(Number(value.toFixed(6)));
/** A normal media job, with no user-authored command or second processing queue. */
export function audioEditMediaRequest(project: AudioProject, duration: number, operationId: string, projectKey?: string): MediaJobRequest {
  if (!project.sourceArtworkId) throw new Error("请先选择音频");
  const range = effectiveAudioEdit(project.edit, duration), filters = [`atrim=start=${seconds(range.start)}:end=${seconds(range.end)}`, "asetpts=PTS-STARTPTS", `volume=${seconds(range.gain)}`];
  if (range.fadeIn) filters.push(`afade=t=in:st=0:d=${seconds(range.fadeIn)}`);
  if (range.fadeOut) filters.push(`afade=t=out:st=${seconds(range.duration - range.fadeOut)}:d=${seconds(range.fadeOut)}`);
  return {operationId, action: "ffmpeg", inputs: [project.sourceArtworkId], outputs: ["audio.wav"],
    args: ["-i", "asset:0", "-map", "0:a:0", "-vn", "-af", filters.join(","), "-c:a", "pcm_s16le", "output:0"],
    auxiliaryFiles: [], auxiliaryOutputs: [], source: "canvas", ...(projectKey ? {projectKey} : {})};
}
export function audioInputIdentity(id: string) {return `audio-node:${audioNodeIdSchema.parse(id)}`;}
export function parseAudioInputIdentity(nodeId: string) {
  if (!nodeId.startsWith("audio-node:")) return null;
  const parsed = audioNodeIdSchema.safeParse(nodeId.slice(11));
  return parsed.success ? parsed.data : null;
}
