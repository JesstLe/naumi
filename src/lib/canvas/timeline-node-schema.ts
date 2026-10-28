import {z} from "zod";
import {timelineProjectSchema,timelineNodeIdSchema,type TimelineProject,type TimelineSource} from "../timeline/project";
import type {MediaJobRequest} from "../video/media-job-schema";
import {videoProjectKeySchema} from "./video-node-schema";

export {timelineNodeIdSchema} from "../timeline/project";
export const timelineAdoptedSchema=z.strictObject({artworkId:z.string().min(1).max(160),jobId:z.uuid(),project:timelineProjectSchema});
const coordinate=z.number().finite().min(-1e8).max(1e8),size=z.number().finite().min(64).max(32768);
export const timelineNodeWriteSchema=z.strictObject({
  id:timelineNodeIdSchema,projectKey:videoProjectKeySchema.optional(),expectedRevision:z.number().int().nonnegative(),operationId:z.uuid(),
  title:z.string().trim().max(200).optional(),x:coordinate.optional(),y:coordinate.optional(),width:size.optional(),height:size.optional(),
  timeline:timelineProjectSchema.optional(),adopted:timelineAdoptedSchema.nullable().optional(),deleted:z.boolean().optional(),
});
export type TimelineNodeWrite=z.infer<typeof timelineNodeWriteSchema>;
export type TimelineAdopted=z.infer<typeof timelineAdoptedSchema>;
export type TimelineMaterial=TimelineSource&{key:string;sha256:string;url:string};
export type TimelineRender={operationId:string;baseRevision:number;project:TimelineProject;sources:TimelineMaterial[];request:MediaJobRequest};
export type CanvasTimelineNode={id:string;projectKey:string;revision:number;title:string;x:number;y:number;width:number;height:number;
  timeline:TimelineProject;adopted:TimelineAdopted|null;render:TimelineRender|null;deletedAt:string|null;createdAt:string;updatedAt:string};

export const timelineArtworkIds=(project:TimelineProject)=>[...new Set(project.tracks.flatMap(track=>track.clips.map(clip=>clip.artworkId)))];
