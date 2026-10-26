import {randomUUID} from "node:crypto";
import {z} from "zod";
import {NextResponse} from "next/server";
import {authenticatedEmail} from "@/lib/request-auth";
import {listArtworksByIds} from "@/lib/artworks/repository";
import { storageKeyFromManagedUrl } from "@/lib/object-storage/runtime";
import {ModelConfigError} from "@/lib/model-config/types";
import {BillingError} from "@/lib/billing/types";
import {MediaPriceChangedError} from "@/lib/video/media-billing";
import {createMediaJob,getMediaJob} from "@/lib/video/media-jobs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=240;
const inputSchema=z.object({videoUrl:z.string().min(1).max(3000),kind:z.enum(["frame","audio"]).default("frame"),
  timestamp:z.union([z.number().finite().nonnegative(),z.literal("first"),z.literal("last")]).default(0),parentArtworkId:z.string().min(1).max(160).optional(),
  operationId:z.string().uuid().optional(),billingConfirmation:z.object({version:z.number().int().positive(),credits:z.number().int().nonnegative()}).strict().optional()}).strict();
/** Compatibility projection for existing canvas actions. All actual processing is
 * owned, persistent and isolated; long operations return the durable job ID. */
export async function POST(request:Request){
  const actor=await authenticatedEmail(request);if(!actor)return NextResponse.json({error:"请先登录"},{status:401});
  let jobId:string|undefined;
  try{
    const parsed=inputSchema.safeParse(await request.json());if(!parsed.success)throw new ModelConfigError("INVALID_EXTRACT_REQUEST","媒体抽取参数无效",422);
    const input=parsed.data,key=storageKeyFromManagedUrl(input.videoUrl);if(!key)throw new ModelConfigError("MEDIA_INPUT_UNAVAILABLE","请先将外部视频上传到媒体库",422);
    if(input.parentArtworkId){const parent=(await listArtworksByIds(actor,[input.parentArtworkId]))[0];
      if(!parent||storageKeyFromManagedUrl(parent.videoUrl||parent.image)!==key)throw new ModelConfigError("MEDIA_INPUT_UNAVAILABLE","父视频不存在或与素材不一致",404);}
    const header=request.headers.get("x-naumi-billing-operation-id"),operationId=input.operationId||(header&&z.string().uuid().safeParse(header).success?header:randomUUID());
    const created=await createMediaJob(actor,{operationId,action:input.kind==="frame"?"frame":"extract_audio",inputs:[input.parentArtworkId||key],timestamp:input.timestamp,billingConfirmation:input.billingConfirmation});
    jobId=created.id;
    let latestStatus=created.status;
    const deadline=Date.now()+180000;
    do{
      const job=await getMediaJob(actor,created.id);if(!job)throw new ModelConfigError("MEDIA_JOB_UNAVAILABLE","媒体任务不存在",404);
      latestStatus=job.status;
      if(job.status==="completed"){
        const output=job.outputs[0];if(!output)throw new Error("媒体抽取没有输出");
        return NextResponse.json({ok:true,kind:input.kind,jobId:job.id,url:output.url,mimeType:output.mimeType,storageKey:output.storageKey,artworkId:output.artworkId,
          timestamp:input.kind==="frame"?input.timestamp:0,metadata:output.probe,cost:job.cost});
      }
      if(job.status==="failed"||job.status==="cancelled")return NextResponse.json({error:job.error||"媒体处理已停止",jobId:job.id,status:job.status},{status:422});
      await new Promise(resolve=>setTimeout(resolve,300));
    }while(Date.now()<deadline&&!request.signal.aborted);
    return NextResponse.json({ok:true,jobId:created.id,status:latestStatus},{status:202});
  }catch(error){
    if(error instanceof ModelConfigError||error instanceof BillingError)return NextResponse.json({error:error.message,code:error.code,...(error instanceof MediaPriceChangedError?{quote:error.quote}:{})},{status:error.status});
    return NextResponse.json({error:"媒体抽取暂不可用，请稍后重试",...(jobId?{jobId}:{})},{status:503});
  }
}
