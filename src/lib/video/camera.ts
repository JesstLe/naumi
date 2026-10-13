import {z} from "zod";
export const videoCameraSchema=z.strictObject({camera:z.string().max(100).optional(),lens:z.string().max(100).optional(),focalLength:z.string().max(100).optional(),aperture:z.string().max(100).optional(),movement:z.string().max(200).optional()});
export type VideoCamera=z.infer<typeof videoCameraSchema>;
export function compileVideoCamera(camera?:VideoCamera):string{return camera?Object.entries(camera).filter(([,value])=>!!value).map(([key,value])=>`${key}: ${value}`).join("; "):"";}
