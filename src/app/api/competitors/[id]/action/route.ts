import {withBillingRequest} from "@/lib/billing/synchronous";
import {currentSynchronousBilling} from "@/lib/billing/synchronous-operation";
import {withBiRequest} from "@/lib/bi/request";
import { imageRequestBilling } from "@/lib/image-quality-request";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { actionSchema, currentImage, REGION_LABELS } from "@/lib/competitor-types";
import { competitorActor, competitorError, ownedCompetitor, readCompetitorImage, analyzeCompetitor, checkVersion, WorkspaceError } from "@/lib/competitor-server";
import {reserveCredits, refundCredits} from "@/lib/billing/legacy-credit-reservation";
import {claimCompetitorItem, releaseCompetitorItem, saveCompetitorItem} from "@/lib/competitor/repository";
import {finishCompetitorGeneration} from "@/lib/competitor/completion";
import {addReservation, settleReservation, sweepStaleReservations} from "@/lib/billing/reservations";
import {getUser} from "@/lib/accounts/session";
import {creditsMeteringOn} from "@/lib/billing/metering";
import {multiUserEnabled} from "@/lib/accounts/mode";
import { supabaseEnabled } from "@/lib/auth-mode";
import { regionMask, preserveOutsideMask } from "@/lib/competitor-image";
import { editImage } from "@/lib/image-edit";
import { uploadImage } from "@/lib/media-upload";
import { rateLimit } from "@/lib/rate-limit";
import { requestedTextModel } from "@/lib/text-models";

export const runtime = "nodejs";
export const maxDuration = 300;
async function handleObservedPost(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let email = ""; let lease = ""; let reserved = false;
  let cost = 0;
  try {
    email = await competitorActor(req);
    const parsed = actionSchema.safeParse(await req.json());
    if (!parsed.success) throw new WorkspaceError("操作、提示词或选区格式不正确");
    const body = parsed.data;
    if (body.action === "analyze" && !rateLimit(`competitor:${body.action}:${email}`, body.action === "analyze" ? 120 : 40, 600000)) throw new WorkspaceError("操作过于频繁，请稍后重试", 429);
    const original = await ownedCompetitor(email, (await params).id);
    checkVersion(original, body.activeVersion);
    if (body.action !== "analyze" && original.versions.length >= 100) throw new WorkspaceError("该图已达到 100 个历史版本，请导入新副本继续");
    if (body.action === "replicate" && !body.prompt.trim()) throw new WorkspaceError("请先反推或填写提示词");
    const selected = body.regions.filter(r => r.enabled);
    if (body.action === "edit" && (!selected.length || selected.some(r => r.kind !== "color" && !r.instruction.trim()))) throw new WorkspaceError("请启用选区并填写每个选区的修改要求");
    const product = body.productId ? await ownedCompetitor(email, body.productId) : null;
    const jobId = randomUUID();
    const item = await claimCompetitorItem(email, (await params).id, body.revision, jobId);
    if (!item) throw new WorkspaceError("图片正在处理或已更新，请重新加载", 409);
    lease = jobId;
    Object.assign(item, { prompt: body.prompt, regions: body.regions, activeVersion: body.activeVersion });
    const source = await readCompetitorImage(currentImage(item));
    if (body.action === "analyze") {
      const analysis = await analyzeCompetitor(source, requestedTextModel(req));
      const saved = await saveCompetitorItem(email, { ...item, ...analysis }, lease);
      if (!saved) throw new WorkspaceError("任务状态已变化，请重新加载", 409);
      return NextResponse.json({ item: saved });
    }
    await sweepStaleReservations();
    const billing = await imageRequestBilling(req);
    cost = billing.cost;
    if (!await reserveCredits(email, cost)) throw new WorkspaceError("可用积分不足", 402);
    reserved = true;
    if(!currentSynchronousBilling())await addReservation(jobId, email, cost);
    const meta = await sharp(source).metadata();
    const width = meta.width!; const height = meta.height!;
    const size = width / height > 1.2 ? "1536x1024" : width / height < 0.83 ? "1024x1536" : "1024x1024";
    const edit = body.action === "edit";
    const mask = edit ? await regionMask(width, height, body.regions) : undefined;
    const instructions = selected.map((r, i) => `${i + 1}. ${REGION_LABELS[r.kind]}「${r.label}」归一化矩形(x=${r.x},y=${r.y},宽=${r.width},高=${r.height}): ${r.kind === "color" ? `目标颜色 ${r.color}，保留材质、阴影和纹理。` : ""}${r.instruction}`).join("\n");
    const prompt = edit
      ? `只修改遮罩透明区域，不移动整图构图，不修改其他区域。分别执行以下选区要求；不同选区的要求不可互换。\n${instructions}`
      : `${body.degree === "layout" ? "借鉴参考图的构图、排版层级、布光与色彩关系，生成类似但独立的新电商图片。" : "仅借鉴参考图的色彩、材质和视觉风格，自由设计新构图。"}${product ? "第一张为用户自己的产品，产品外观、品牌和包装以第一张为准；最后一张为竞品参考图，不复制竞品品牌或产品。" : "第一张为竞品参考图。"}\n用户可编辑提示词：${body.prompt}`;
    const images = !edit && product ? [await readCompetitorImage(currentImage(product)), source] : [source];
    let output = await editImage({ images, mask, prompt, size, quality: billing.quality });
    output = edit ? await preserveOutsideMask(source, output, mask!) : await sharp(output).resize(width, height, { fit: "fill" }).png().toBuffer();
    const versionId = randomUUID();
    const url = await uploadImage(output, "image/png", `competitors/${item.id}/${versionId}.png`);
    item.versions.push({ id: versionId, image: url, kind: edit ? "edit" : "replicate", parent: item.activeVersion, prompt: body.prompt, regions: body.regions, createdAt: new Date().toISOString() });
    item.activeVersion = versionId;
    const saved = await finishCompetitorGeneration(email, item, lease, cost);
    reserved = false;
    return NextResponse.json({ item: saved, user: await getUser(email).catch(() => null) });
  } catch(e) {
    if (reserved) { await refundCredits(email, cost); if (lease) await settleReservation(lease); }
    return competitorError(e);
  } finally {
    if (lease) await releaseCompetitorItem(email, (await params).id, lease);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withBillingRequest(req,"competitor.action",()=>withBiRequest(req, () => handleObservedPost(req, { params })));
}
