/** A completed local result is not permission to retry a supplier call. */
export type StoredImage = {url:string;execution?:{quality?:string;platformFunded?:boolean}};
// Raw checkpoints are inspected without fetching bytes. Only internal recovery
// hydrates these references, after authorizing the parent/child owner.
function imageUrl(value:any):string|undefined {
 if(typeof value==='string')return value;
 if(typeof value?.$imageJobDataURL!=='string'||!value.$imageJobDataURL.startsWith('data:image/'))return;
 if(typeof value.bytes?.$imageJobBuffer==='string')return value.bytes.$imageJobBuffer;
 if(typeof value.bytes?.$imageJobInlineBuffer==='string')return value.$imageJobDataURL+value.bytes.$imageJobInlineBuffer;
}
export function storedDeliveryCheckpoint(snapshot:Record<string,any>):{images:StoredImage[];final:boolean;allDone:boolean}|null{
 const project=(images:unknown)=>Array.isArray(images)?images.map(image=>({...image,url:imageUrl(image?.url)})):images;
 const valid=(images:unknown):images is StoredImage[]=>Array.isArray(images)&&images.length>0&&images.length<=4&&images.every(image=>image&&typeof image.url==="string"&&(image.url.startsWith("data:image/")||image.url.startsWith("/media/")));
 if(valid(snapshot.images))return {images:snapshot.images,final:true,allDone:true};
 const attempts=Object.values(snapshot.paidOperations||{}) as {state?:string;result?:unknown}[];
 const images=attempts.filter(a=>a.state==="done"&&valid(project(a.result))).flatMap(a=>project(a.result) as StoredImage[]);
 return valid(images)?{images,final:false,allDone:attempts.every(a=>a.state==="done")}:null;
}
