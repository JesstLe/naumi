import {z} from "zod";
import {resolveUserEmail} from "@/lib/admin-auth";
import {readImagegenBatch} from "@/lib/imagegen/batch";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {readCanvasImage} from "@/lib/canvas-image-input";
import {imagegenFilename,streamImagegenZip} from "@/lib/imagegen/zip";
import {withCreationReceiptRoute} from "@/lib/saas/creation-context";
export const runtime="nodejs";
export const maxDuration=300;
async function handleGet(request:Request,context:{params:Promise<{id:string}>}){
 const owner=await resolveUserEmail(request);if(!owner)return Response.json({error:"请先登录"},{status:401});
 const parsed=z.uuid().safeParse((await context.params).id);if(!parsed.success)return Response.json({error:"批次编号无效"},{status:400});
 const batch=await readImagegenBatch(parsed.data,owner);if(!batch)return Response.json({error:"批次不存在或无权访问"},{status:404});
 const ids=batch.items.flatMap(i=>i.result.artifacts.map(a=>a.artworkId)),works=await listArtworksByIds(owner,ids);
 if(works.length!==new Set(ids).size)return Response.json({error:"部分原图不存在或无权读取"},{status:403});
 async function* files(){
  let ordinal=0;
  for(const item of batch!.items)for(const artifact of item.result.artifacts){
   request.signal.throwIfAborted();const work=works.find(w=>w.id===artifact.artworkId)!;if(!work.image||work.videoUrl)throw new Error("批次原图不可用");
   const original=await readCanvasImage(work.image,request.url,owner!);const extension=original.mimeType==="image/webp"?"webp":original.mimeType==="image/jpeg"?"jpg":"png";
   yield {name:imagegenFilename(item.name,++ordinal,extension),bytes:original.buffer};
  }
  yield {name:"results.jsonl",bytes:Buffer.from(batch!.items.map(i=>JSON.stringify({key:i.key,name:i.name,status:i.result.status,chargedCredits:i.result.chargedCredits,error:i.result.error,artworkIds:i.result.artifacts.map(a=>a.artworkId)})).join("\n")+"\n")};
 }
 const iterator=streamImagegenZip(files()),stream=new ReadableStream<Uint8Array>({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(new Uint8Array(next.value));}catch(error){controller.error(error);}},async cancel(){await iterator.return(undefined);}});
 return new Response(stream,{headers:{"content-type":"application/zip","content-disposition":`attachment; filename="imagegen-${batch.id}.zip"`,"cache-control":"private, no-store"}});
}
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return withCreationReceiptRoute(request,()=>handleGet(request,context));}
