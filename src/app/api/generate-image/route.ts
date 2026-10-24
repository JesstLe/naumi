import {normalizeLegacyFrameRequest, LegacyFrameError} from "@/lib/imagegen/legacy-frame-request";
import {imageOutputNotice} from "@/lib/imagegen/output-advisory";
import {storedImageReview, IMAGE_REVIEW_MESSAGE} from "@/lib/image-job-review";
import {currentImagegenStep} from "@/lib/imagegen/context";
import {canvasParameterError} from "@/lib/canvas/generation-parameters";
import {withBillingIntent} from "@/lib/billing/intent";
import {withBiRequest} from "@/lib/bi/model-observer";
import {quoteForRequest} from "@/lib/billing/server";
import {imageWorkerAuthorized} from "@/lib/durable-image-jobs";
import {NextResponse} from "next/server";
import {provenanceEntry} from "@/lib/artwork-provenance";
import {dbEnabled, getUser} from "@/lib/db";
import {clientIp} from "@/lib/ip";
import {resolveUserEmail} from "@/lib/admin-auth";
import {storageEnabled} from "@/lib/storage";
import {getOpenAISettings} from "@/lib/settings";
import {imageJobPollState} from "@/lib/image-job-failure";
import type {GenParams,GenImage} from "@/lib/imagegen/generation-types";
export type {GeneratedImage} from "@/lib/imagegen/generation-types";
import {submitGeneration} from "@/lib/imagegen/generation-submission";
import {JOBS,kickGeneration} from "@/lib/imagegen/generation-runtime";

export const runtime="nodejs";

export const maxDuration=120;

const MAX_IMAGES = 16;

function parseIds(raw: string): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseCount(value: unknown, fallback = 4): number {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), 1), 8);
}

function parseDimension(value: unknown): number {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : -1;
}

async function parseParams(request: Request): Promise<GenParams | null> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const f = await request.formData();
    const s = (k: string) => (f.get(k) ?? "").toString();
    const images: GenImage[] = [];
    for (const file of f.getAll("image")) {
      if (file instanceof File && file.size > 0) {
        images.push({
          buf: Buffer.from(await file.arrayBuffer()),
          type: file.type || "image/png",
        });
      }
      if (images.length >= (currentImagegenStep()?32:MAX_IMAGES)) break;
    }
    return {
      prompt: s("prompt").trim(),
      billingVersion:f.get("billingVersion")??undefined,billingCredits:f.get("billingCredits")??undefined,
      userPrompt: s("userPrompt").trim(),
      category: s("category") || "main",
      ratio: s("ratio") || "1:1",
      resolution: s("resolution") || "1K",
      style: s("style"),
      quality: s("quality").trim() || request.headers.get("x-naumi-image-quality") || "medium",
      count: parseCount(s("count")),
      transparent: s("transparent") === "1",
      ratiogen: s("ratiogen") === "1",
      email: s("email").trim(),
      images,
      ...(currentImagegenStep()&&f.get("mask") instanceof File?{mask:{buf:Buffer.from(await (f.get("mask") as File).arrayBuffer()),type:(f.get("mask") as File).type}}:{}),
      parentId: s("parentId").trim(),
      parentIds: parseIds(s("parentIds")),
      templateId: s("templateId").trim(),
      templateImage: s("templateImage").trim(),
      templatePrompt: s("templatePrompt").trim(),
      origin: s("origin").trim(),
      entry: provenanceEntry(s("entry"), "generate"),
      projectGroupId: s("projectGroupId").trim(),
      model: s("model").trim(),
      targetWidth: parseDimension(s("targetWidth")),
      targetHeight: parseDimension(s("targetHeight")),
    };
  }
  const j = (await request.json()) as Partial<GenParams>;
  return {
    prompt: (j.prompt ?? "").trim(),
    billingVersion:j.billingVersion,billingCredits:j.billingCredits,
    userPrompt: (j.userPrompt ?? "").trim(),
    category: j.category || "main",
    ratio: j.ratio || "1:1",
    resolution: j.resolution || "1K",
    style: j.style ?? "",
    quality: j.quality ?? request.headers.get("x-naumi-image-quality") ?? "medium",
    count: parseCount(j.count),
    transparent: !!j.transparent,
    ratiogen: !!j.ratiogen,
    email: (j.email ?? "").trim(),
    images: [],
    parentId: (j.parentId ?? "").trim(),
    parentIds: Array.isArray(j.parentIds) ? j.parentIds : [],
    templateId: (j.templateId ?? "").trim(),
    templateImage: (j.templateImage ?? "").trim(),
    templatePrompt: (j.templatePrompt ?? "").trim(),
    origin: (j.origin ?? "").trim(),
    entry: provenanceEntry(j.entry, "generate"),
    projectGroupId: (j.projectGroupId ?? "").trim(),
    model: typeof (j as Partial<GenParams>).model === "string" ? (j as Partial<GenParams>).model!.trim() : "",
    targetWidth: parseDimension((j as Partial<GenParams>).targetWidth),
    targetHeight: parseDimension((j as Partial<GenParams>).targetHeight),
  };
}

async function handleObservedPost(request: Request) {
  if(imageWorkerAuthorized(request)){
    const body=await request.json();
    if(typeof body.workerJobId!=="string")return NextResponse.json({error:"无效任务"},{status:400});
    await kickGeneration(body.workerJobId);return NextResponse.json({ok:true});
  }
  let input:GenParams|null;
  try{input=await parseParams(request);}catch{return NextResponse.json({error:"请求格式不正确"},{status:400});}
  if(!input)return NextResponse.json({error:"请求格式不正确"},{status:400});
  const result=await submitGeneration(input,{
    actor:()=>dbEnabled?resolveUserEmail(request):Promise.resolve(null),
    ip:clientIp(request),featureModel:request.headers.get("x-naumi-feature-model"),
    quote:(facts,options)=>quoteForRequest(request,facts,undefined,options),
  });
  return NextResponse.json(result.body,{status:result.status});
}

async function handleGet(request: Request) {
  if (new URL(request.url).searchParams.has("active")) {
    const email = await resolveUserEmail(request);
    if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    return NextResponse.json({ jobs: await JOBS.active(email) });
  }
  const jobId = new URL(request.url).searchParams.get("job");
  if(jobId?.startsWith("imagegen-")&&/^[a-f0-9-]{36}$/i.test(jobId.slice(9))){
    const owner=await resolveUserEmail(request);if(!owner)return NextResponse.json({error:"请先登录"},{status:401});
    const {getImagegenResult}=await import("@/lib/imagegen/dispatch"),result=await getImagegenResult(jobId.slice(9),owner);if(!result)return NextResponse.json({error:"任务不存在或无权访问"},{status:404});
    return NextResponse.json({status:result.status==="succeeded"?"done":["failed","cancelled","needs_attention"].includes(result.status)?"error":"pending",operationStatus:result.status,stage:result.stage,images:result.artifacts.map(a=>({id:a.artworkId,url:a.url,width:a.width,height:a.height})),error:result.error?.message,warnings:result.warnings,recoveryAvailable:result.recoveryAvailable,billingStatus:result.billingStatus,creditsUsed:result.chargedCredits,user:await getUser(owner)},{headers:{"cache-control":"private, no-store"}});
  }
  if (jobId) {
    if (dbEnabled && (await resolveUserEmail(request))?.toLowerCase() !== await JOBS.owner(jobId)) {
      return NextResponse.json({ error: "无权查看此任务" }, { status: 403 });
    }
    const job = await JOBS.get(jobId, false);
    if (!job) {
      return NextResponse.json({
        status: "error",
        error: "任务不存在或已过期，请重试",
      });
    }
    if(job.status==="pending"&&dbEnabled){const owner=await JOBS.owner(jobId);if(owner&&await storedImageReview(jobId,owner))return NextResponse.json({status:"error",operationStatus:"needs_attention",reviewRequired:true,error:IMAGE_REVIEW_MESSAGE},{headers:{"cache-control":"private, no-store"}});}
    if (job.status === "done") {
      const notice = imageOutputNotice(job.imagegenOutputError, job.imagegenOutputWarning, !!job.images?.length);
      if(notice.error)return NextResponse.json({status:"error",error:notice.error,images:(job.images||[]).map(({execution,...image})=>image),creditsUsed:job.creditsUsed,user:job.user});
      return NextResponse.json({
        status: "done",
        ok: true,
        images: (job.images || []).map(({ execution, ...image }) => image),
        user: job.user,
        creditsUsed: job.creditsUsed,
        mock: job.mock,
        persisted: job.persisted,
        quality: job.quality,
        warnings: notice.warning ? [notice.warning] : undefined,
      });
    }
    if (imageJobPollState(job.status) === "error") {
      const owner = dbEnabled ? await JOBS.owner(jobId) : undefined;
      return NextResponse.json({ status: "error", error: job.error, reviewRequired: job.status === "needs_attention", user: owner ? await getUser(owner) : undefined });
    }
    return NextResponse.json({ status: "pending",...((job as {queueState?:string}).queueState?{operationStatus:"queued"}:{}), error: job.error || "" });
  }

  // 健康检查:绝不暴露模型名/上游供应商/密钥来源(铁律:绝不泄露所用模型)。
  const { apiKey } = await getOpenAISettings();
  return NextResponse.json({
    status: "ok",
    ready: !!apiKey,
    db: dbEnabled,
    storage: storageEnabled,
  });
}

export async function GET(request:Request){
  if(new URL(request.url).searchParams.get("job")?.startsWith("imagegen-")){
    const {withCreationReceiptRoute}=await import("@/lib/saas/creation-context");
    return withCreationReceiptRoute(request,()=>handleGet(request));
  }
  return handleGet(request);
}

async function createSubmission(request: Request) {
  return withBiRequest(request, () => handleObservedPost(request));
}

export async function POST(request:Request){
  const invalid = currentImagegenStep()?null:await canvasParameterError(request); if (invalid) return invalid;
  // Keep the original fingerprint for idempotent receipts. Only a new accepted action
  // resolves its frame, before withBiRequest freezes the model/price facts.
  return withBillingIntent(request,async()=>{
    if (currentImagegenStep() || imageWorkerAuthorized(request)) return createSubmission(request);
    if (dbEnabled && !await resolveUserEmail(request)) return NextResponse.json({error:"请先登录后再生成"},{status:401});
    try { return createSubmission(await normalizeLegacyFrameRequest(request)); }
    catch (error) { if(error instanceof LegacyFrameError)return NextResponse.json({error:error.message,code:"REFERENCE_FRAME_INVALID"},{status:400});throw error; }
  });
}
