import {normalizeLegacyFrameRequest, LegacyFrameError} from "@/lib/imagegen/legacy-frame-request";
import {currentImagegenStep} from "@/lib/imagegen/context";
import {canvasParameterError} from "@/lib/canvas/generation-parameters";
import {withBillingIntent} from "@/lib/billing/intent";
import {withBiRequest} from "@/lib/bi/request";
import {quoteForRequest} from "@/lib/billing/server";
import { imageWorkerAuthorized } from "@/lib/worker/authorization";
import {NextResponse} from "next/server";
import {provenanceEntry} from "@/lib/artwork-provenance";
import {dbEnabled} from "@/platform/db/pool";
import {clientIp} from "@/lib/ip";
import {resolveUserEmail} from "@/lib/admin-auth";
import type {GenParams,GenImage} from "@/lib/imagegen/generation-types";
export type {GeneratedImage} from "@/lib/imagegen/generation-types";
import {submitGeneration} from "@/lib/imagegen/generation-submission";
import {kickGeneration} from "@/lib/imagegen/generation-runtime";
import {notifyImagegenJobReleased} from "@/lib/imagegen/dispatch";

import {readGeneration} from "@/lib/imagegen/generation-query";

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
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new Error("请求格式不正确");
  // Never persist user JSON objects into textual fields: they can impersonate
  // the internal checkpoint representation when a durable payload is resumed.
  for (const key of ["prompt","userPrompt","category","ratio","resolution","style","quality","email","parentId","templateId","templateImage","templatePrompt","origin","entry","projectGroupId","model"] as const) {
    if (j[key] != null && typeof j[key] !== "string") throw new Error("请求格式不正确");
  }
  if (j.parentIds != null && (!Array.isArray(j.parentIds) || !j.parentIds.every(id => typeof id === "string"))) throw new Error("请求格式不正确");
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

async function handleObservedPost(request: Request, authenticatedActor?:string|null) {
  if(imageWorkerAuthorized(request)){
    const body=await request.json();
    if(typeof body.workerJobId!=="string")return NextResponse.json({error:"无效任务"},{status:400});
    await kickGeneration(body.workerJobId,notifyImagegenJobReleased);return NextResponse.json({ok:true});
  }
  let input:GenParams|null;
  try{input=await parseParams(request);}catch{return NextResponse.json({error:"请求格式不正确"},{status:400});}
  if(!input)return NextResponse.json({error:"请求格式不正确"},{status:400});
  const result=await submitGeneration(input,{
    actor:()=>dbEnabled?(authenticatedActor===undefined?resolveUserEmail(request):Promise.resolve(authenticatedActor)):Promise.resolve(null),
    ip:clientIp(request),featureModel:request.headers.get("x-naumi-feature-model"),
    quote:(facts,options)=>quoteForRequest(request,facts,undefined,options,authenticatedActor),
  });
  return NextResponse.json(result.body,{status:result.status});
}

async function handleGet(request:Request,authenticatedActor?:string|null){
  const params=new URL(request.url).searchParams;
  const result=await readGeneration({active:params.has("active"),jobId:params.get("job"),actor:()=>authenticatedActor===undefined?resolveUserEmail(request):Promise.resolve(authenticatedActor)});
  return NextResponse.json(result.body,{status:result.status,headers:result.headers});
}

export async function GET(request:Request){
  if(new URL(request.url).searchParams.get("job")?.startsWith("imagegen-")){
    const {withCreationReceiptRoute}=await import("@/lib/saas/creation-context");
    return withCreationReceiptRoute(request,actor=>handleGet(request,actor));
  }
  return handleGet(request);
}

async function createSubmission(request: Request,authenticatedActor?:string|null) {
  return withBiRequest(request, actor => handleObservedPost(request,actor), authenticatedActor);
}

export async function POST(request:Request){
  const invalid = currentImagegenStep()?null:await canvasParameterError(request); if (invalid) return invalid;
  // Keep the original fingerprint for idempotent receipts. Only a new accepted action
  // resolves its frame, before withBiRequest freezes the model/price facts.
  return withBillingIntent(request,async authenticatedActor=>{
    if (currentImagegenStep() || imageWorkerAuthorized(request)) return createSubmission(request);
    const actor=authenticatedActor===undefined?(dbEnabled?await resolveUserEmail(request):null):authenticatedActor;
    if (dbEnabled && !actor) return NextResponse.json({error:"请先登录后再生成"},{status:401});
    try { return createSubmission(await normalizeLegacyFrameRequest(request),actor); }
    catch (error) { if(error instanceof LegacyFrameError)return NextResponse.json({error:error.message,code:"REFERENCE_FRAME_INVALID"},{status:400});throw error; }
  });
}
