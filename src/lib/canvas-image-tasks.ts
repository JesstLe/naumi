import { runPostprocess } from "./media-postprocess";
import { resolveConfiguredImageQuality } from "@/lib/model-config/image-quality";
import "server-only";
import { currentModelExecution, currentExecutionBundle, runLegacyModelExecution, type ExecutionBundle } from "@/lib/model-config/context";
import { withFrozenExecutionBundle } from "@/lib/model-config/execution";
import { withModelRequest, modelConfigurationEnabled } from "@/lib/model-config/requests";
import {quoteForActor} from "@/lib/billing/server";
import {assertQuotedVersion,requestQuoteConfirmation} from "@/lib/billing/request";
import { resolveImageQuality, type ResolvedImageQuality } from "@/lib/image-quality";
import { imageQualityCost, auditSettledImage } from "@/lib/image-quality-request";

import { createHash } from "node:crypto";
import sharp from "sharp";

import {
  addArtworks,
  beginCanvasImageTaskSubmission,
  saveCanvasImageTaskProviderResult,
  holdCanvasImageTask,
  claimNextCanvasImageTask,
  completeCanvasImageTask,
  createCanvasImageTaskWithReservation,
  dbEnabled,
  failCanvasImageTask,
  getCanvasImageTask,
  getCanvasImageTaskChargedCredits,
  listArtworksByIds,
  listCanvasImageTasks,
  retryCanvasImageTask,
  updateCanvasImageTaskProgress,
  type CanvasImageTaskRow,
} from "@/lib/db";
import { supabaseEnabled } from "@/lib/auth-mode";
import { creditsMeteringOn, multiUserEnabled } from "@/lib/native-auth";
import { readCanvasImage } from "@/lib/canvas-image-input";
import { editImage } from "@/lib/image-edit";
import { storageEnabled, uploadImage } from "@/lib/storage";
import { safeError } from "@/lib/api-error";
import { ImageOperationPending } from "@/lib/image-gateway";

type Box = { x: number; y: number; width: number; height: number };
export type TextEditTaskInput = {
  quality?: string;
  artworkId: string;
  oldText: string;
  newText: string;
  box: Box;
  /** Suggested result-node position captured at enqueue time for refresh restore. */
  canvasX?: number;
  canvasY?: number;
  /** Client-generated idempotency token. It is not forwarded to the image model. */
  operationId?: string;
};

function normalizedInput(value: Partial<TextEditTaskInput>): TextEditTaskInput {
  const canvasX = value.canvasX == null ? Number.NaN : Number(value.canvasX);
  const canvasY = value.canvasY == null ? Number.NaN : Number(value.canvasY);
  return {
    quality: typeof value.quality === "string" ? value.quality.trim().toLowerCase() : "medium",
    artworkId: String(value.artworkId || "").trim(),
    oldText: String(value.oldText || "").trim().slice(0, 300),
    newText: String(value.newText || "").trim().slice(0, 300),
    box: {
      x: Number(value.box?.x),
      y: Number(value.box?.y),
      width: Number(value.box?.width),
      height: Number(value.box?.height),
    },
    ...(Number.isFinite(canvasX) ? { canvasX } : {}),
    ...(Number.isFinite(canvasY) ? { canvasY } : {}),
    ...(String(value.operationId || "").trim()
      ? { operationId: String(value.operationId).trim().slice(0, 160) }
      : {}),
  };
}

function validateInput(input: TextEditTaskInput): void {
  if (!input.artworkId || !input.oldText || !input.newText || input.oldText === input.newText) {
    throw new Error("请选择文字并输入不同的新内容");
  }
  if (![input.box.x, input.box.y, input.box.width, input.box.height].every(Number.isFinite) || input.box.width <= 0 || input.box.height <= 0) {
    throw new Error("OCR 文字坐标无效");
  }
}

function clampBox(box: Box, imageWidth: number, imageHeight: number) {
  const padding = Math.max(4, Math.round(Math.max(box.width, box.height) * 0.12));
  const x = Math.max(0, Math.min(imageWidth - 1, Math.round(box.x) - padding));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.round(box.y) - padding));
  const right = Math.max(x + 1, Math.min(imageWidth, Math.round(box.x + box.width) + padding));
  const bottom = Math.max(y + 1, Math.min(imageHeight, Math.round(box.y + box.height) + padding));
  return { x, y, width: right - x, height: bottom - y };
}

function editSize(width: number, height: number) {
  const ratio = width / height;
  return ratio > 1.2 ? "1536x1024" as const : ratio < 0.83 ? "1024x1536" as const : "1024x1024" as const;
}

export async function enqueueTextEditTask(email: string, raw: Partial<TextEditTaskInput>,request?:Request): Promise<CanvasImageTaskRow> {
  if (!dbEnabled) throw new Error("后台图片任务需要数据库支持");
  const input = normalizedInput(raw);
  validateInput(input);
  const artwork = (await listArtworksByIds(email, [input.artworkId]))[0];
  if (!artwork) throw new Error("图片不存在或无权访问");
  if (!currentModelExecution("image") && await modelConfigurationEnabled()) {
    const effective = new Request("http://localhost/api/canvas/image-tasks", { method: "POST", headers: { ...(request ? Object.fromEntries(request.headers.entries()) : {}), "content-type": "application/json" }, body: JSON.stringify({ ...raw, artworkId: artwork.id, resolution: artwork.resolution || "1K" }) });
    return withModelRequest(effective, () => enqueueTextEditTask(email, raw, request));
  }
  const quality = resolveConfiguredImageQuality(input.quality);
  const billingQuote=await quoteForActor(email,{feature:"canvas.image",quantity:1,quality:quality.requested||"medium",resolution:artwork.resolution||"1K"});
  if(request)assertQuotedVersion(requestQuoteConfirmation(request,raw as {billingVersion?:unknown;billingCredits?:unknown}),billingQuote);
  const cost = billingQuote.requestedCredits;
  const operationId = String(input.operationId || "").trim();
  const id = operationId
    ? `imgtask-${createHash("sha256").update(`${email.toLowerCase()}:${operationId}`).digest("hex").slice(0, 32)}`
    : `imgtask-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const metered = billingQuote.facts.metered;
  const { task } = await createCanvasImageTaskWithReservation({
    billingQuote,
    id,
    email,
    sourceArtworkId: artwork.id,
    parameters: { ...input, billingResolution: artwork.resolution || "1K", qualityAudit: quality, paidOperationVersion: 1, ...(currentExecutionBundle() ? { modelExecutions: structuredClone(currentExecutionBundle()) } : {}) },
    cost,
    metered,
  });
  return task;
}

async function renderTextEdit(task: CanvasImageTaskRow): Promise<string> {
  if (task.parameters.paidOperationVersion !== 1) {
    throw new ImageOperationPending(task.id, new Error("旧版本图片提交需要核查"));
  }
  const input = normalizedInput(task.parameters as Partial<TextEditTaskInput>);
  validateInput(input);
  const artwork = (await listArtworksByIds(task.email, [task.sourceArtworkId]))[0];
  if (!artwork) throw new Error("源图片已不存在");
  const requestOrigin = String(process.env.INTERNAL_APP_ORIGIN || process.env.NAUMI_APP_ORIGIN || "http://127.0.0.1:3000");
  const image = await readCanvasImage(artwork.image, requestOrigin);
  const original = await sharp(image.buffer).rotate().png().toBuffer();
  const metadata = await sharp(original).metadata();
  const width = metadata.width || artwork.width || 0;
  const height = metadata.height || artwork.height || 0;
  if (!width || !height) throw new Error("无法读取图片尺寸");
  const box = clampBox(input.box, width, height);
  const clear = await sharp({
    create: { width: box.width, height: box.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  }).png().toBuffer();
  const mask = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  }).composite([{ input: clear, left: box.x, top: box.y, blend: "dest-out" }]).png().toBuffer();
  await updateCanvasImageTaskProgress(task.id, 20);
  const location = `原图 ${width}×${height} 像素中的矩形区域：x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`;
  const prompt = [
    "任务：编辑图片，只修改指定区域的文字，图片其余所有画面100%保持原样，不要改动产品、光影、材质、背景。",
    "要求：字体风格、颜色、光影、质感、透视和原图完全匹配。",
    `需要修改的区域：${location}`,
    `旧文字：${input.oldText}`,
    `新文字：${input.newText}`,
    "禁止改动其他任何元素，不要增加物体，不要改变背景、产品包装、3D数字。",
  ].join("\n");
  const quality: ResolvedImageQuality = (task.parameters.qualityAudit as ResolvedImageQuality | undefined) ?? {requested: "high", executed: "high", fallbackReason: null};
  let editedRaw: Buffer;
  if (typeof task.parameters.upstreamResult === "string") {
    editedRaw = (await readCanvasImage(task.parameters.upstreamResult, requestOrigin)).buffer;
  } else {
    if (!await beginCanvasImageTaskSubmission(task.id)) throw new ImageOperationPending(task.id, new Error("上游提交需要核查"));
    editedRaw = await withBiModelContext(task.email,"canvas-text-edit",task.id,()=>editImage({ operationId: task.id, legacyOperationId: !task.parameters.qualityAudit, images: [original], mask, prompt, size: editSize(width, height), quality }));
    const checkpoint = storageEnabled
      ? await uploadImage(new Uint8Array(editedRaw), "image/png", `canvas-text-edits/${task.id}-provider.png`)
      : `data:image/png;base64,${editedRaw.toString("base64")}`;
    await saveCanvasImageTaskProviderResult(task.id, checkpoint, quality);
  }
  await updateCanvasImageTaskProgress(task.id, 82);
  const scope = currentModelExecution("image"), post = scope?.businessOption?.postprocess;
  const processed = post?.enabled ? await runPostprocess({ id: `${task.id}:postprocess`,parentId:task.id,email:task.email,modelVersion:scope!.frozen.modelVersion,bytes:editedRaw,policy:post }) : null;
  const edited = processed ? (await readCanvasImage(processed.url, requestOrigin)).buffer : await sharp(editedRaw).resize(width, height, { fit: "fill" }).png().toBuffer();
  const artworkId = `txtedit-${task.id}`;
  let url = `data:image/png;base64,${edited.toString("base64")}`;
  if (storageEnabled) url = await uploadImage(new Uint8Array(edited), "image/png", `canvas-text-edits/${artworkId}.png`);
  await addArtworks(task.email, [{
    id: artworkId,
    title: `${artwork.title || "图片"} · 改字`,
    category: "canvas-text-edit",
    prompt,
    status: "completed",
    image: url,
    gradient: artwork.gradient || "from-slate-100 to-sky-100",
    style: artwork.style ?? null,
    ratio: artwork.ratio ?? null,
    resolution: artwork.resolution ?? "1K",
    source: artwork.image,
    parentId: artwork.id,
    parentIds: [],
    groupId: artwork.groupId || undefined,
    origin: "canvas",
    width: processed?.width || width,
    height: processed?.height || height,
    processingKind: processed?.kind || "base",
    postprocessStatus: processed?.status || "succeeded",
  }], `txtedit-${task.id}`);
  await completeCanvasImageTask({ id: task.id, email: task.email, resultArtworkId: artworkId });
  await auditSettledImage(task.email, await getCanvasImageTaskChargedCredits(task.id), quality, task.id, artworkId, String(task.parameters.billingResolution || "1K"));
  return artworkId;
}

export async function processCanvasImageTask(task: CanvasImageTaskRow): Promise<void> {
  try {
    const bundle = task.parameters.modelExecutions as ExecutionBundle | undefined;
    if (bundle) await withFrozenExecutionBundle(bundle, () => renderTextEdit(task));
    else await runLegacyModelExecution(() => renderTextEdit(task));
    console.info(`[canvas-image-task] completed id=${task.id} attempt=${task.attempts}`);
  } catch (error) {
    const current = await getCanvasImageTask(task.email, task.id);
    if (current?.parameters.upstreamResult) {
      await holdCanvasImageTask(task.id, "图片结果已保留，完成或账务结算需要核查；补足积分后可恢复已有结果");
      return;
    }
    const status = (error as { status?: number } | null)?.status;
    const rejected = [400,401,403,404,422,429].includes(status || 0);
    if (error instanceof ImageOperationPending || (current?.parameters.upstreamStarted && !current.parameters.upstreamResult && !rejected)) {
      await holdCanvasImageTask(task.id, "图片提交结果需要核查，已暂停自动重试，请联系管理员查询任务");
      return;
    }
    if (rejected && current?.parameters.upstreamStarted && !current.parameters.upstreamResult) {
      await failCanvasImageTask({ id: task.id, email: task.email, error: "上游拒绝了图片编辑请求，请检查配置" });
      return;
    }
    const message = safeError(error, "在线改字失败，请稍后重试");
    console.error(`[canvas-image-task] failed id=${task.id} attempt=${task.attempts}: ${error instanceof Error ? error.message : String(error)}`);
    if (task.attempts < 3) {
      await retryCanvasImageTask({ id: task.id, email: task.email, error: message, delaySeconds: task.attempts * 8 });
    } else {
      await failCanvasImageTask({ id: task.id, email: task.email, error: message });
    }
  }
}

export async function recoverCanvasImageTasks(limit = 2): Promise<number> {
  let processed = 0;
  for (let index = 0; index < Math.min(Math.max(limit, 1), 5); index += 1) {
    const task = await claimNextCanvasImageTask();
    if (!task) break;
    await processCanvasImageTask(task);
    processed += 1;
  }
  return processed;
}

export { getCanvasImageTask, listCanvasImageTasks };

/** Public task view excludes provider submission checkpoints and raw results. */
export function publicCanvasImageTask(task: CanvasImageTaskRow) {
  const { id, kind, sourceArtworkId, status, progress, cost, resultArtworkId, error, attempts, createdAt, completedAt } = task;
  return { quality: task.parameters.qualityAudit, id, kind, sourceArtworkId, status, progress, cost, resultArtworkId, error, attempts, createdAt, completedAt,
    parameters: normalizedInput(task.parameters as Partial<TextEditTaskInput>) };
}
import { withBiModelContext } from "@/lib/bi/model-observer";
