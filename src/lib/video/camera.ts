import {z} from "zod";
import {CAMERA_PROFILES,LENS_PROFILES,describeFocalLength,describeAperture} from "./camera-presets";
export const videoCameraSchema=z.strictObject({camera:z.string().max(100).optional(),lens:z.string().max(100).optional(),focalLength:z.string().max(100).optional(),aperture:z.string().max(100).optional(),movement:z.string().max(200).optional()});
export type VideoCamera=z.infer<typeof videoCameraSchema>;
export function compileVideoCamera(camera?:VideoCamera):string{
  if(!camera)return "";
  const parts:string[]=[];
  const body=CAMERA_PROFILES.find(item=>item.id===camera.camera||item.label===camera.camera);
  const lens=LENS_PROFILES.find(item=>item.id===camera.lens||item.label===camera.lens);
  if(camera.camera)parts.push(body?.profilePrompt||`camera: ${camera.camera}`);
  if(camera.lens)parts.push(lens?.profilePrompt||`lens: ${camera.lens}`);
  if(camera.focalLength){const matched=/^(\d+(?:\.\d+)?)\s*(?:mm)?$/i.exec(camera.focalLength.trim()),value=matched?Number(matched[1]):0;parts.push(value>0?describeFocalLength(value):`focalLength: ${camera.focalLength}`);}
  if(camera.aperture){const matched=/^(?:f\s*\/\s*)?(\d+(?:\.\d+)?)$/i.exec(camera.aperture.trim()),value=matched?Number(matched[1]):0;parts.push(value>0?describeAperture(value):`aperture: ${camera.aperture}`);}
  if(camera.movement)parts.push(`camera movement: ${camera.movement}`);
  return parts.length?`Virtual camera direction; do not add camera equipment inside the frame. ${parts.join("; ")}`:"";
}
