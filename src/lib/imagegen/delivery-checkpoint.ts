/** A completed local result is not permission to retry a supplier call. */
export type StoredImage = Partial<Omit<import("./generation-types").GeneratedImage,"execution">>&{url:string;execution?:{quality?:string;upstream?:string;reason?:string;platformFunded?:boolean}};
// Raw checkpoints are inspected without fetching bytes. Only internal recovery
// hydrates these references, after authorizing the parent/child owner.
function imageUrl(value:any):string|undefined {
 if(typeof value==='string')return value;
 if(typeof value?.$imageJobDataURL!=='string'||!value.$imageJobDataURL.startsWith('data:image/'))return;
 if(typeof value.bytes?.$imageJobBuffer==='string')return value.bytes.$imageJobBuffer;
 if(typeof value.bytes?.$imageJobInlineBuffer==='string')return value.$imageJobDataURL+value.bytes.$imageJobInlineBuffer;
}
type StoredImageSource = Omit<StoredImage,"url"> & {url:unknown};
/** Select before decoding; unrelated child checkpoints never participate in
 * delivery of an already complete final image/root result. */
export function selectStoredDeliveryCheckpoint(snapshot:Record<string,any>):{images:StoredImageSource[];final:boolean;allDone:boolean}|null{
 const project=(images:unknown)=>Array.isArray(images)?images.map(image=>({...image,url:imageUrl(image?.url)})):images;
 const valid=(images:unknown):images is StoredImage[]=>Array.isArray(images)&&images.length>0&&images.length<=4&&images.every(image=>image&&typeof image.url==="string"&&(image.url.startsWith("data:image/")||image.url.startsWith("/media/")));
 if(snapshot.deliveryComplete!==false&&valid(project(snapshot.images)))return {images:snapshot.images,final:true,allDone:true};
 const attempts=Object.values(snapshot.paidOperations||{}) as {state?:string;result?:unknown}[];
 const images=attempts.filter(a=>a.state==="done"&&valid(project(a.result))).flatMap(a=>a.result as StoredImageSource[]);
 if(valid(project(images)))return {images,final:false,allDone:attempts.every(a=>a.state==="done")};
 return valid(project(snapshot.images))?{images:snapshot.images,final:true,allDone:true}:null;
}
export function storedDeliveryCheckpoint(snapshot:Record<string,any>):{images:StoredImage[];final:boolean;allDone:boolean}|null{
 const selected=selectStoredDeliveryCheckpoint(snapshot);
 return selected?{...selected,images:selected.images.map(image=>({...image,url:imageUrl(image.url)!}))}:null;
}
