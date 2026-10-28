/** Stable canvas node identity is independent from immutable generation results. */
export const CANVAS_IMAGE_VERSION_SOURCE = "canvas-node-version";
export type CanvasImageVersion = {
  id: string; image: string; prompt: string; width: number | null; height: number | null;
  ratio: string | null; resolution: string | null; style: string | null; createdAt: string;
};
export type CanvasImageAttachment = { nodeId: string; applied: boolean; previousVersionId: string; previousImage:string; versionId: string; revision:number; reason?:"changed"|"locked"|"deleted" };
export const isCanvasImageVersion = (art: {source?:string|null}) => art.source === CANVAS_IMAGE_VERSION_SOURCE;

export type CanvasImageVersionList = {image:string;currentVersionId:string;revision:number;versions:CanvasImageVersion[]};
