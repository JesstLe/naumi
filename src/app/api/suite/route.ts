import { withBillingIntent } from "@/lib/billing/intent";
import { withBiRequest } from "@/lib/bi/request";
import { quoteForRequest } from "@/lib/billing/server";
import { assertQuotedVersion, requestQuoteConfirmation, billingErrorResponse } from "@/lib/billing/request";
import { imageRequestBilling } from "@/lib/image-quality-request";
import { imageWorkerAuthorized } from "@/lib/worker/authorization";
import { imageJobPollState } from "@/lib/image-job-failure";
import { NextResponse } from "next/server";
import { safeError } from "@/lib/api-error";
import { dbEnabled } from "@/platform/db/pool";
import { getUser } from "@/lib/accounts/session";
import { isBanned } from "@/lib/accounts/repository";
import { clientIp } from "@/lib/ip";
import { resolveUserEmail } from "@/lib/admin-auth";
import { storageEnabled } from "@/lib/storage";
import { getOpenAISettings } from "@/lib/settings";
import { requestedTextModel } from "@/lib/text-models";
import {JOBS,kickSuite,type RequestedShot,type ShotRole} from "@/lib/suite/runtime";

export const runtime = "nodejs";

export const maxDuration = 300;

async function parseInput(request: Request) {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const images: { buf: Buffer; type: string }[] = [];
  for (const file of f.getAll("image")) {
    if (file instanceof File && file.size > 0) {
      images.push({
        buf: Buffer.from(await file.arrayBuffer()),
        type: file.type || "image/png",
      });
    }
    if (images.length >= 4) break;
  }
  const structure = (f.get("structure") ?? "auto").toString() === "custom"
    ? "custom"
    : "auto";
  const roleSet = new Set<ShotRole>(["main", "sub", "detail"]);
  const ratioSet = new Set(["1:1", "3:4", "4:3", "16:9", "9:16"]);
  let customShots: RequestedShot[] = [];
  if (structure === "custom") {
    try {
      const raw = JSON.parse((f.get("shots") ?? "[]").toString()) as unknown[];
      customShots = raw.slice(0, 20).flatMap((value, index) => {
        if (!value || typeof value !== "object") return [];
        const item = value as Record<string, unknown>;
        const role = roleSet.has(item.role as ShotRole)
          ? (item.role as ShotRole)
          : "sub";
        const ratio = ratioSet.has(String(item.ratio))
          ? String(item.ratio)
          : role === "detail"
            ? "3:4"
            : "1:1";
        const label = String(item.label ?? "").trim().slice(0, 40);
        const instruction = String(item.instruction ?? "").trim().slice(0, 240);
        return [{
          role,
          ratio,
          label: label || `自定义图片 ${index + 1}`,
          ...(instruction ? { instruction } : {}),
        }];
      });
    } catch {
      customShots = [];
    }
  }
  return {
    requestedQuality: f.get("quality") ?? undefined,
    billingVersion:f.get("billingVersion")??undefined,billingCredits:f.get("billingCredits")??undefined,
    images,
    extra: (f.get("text") ?? "").toString().trim().slice(0, 600),
    platform: (f.get("platform") ?? "taobao").toString().trim().slice(0, 20),
    email: (f.get("email") ?? "").toString().trim(),
    structure,
    customShots,
  };
}

async function handleObservedPost(request: Request) {
  if (imageWorkerAuthorized(request)) {
    const body = await request.json();
    if (typeof body.workerJobId !== "string") return NextResponse.json({ error: "无效任务" }, { status: 400 });
    await kickSuite(body.workerJobId);
    return NextResponse.json({ ok: true });
  }
  const input = await parseInput(request).catch(() => null);
  if (!input || input.images.length === 0) {
    return NextResponse.json({ error: "请上传至少一张产品图" }, { status: 400 });
  }
  if (input.images.some((im) => im.buf.length > 12 * 1024 * 1024)) {
    return NextResponse.json(
      { error: "单张上传图片过大（请 < 12MB）" },
      { status: 400 }
    );
  }
  if (
    input.images.some(
      (im) => !/^image\/(png|jpeg|webp)$/i.test(im.type)
    )
  ) {
    return NextResponse.json(
      { error: "当前仅支持 PNG、JPG、WebP 产品图" },
      { status: 400 }
    );
  }
  if (input.structure === "custom" && input.customShots.length === 0) {
    return NextResponse.json(
      { error: "自定义配置至少保留一张图片" },
      { status: 400 }
    );
  }

  const { apiKey, model } = await getOpenAISettings();
  const ip = clientIp(request);


  // 生产环境必须凭有效登录态:用 token 里的 email 作准,不信任请求体 email。
  if (dbEnabled) {
    const tokenEmail = await resolveUserEmail(request);
    if (!tokenEmail) {
      return NextResponse.json(
        { error: "请先登录后再生成" },
        { status: 401 }
      );
    }
    input.email = tokenEmail;
  }
  const useDb = dbEnabled && input.email.length > 0;
  // 与前端统一最多 4 张；超出部分在解析阶段截断，防绕过前端多传图。
  const requested = input.structure === "custom" ? input.customShots : null;
  const SHOT_COUNT = requested?.length ?? 13;
  const billing = await imageRequestBilling(request, input.requestedQuality);
  const billingQuote=useDb?await quoteForRequest(request,{feature:"image.suite",quantity:SHOT_COUNT,quality:billing.quality.requested||"medium",resolution:"1K",modelId:model}):undefined;
  if(billingQuote)assertQuotedVersion(requestQuoteConfirmation(request,input),billingQuote);
  const cost = billingQuote?.requestedCredits??SHOT_COUNT * billing.cost;

  if (dbEnabled && (await isBanned(input.email, ip))) {
    return NextResponse.json(
      { error: "账号或 IP 已被封禁，请联系管理员" },
      { status: 403 }
    );
  }
  const jobId = `suite-${crypto.randomUUID()}`;
  try {
  await JOBS.create(jobId, input.email, {
    cost, quality: billing.quality, imageQuality: billing.quality.executed, entry: request.headers.get("x-naumi-client-entry") === "agent" ? "agent" : "toolbox",
    status: "pending", shots: [], done: 0, total: SHOT_COUNT, createdAt: Date.now(), owner: input.email,
  }, { ...input, requested, model, cost, textModel: requestedTextModel(request, process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna") }, cost, true,billingQuote);
  } catch(error) {
    const message=error instanceof Error ? error.message : "";
    return NextResponse.json({error:safeError(error,"任务保存失败，请稍后重试")},{status:message.includes("积分不足") ? 402 : 503});
  }
  await kickSuite(jobId).catch(error=>console.error("[image-job] deferred kickoff:",error instanceof Error ? error.message : "unknown"));

  return NextResponse.json({ jobId, total: SHOT_COUNT, cost });
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("active")) {
    const email = await resolveUserEmail(request);
    if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    return NextResponse.json({ jobs: await JOBS.active(email) });
  }
  const jobId = new URL(request.url).searchParams.get("job");
  if (!jobId) {
    // 健康检查:绝不暴露模型名/上游供应商(铁律:绝不泄露所用模型)。
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
      error: "任务不存在或已过期，请重试",
    });
  }
  if (dbEnabled) {
    const email = await resolveUserEmail(request);
    if (!email || email.toLowerCase() !== job.owner.toLowerCase()) {
      return NextResponse.json({ error: "无权查看此任务" }, { status: 403 });
    }
  }
  // 公开字段:不回 prompt 全文(太长),只给前端要的展示数据
  const shots = job.shots.map((s) => ({
    id: s.id,
    role: s.role,
    label: s.label,
    ratio: s.ratio,
    status: s.status,
    url: s.url ?? null,
    gradient: s.gradient,
    quality: s.quality,
  }));
  return NextResponse.json({
    status: imageJobPollState(job.status),
    done: job.done,
    total: job.total,
    shots,
    user: job.status === "done" ? job.user : imageJobPollState(job.status) === "error" && dbEnabled ? await getUser(job.owner) : undefined,
    creditsUsed: job.status === "done" ? job.creditsUsed : undefined,
    quality: job.quality,
    cost: job.cost,
    mock: job.mock,
    error: job.error,
  });
}

async function createSubmission(request: Request) {
  try{return await withBiRequest(request, () => handleObservedPost(request));}catch(e){return billingErrorResponse(e)}
}

export async function POST(request:Request){return withBillingIntent(request,()=>createSubmission(request));}
