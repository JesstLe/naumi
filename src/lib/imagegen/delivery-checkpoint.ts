/** A completed local result is not permission to retry a supplier call. */
export type StoredImage = {url:string;execution?:{quality?:string;platformFunded?:boolean}};
export function storedDeliveryCheckpoint(snapshot:Record<string,any>):{images:StoredImage[];final:boolean;allDone:boolean}|null{
 const valid=(images:unknown):images is StoredImage[]=>Array.isArray(images)&&images.length>0&&images.length<=4&&images.every(image=>image&&typeof image.url==="string"&&(image.url.startsWith("data:image/")||image.url.startsWith("/media/")));
 if(valid(snapshot.images))return {images:snapshot.images,final:true,allDone:true};
 const attempts=Object.values(snapshot.paidOperations||{}) as {state?:string;result?:unknown}[];
 const images=attempts.filter(a=>a.state==="done"&&valid(a.result)).flatMap(a=>a.result as StoredImage[]);
 return valid(images)?{images,final:false,allDone:attempts.every(a=>a.state==="done")}:null;
}
