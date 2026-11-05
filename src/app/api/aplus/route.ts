import { normalizeAplusFrameRequest } from "@/lib/imagegen/aplus-frame-request";
import { validCanvasRatio } from "@/lib/canvas/generation-parameters";
import { withBillingIntent } from "@/lib/billing/intent";
import { withBiRequest } from "@/lib/bi/request";
import { quoteForRequest } from "@/lib/billing/server";
import { assertQuotedVersion, requestQuoteConfirmation, billingErrorResponse } from "@/lib/billing/request";
import { imageRequestBilling } from "@/lib/image-quality-request";
import { imageWorkerAuthorized } from "@/lib/worker/authorization";
import { imageJobPollState } from "@/lib/image-job-failure";
import { NextResponse } from "next/server";
import { insufficientCreditsMessage } from "@/lib/commerce";
import { requestedTextModel } from "@/lib/text-models";
import { safeError } from "@/lib/api-error";
import { dbEnabled } from "@/platform/db/pool";
import { listArtworksByIds } from "@/lib/artworks/repository";
import { getUser } from "@/lib/accounts/session";
import { isBanned } from "@/lib/accounts/repository";
import { clientIp } from "@/lib/ip";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled } from "@/lib/object-storage/runtime";
import { getOpenAISettings } from "@/lib/settings";
import { getImageModelCatalog } from "@/lib/image-model-catalog";
import {APLUS_MODULES,JOBS,kickAplus,patchJob,ratioFor,sizeFor} from "@/lib/aplus/runtime";

export const runtime = "nodejs";

export const maxDuration = 300;

const APLUS_FORMATS = ["aplus-web", "aplus-mobile", "aplus-basic", "auto", "1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "4:5", "5:4", "1:2", "2:1", "21:9"];

async function parseInput(request: Request) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const prepared = (f.get("prepared") ?? "").toString() === "1";
  const images: { buf: Buffer; type: string }[] = [];
  for (const file of f.getAll("image")) {
    if (file instanceof File && file.size > 0) {
      images.push({
        buf: Buffer.from(await file.arrayBuffer()),
        type: file.type || "image/png",
      });
    }
    if (images.length >= (prepared ? 6 : 3)) break;
  }
  const rawModules = (f.getAll("module") as string[]).map((m) => m.trim());
  const modules = Array.from(new Set(rawModules)).filter((m) => APLUS_MODULES[m]);
  const format = (f.get("format") ?? "aplus-web").toString().trim();
  if (!APLUS_FORMATS.includes(format) && !validCanvasRatio(format)) return null;
  return {
    requestedQuality: f.get("quality") ?? undefined,
    billingVersion:f.get("billingVersion")??undefined,billingCredits:f.get("billingCredits")??undefined,
    images,
    extra: (f.get("text") ?? "").toString().trim().slice(0, 6000),
    platform: (f.get("platform") ?? "amazon").toString().trim().slice(0, 20),
    lang: (f.get("lang") ?? "auto").toString().trim().slice(0, 10),
    format,
    modules: modules.length > 0 ? modules : ["hero", "selling", "scene", "angles"],
    email: (f.get("email") ?? "").toString().trim(),
    prepared,
    parentId: (f.get("parentId") ?? "").toString().trim(),
    parentIds: (() => {
      try {
        const value = JSON.parse((f.get("parentIds") ?? "[]").toString());
        return Array.isArray(value)
          ? value.map(String).map((id) => id.trim()).filter(Boolean).slice(0, 5)
          : [];
      } catch {
        return [];
      }
    })(),
    origin: (f.get("origin") ?? "").toString().trim() === "canvas" ? "canvas" : "",
    model: (f.get("model") ?? "").toString().trim(),
  };
}

async function handleObservedPost(request: Request) {
  if (imageWorkerAuthorized(request)) {
    const body = await request.json();
    if (typeof body.workerJobId !== "string") return NextResponse.json({ error: "无效任务" }, { status: 400 });
    await kickAplus(body.workerJobId);
    return NextResponse.json({ ok: true });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as
      | { jobId?: string; action?: string; sourceIndex?: number; feedback?: string }
      | null;
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
    if (dbEnabled) {
      const tokenEmail=await resolveUserEmail(request);
      const owner=await JOBS.owner(jobId);
      if (!tokenEmail || owner!==tokenEmail.toLowerCase()) return NextResponse.json({error:"无权操作此任务"},{status:403});
    }
    const job = await JOBS.get(jobId,false);
    if (!job) return NextResponse.json({error:"任务不存在，请重新上传"},{status:404});

    if (body?.action === "approve_source") {
      const index = Number(body.sourceIndex);
      const source = job.sources[index];
      if (job.stage !== "reviewing" || !source?.url || !job.sourceBuffers[index]) {
        return NextResponse.json({ error: "这张母图当前无法通过" }, { status: 409 });
      }
      if (source.status === "redoing") {
        return NextResponse.json({ error: "这张母图正在重做" }, { status: 409 });
      }
      try {
        if(job.useDb) {
          const updated=await JOBS.reviewSource(jobId,index,false);
          return NextResponse.json({ok:true,source:updated});
        }
        job.sources[index]={...source,status:"approved",error:undefined};
        await patchJob(jobId,{sources:[...job.sources]});
        return NextResponse.json({ok:true,source:job.sources[index]});
      } catch(error) {return NextResponse.json({error:safeError(error,"审核保存失败，请重试")},{status:409});}

    }

    if (body?.action === "redo_source") {
      const index = Number(body.sourceIndex);
      const source = job.sources[index];
      const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0,500) : "";
      if (job.stage !== "reviewing" || !source || source.status === "redoing") {
        return NextResponse.json({ error: "这张母图当前无法重做" }, { status: 409 });
      }
      if (!feedback) {
        return NextResponse.json({ error: "请填写本张图片的重做要求" }, { status: 400 });
      }
      try {
        if(job.useDb) await JOBS.reviewSource(jobId,index,true,feedback);
        else {
          job.sources[index]={...source,status:"redoing",feedback,redoOperationId:`${jobId}:redo:${crypto.randomUUID()}`,error:undefined};
          await patchJob(jobId,{sources:[...job.sources]});
        }
        await kickAplus(jobId).catch(error=>console.error("[image-job] deferred kickoff:",error instanceof Error ? error.message : "unknown"));
        return NextResponse.json({ok:true});
      } catch(error) {return NextResponse.json({error:safeError(error,"重做保存失败，请重试")},{status:409});}

    }

    if (body?.action === "generate") {
      if (job.stage !== "reviewing" || job.generationStarted) {
        return NextResponse.json({ error: "任务已进入生成阶段" }, { status: 409 });
      }
      if (
        job.sources.some((source) => source.status !== "approved") ||
        job.sourceBuffers.some((buf) => !buf)
      ) {
        return NextResponse.json(
          { error: "请先通过全部白底母图" },
          { status: 409 }
        );
      }
      try {
        if (job.useDb) await JOBS.reserveReviewed(jobId);
        else await patchJob(jobId, { generationStarted:true, reserved:true, status:"pending", stage:"generating" });
        await kickAplus(jobId).catch(error=>console.error("[image-job] deferred kickoff:",error instanceof Error ? error.message : "unknown"));
      } catch (error) {
        return NextResponse.json({ error: safeError(error, "任务启动失败，请稍后重试") }, { status: 409 });
      }
      return NextResponse.json({ ok: true, jobId, total: job.modules.length, cost: job.cost });
    }

    return NextResponse.json({ error: "不支持的任务操作" }, { status: 400 });
  }

  const input = await parseInput(request).catch(() => null);
  if (!input || input.images.length === 0) {
    return NextResponse.json({ error: "请上传至少一张商品图" }, { status: 400 });
  }
  if (input.images.some((im) => im.buf.length > 12 * 1024 * 1024)) {
    return NextResponse.json(
      { error: "单张上传图片过大（请 < 12MB）" },
      { status: 400 }
    );
  }

  const { model: defaultModel } = await getOpenAISettings();
  const model = input.model || defaultModel;
  const imageModel = (await getImageModelCatalog()).find((item) => item.id === model);
  if (!imageModel) {
    return NextResponse.json(
      { error: "所选生图模型不可用，请刷新模型列表后重试" },
      { status: 400 }
    );
  }
  if (!imageModel.supportsEdit) {
    return NextResponse.json(
      { error: "详情图生成需要支持参考图的生图模型" },
      { status: 400 }
    );
  }
  // Reject unsupported native size before creating a new paid job. Historical
  // JSON actions bypass new-submission parsing and keep their frozen contract.
  try { sizeFor(input.format, model, true, true); }
  catch (error) { return NextResponse.json({ error: safeError(error, "所选模型不支持该画幅"), code: "APLUS_FRAME_UNSUPPORTED" }, { status: 400 }); }
  const ip = clientIp(request);

  if (dbEnabled) {
    const tokenEmail = await resolveUserEmail(request);
    if (!tokenEmail) {
      return NextResponse.json({ error: "请先登录后再生成" }, { status: 401 });
    }
    input.email = tokenEmail;
  }
  const useDb = dbEnabled && input.email.length > 0;
  const billing = await imageRequestBilling(request, input.requestedQuality);
  const billingQuote=useDb?await quoteForRequest(request,{feature:"image.aplus",quantity:input.modules.length,quality:billing.quality.requested||"medium",resolution:"1K",ratio:ratioFor(input.format),modelId:model}):undefined;
  if(billingQuote)assertQuotedVersion(requestQuoteConfirmation(request,input),billingQuote);
  const cost = billingQuote?.requestedCredits??input.modules.length * billing.cost;

  if (input.prepared && useDb) {
    const lineageIds = Array.from(
      new Set([input.parentId, ...input.parentIds].filter(Boolean))
    );
    const owned = await listArtworksByIds(input.email, lineageIds).catch(() => []);
    if (!input.parentId || owned.length !== lineageIds.length) {
      return NextResponse.json(
        { error: "参考节点不存在或无权访问" },
        { status: 400 }
      );
    }
    const groups = new Set(owned.map((artwork) => artwork.groupId || artwork.id));
    if (groups.size !== 1) {
      return NextResponse.json(
        { error: "详情图参考只能来自同一画布项目" },
        { status: 400 }
      );
    }
  }

  if (dbEnabled && (await isBanned(input.email, ip))) {
    return NextResponse.json(
      { error: "账号或 IP 已被封禁，请联系管理员" },
      { status: 403 }
    );
  }
  if (useDb) {
    const account = await getUser(input.email).catch(() => null);
    const balance = account
      ? account.creditsTotal - account.creditsUsed
      : 0;
    if (account && balance < cost) {
      return NextResponse.json({ error: insufficientCreditsMessage }, { status: 402 });
    }
  }

  const jobId = `aplus-${crypto.randomUUID()}`;
  const now = Date.now();
  try {
  await JOBS.create(jobId, input.email, {
    status: "pending",
    stage: input.prepared ? "generating" : "preparing",
    quality: billing.quality,
    imageQuality: billing.quality.executed,
    sources: input.images.map((_, index) => ({
      id: `aplus-source-${now}-${index}`,
      label: input.prepared ? `参考图 ${index + 1}` : `白底母图 ${index + 1}`,
      status: input.prepared ? "approved" : "preparing",
      version: input.prepared ? 1 : 0,
    })),
    sourceInputs: input.images,
    sourceBuffers: input.prepared ? input.images.map((image) => image.buf) : input.images.map(() => null),
    sourceHistory: input.images.map(() => []),
    shots: [],
    done: 0,
    total: input.modules.length,
    extra: input.extra,
    platform: input.platform,
    lang: input.lang,
    format: input.format,
    frameVersion: 2,
    modules: input.modules,
    email: input.email,
    model,
    textModel: requestedTextModel(request, process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna"),
    useDb,
    cost,
    generationStarted: input.prepared,
    reserved: input.prepared,
    parentId: input.parentId,
    parentIds: input.parentIds.filter((id) => id !== input.parentId),
    origin: input.origin,
    entry: request.headers.get("x-naumi-client-entry") === "agent" ? "agent" : "toolbox",
    createdAt: now,
  }, {}, cost, input.prepared || !!billingQuote?.imagePreset,billingQuote);
  } catch(error) {
    const message=error instanceof Error ? error.message : "";
    return NextResponse.json({error:safeError(error,"任务保存失败，请稍后重试")},{status:message.includes("积分不足") ? 402 : 503});
  }
  await kickAplus(jobId).catch(error=>console.error("[image-job] deferred kickoff:",error instanceof Error ? error.message : "unknown"));

  return NextResponse.json({
    jobId,
    total: input.modules.length,
    cost,
    quality: billing.quality,
    next: input.prepared ? "generating" : "review_sources",
  });
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("active")) {
    const email = await resolveUserEmail(request);
    if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    return NextResponse.json({ jobs: await JOBS.active(email) });
  }
  const jobId = new URL(request.url).searchParams.get("job");
  if (!jobId) {
    const { apiKey } = await getOpenAISettings();
    return NextResponse.json({
      status: "ok",
      ready: !!apiKey,
      db: dbEnabled,
      storage: storageEnabled,
    });
  }
  const job = await JOBS.get(jobId, false);
  if (!job) {
    return NextResponse.json({
      status: "error",
      operationStatus: "needs_attention", reviewRequired: true,
      error: "任务记录暂未找到，请稍后检查原任务",
    }, { status: 404 });
  }
  if (job.useDb) {
    const tokenEmail = await resolveUserEmail(request);
    if (!tokenEmail || tokenEmail.toLowerCase() !== job.email.toLowerCase()) {
      return NextResponse.json({ error: "无权查看此任务" }, { status: 403 });
    }
  }
  const shots = job.shots.map((s) => ({
    id: s.id,
    role: s.role,
    label: s.label,
    ratio: s.ratio,
    width: s.width, height: s.height,
    status: s.status,
    url: s.url ?? null,
    gradient: s.gradient,
    quality: s.quality,
  }));
  return NextResponse.json({
    jobId,
    status: job.status === "done" && (job.frameError || job.shots.some(shot => shot.status === "error")) ? "error" : imageJobPollState(job.status),
    operationStatus: job.status,
    reviewRequired: String(job.status) === "needs_attention",
    stage: job.stage,
    parameters: { platform:job.platform, lang:job.lang, format:job.format, text:job.extra, modules:job.modules },
    sources: job.sources.map((source, index) => ({
      ...source,
      history: job.sourceHistory[index],
    })),
    done: job.done,
    total: job.total,
    shots,
    user: job.status === "done" ? job.user : imageJobPollState(job.status) === "error" && job.useDb ? await getUser(job.email) : undefined,
    creditsUsed: job.status === "done" ? job.creditsUsed : undefined,
    quality: job.quality,
    cost: job.cost,
    error: job.error || job.frameError || (job.status === "done" && job.shots.some(shot => shot.status === "error") ? "部分详情图未生成，已有结果已保留" : undefined),
  });
}

async function createSubmission(request: Request) {
  try {
    let normalized: Request;
    try { normalized = await normalizeAplusFrameRequest(request); }
    catch (error) { return NextResponse.json({ error: safeError(error, "参考素材的画幅读取失败"), code: "APLUS_FRAME_INVALID" }, { status: 400 }); }
    return await withBiRequest(normalized, () => handleObservedPost(normalized));
  } catch(e) { return billingErrorResponse(e); }
}

export async function POST(request:Request){return withBillingIntent(request,()=>createSubmission(request));}
