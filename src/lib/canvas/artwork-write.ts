import {z} from "zod";
import type {Artwork} from "../mock-data";
import {mergeCanvasFields} from "./field-write";
const coordinate=z.number().finite().min(-1e7).max(1e7).nullable();
export const canvasArtworkFieldsSchema=z.object({title:z.string().max(80),canvasX:coordinate,canvasY:coordinate,canvasWidth:z.number().min(80).max(4096).nullable(),canvasHeight:z.number().min(80).max(4096).nullable(),marked:z.boolean(),canvasGroupId:z.string().min(1).max(200).nullable(),visible:z.boolean()});
export type CanvasArtworkFields=z.infer<typeof canvasArtworkFieldsSchema>;
export const CANVAS_ARTWORK_FIELDS=Object.keys(canvasArtworkFieldsSchema.shape) as Array<keyof CanvasArtworkFields>;
export type CanvasArtworkReceipt={node:Artwork;visible:boolean};
export type CanvasArtworkConflict={id:string;fields:string[];current:CanvasArtworkReceipt|null};
export class CanvasArtworkWriteConflict extends Error{
 readonly code="CANVAS_ARTWORK_CONFLICT";
 constructor(readonly id:string,readonly fields:string[],readonly current:CanvasArtworkReceipt|null){super(current?"此图片节点已在其他页面修改，本次修改已保留":"原图片节点已删除，本次修改已保留");}
}
export const artworkFields=(node:Artwork,visible=true):CanvasArtworkFields=>({title:node.title,canvasX:node.canvasX??null,canvasY:node.canvasY??null,canvasWidth:node.canvasWidth??null,canvasHeight:node.canvasHeight??null,marked:!!node.marked,canvasGroupId:node.canvasGroupId??null,visible});
export function mergeCanvasArtworkWrite(id:string,current:CanvasArtworkReceipt|null,desired:Partial<CanvasArtworkFields>,base:Partial<CanvasArtworkFields>|undefined){
 return mergeCanvasFields(current?artworkFields(current.node,current.visible):null,desired,base,CANVAS_ARTWORK_FIELDS,fields=>new CanvasArtworkWriteConflict(id,fields,current));
}

export function assertCanvasArtworkVersion(id:string,current:CanvasArtworkReceipt|null,expected:Partial<CanvasArtworkFields>){
 const actual=current?artworkFields(current.node,current.visible):null,fields=CANVAS_ARTWORK_FIELDS.filter(key=>Object.hasOwn(expected,key)&&JSON.stringify(actual?.[key])!==JSON.stringify(expected[key]));
 if(!current||fields.length)throw new CanvasArtworkWriteConflict(id,current?fields:["deleted"],current);
}
