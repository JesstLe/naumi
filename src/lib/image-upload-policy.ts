/** Archive originals and model references have deliberately different budgets. */
export const ORIGINAL_IMAGE_MAX_BYTES=64*1024*1024;
export const ORIGINAL_IMAGE_MAX_PIXELS=64_000_000;
export const REFERENCE_IMAGE_MAX_BYTES=12*1024*1024;
export function referenceImageBudget(count=1){
 const n=Math.max(1,Math.min(32,Math.ceil(count)));
 return {maxBytes:Math.min(REFERENCE_IMAGE_MAX_BYTES-65536,Math.floor((64*1024*1024-1024*1024)/n)),maxPixels:Math.min(8_000_000,Math.floor(80_000_000/n)),maxEdge:4096};
}
export function fitReferenceImage(width:number,height:number,maxEdge:number,maxPixels:number){
 const scale=Math.min(1,maxEdge/Math.max(width,height),Math.sqrt(maxPixels/(width*height)));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
