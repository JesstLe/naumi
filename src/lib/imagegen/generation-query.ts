import "server-only";
import {imageOutputNotice} from "./output-advisory";
import {storedImageReview,IMAGE_REVIEW_MESSAGE} from "../image-job-review";
import {dbEnabled} from "@/platform/db/pool";
import {getUser} from "@/lib/accounts/session";
import {storageEnabled} from "../storage";
import {getOpenAISettings} from "../settings";
import {imageJobPollState} from "../image-job-failure";
import {readDeliveryBilling} from "./delivery-billing";
import {JOBS} from "./generation-jobs";
export type GenerationReadResult={status:number;body:Record<string,any>;headers?:Record<string,string>};
function readResult(body:Record<string,any>,options?:{status?:number;headers?:Record<string,string>}):GenerationReadResult{return {status:options?.status??200,body,...(options?.headers?{headers:options.headers}:{})};}
/** Shared legacy polling projection. Parent receipts retain their existing recovery semantics and identity. */
export async function readGeneration(query:{active:boolean;jobId:string|null;actor:()=>Promise<string|null>}):Promise<GenerationReadResult> {
  if (query.active) {
    const email = await query.actor();
    if (!email) return readResult({ error: "请先登录" }, { status: 401 });
    return readResult({ jobs: await JOBS.active(email) });
  }
  const jobId = query.jobId;
  if(jobId?.startsWith("imagegen-")&&/^[a-f0-9-]{36}$/i.test(jobId.slice(9))){
    const owner=await query.actor();if(!owner)return readResult({error:"请先登录"},{status:401});
    const {getImagegenResult}=await import("./dispatch"),result=await getImagegenResult(jobId.slice(9),owner);if(!result)return readResult({error:"任务不存在或无权访问"},{status:404});
    return readResult({status:["succeeded","partial"].includes(result.status)?"done":["failed","cancelled","needs_attention"].includes(result.status)?"error":"pending",operationStatus:result.status,stage:result.stage,images:result.artifacts.map(a=>({id:a.artworkId,url:a.url,width:a.width,height:a.height})),error:result.error?.message,warnings:result.warnings,recoveryAvailable:result.recoveryAvailable,billingStatus:result.billingStatus,creditsUsed:result.chargedCredits,user:await getUser(owner)},{headers:{"cache-control":"private, no-store"}});
  }
  if (jobId) {
    if (dbEnabled && (await query.actor())?.toLowerCase() !== await JOBS.owner(jobId)) {
      return readResult({ error: "无权查看此任务" }, { status: 403 });
    }
    const job = await JOBS.get(jobId, false);
    if (!job) {
      return readResult({
        status: "error",
        error: "任务不存在或已过期，请重试",
      });
    }
    if(job.status==="pending"&&dbEnabled){const owner=await JOBS.owner(jobId);if(owner&&await storedImageReview(jobId,owner))return readResult({status:"error",operationStatus:"needs_attention",reviewRequired:true,error:IMAGE_REVIEW_MESSAGE},{headers:{"cache-control":"private, no-store"}});}
    if (job.status === "done") {
      const owner=await JOBS.owner(jobId);
      const billing=owner?await readDeliveryBilling(owner,[jobId]).catch(()=>null):null;
      const notice = imageOutputNotice(job.imagegenOutputError, job.imagegenOutputWarning, !!job.images?.length);
      if(notice.error)return readResult({status:"error",error:notice.error,images:(job.images||[]).map(({execution,...image})=>image),creditsUsed:billing?.chargedCredits??job.creditsUsed,billingStatus:billing?.confirmed?"confirmed":"unavailable",user:job.user});
      return readResult({
        status: "done",
        ok: true,
        images: (job.images || []).map(({ execution, ...image }) => image),
        user: job.user,
        creditsUsed: billing?.chargedCredits??job.creditsUsed,
        billingStatus:billing?.confirmed?"confirmed":"unavailable",
        operationStatus:job.deliveryComplete===false?"partial":"succeeded",
        mock: job.mock,
        persisted: job.persisted,
        quality: job.quality,
        warnings: notice.warning ? [notice.warning] : undefined,
      });
    }
    if (imageJobPollState(job.status) === "error") {
      const owner = dbEnabled ? await JOBS.owner(jobId) : undefined;
      return readResult({ status: "error", error: job.error, reviewRequired: job.status === "needs_attention", user: owner ? await getUser(owner) : undefined });
    }
    return readResult({ status: "pending",...((job as {queueState?:string}).queueState?{operationStatus:"queued"}:{}), error: job.error || "" });
  }

  // 健康检查:绝不暴露模型名/上游供应商/密钥来源(铁律:绝不泄露所用模型)。
  const { apiKey } = await getOpenAISettings();
  return readResult({
    status: "ok",
    ready: !!apiKey,
    db: dbEnabled,
    storage: storageEnabled,
  });
}
