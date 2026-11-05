import {z} from 'zod';

export const MAX_STITCH_IMAGES=12;
/** Current clients identify their original intent; older JSON callers remain
 * compatible. Identity is never synthesized when reading a receipt. */
export const canvasStitchRequest=z.object({
 ids:z.array(z.coerce.string().transform(id=>id.trim())).transform(ids=>[...new Set(ids.filter(Boolean))]).refine(ids=>ids.length>=2&&ids.length<=MAX_STITCH_IMAGES,`请选择 2–${MAX_STITCH_IMAGES} 张图片`),
 title:z.unknown().optional(),x:z.unknown().optional(),y:z.unknown().optional(),operationId:z.uuid().optional(),
});
export type CanvasStitchInput=z.infer<typeof canvasStitchRequest>;
export type CanvasStitchResult={ok:true;kind:'canvas-stitch';id:string;image:string;width:number;height:number;projectKey:string;operationId?:string};
