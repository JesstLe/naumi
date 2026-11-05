import "server-only";
import {currentCreationContext} from "@/lib/saas/creation-scope";
import {claimCreation,finishCreation} from '@/lib/saas/creation-writer';

import {getActiveComfyEndpoint, getComfyWorkflow} from "@/lib/comfyui/repository";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {addArtworks} from "@/lib/artworks/writer";
import { readCanvasImage } from "@/lib/canvas-image-input";
import { storageEnabled } from "@/lib/object-storage/runtime";
import { uploadImage } from "@/lib/media-upload";
import { safeError } from "@/lib/api-error";
import {submitByocComfyVideo,knownComfyVideoOutput} from "@/lib/video/byoc";
import {ModelConfigError} from "@/lib/model-config/types";
import {
  applyWorkflowOverrides,
  extractWorkflowInputs,
  missingNodes,
  type ApiWorkflow,
} from "@/lib/comfyui/workflow";
import {
  fetchObjectInfo,
  fetchOutput,
  pollHistory,
  queuePrompt,
  uploadImage as comfyUploadImage,
} from "@/lib/comfyui/client";

import type {ComfyRunInput} from "./run-contract";

const MAX_IMAGES_PER_RUN=8;
const reply=(body:Record<string,unknown>,options:{status?:number}={})=>({body,status:options.status||200});

/** BYOC application: image execution retains the original protocol and artwork
 * lineage; video delegates to the existing durable task owner. No HTTP or React. */
export async function executeComfyRun(email:string,body:ComfyRunInput|null,request:{origin:string;canvas:boolean;operationId:string|null}){
  const artworkId=String(body?.artworkId||"").trim();
  const imageUrl=String(body?.imageUrl||"").trim().slice(0,600);
  const workflowId=String(body?.workflowId||"").trim();
  if(!workflowId)return reply({error:"请选择工作流",accepted:false},{status:400});
  let creationRecord:string|undefined;
  try {
    const endpoint = await getActiveComfyEndpoint(email);
    if (!endpoint) {
      return reply({ error: "还没有可用的 ComfyUI 端点，请先在「工作流」面板添加",accepted:false }, { status: 400 });
    }
    const workflow = await getComfyWorkflow(email, workflowId);
    if (!workflow) return reply({ error: "工作流不存在",accepted:false }, { status: 404 });
    if(body?.mediaType==="video"||knownComfyVideoOutput(workflow.apiJson as ApiWorkflow)){
      const result=await submitByocComfyVideo(email,{...body,source:body?.source|| (request.canvas?"canvas":"workflow"),idempotencyKey:body?.idempotencyKey||request.operationId||crypto.randomUUID()});
      return reply({ok:true,...result,images:[],videos:[]},{status:202});
    }
    if(!artworkId&&!imageUrl)return reply({error:"请选择工作流输入图片",accepted:false},{status:400});
    const source = artworkId
      ? (await listArtworksByIds(email, [artworkId]))[0] ?? null
      : null;
    if (artworkId && !source) {
      return reply({ error: "图片不存在或无权访问",accepted:false }, { status: 404 });
    }
    const sourceImage = source?.image || imageUrl;
    const receipt=await claimCreation('comfyui',body?.idempotencyKey||request.operationId||crypto.randomUUID(),email,{prompt:body?.prompt,inputs:source?[{artworkId:source.id,role:'reference'}]:[],parameters:body?.numericDefaults});
    creationRecord=receipt.id||undefined;
    if(!receipt.created)return reply({error:'该工作流请求已提交，请查看原创作记录，不会重复执行',creationId:creationRecord},{status:409});
    const context=currentCreationContext();if(context&&creationRecord)context.creationId=creationRecord;

    // 缺件预检(运行前必检,导入时的预检可能已过期)
    const available = await fetchObjectInfo(endpoint);
    const inputs = extractWorkflowInputs(workflow.apiJson as ApiWorkflow);
    const missing = missingNodes(inputs.requiredNodes, available);
    if (missing.length) {
      await finishCreation(creationRecord,email,"failed",{summary:"工作流所需节点缺失，未排队执行"});
      return reply(
        {
          error: `端点缺少 ${missing.length} 个工作流所需节点: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? " 等" : ""}。请先在端点 ComfyUI 里安装对应 custom_nodes`,
        },
        { status: 400 }
      );
    }

    // 输入图:有图片槽才上传源图(纯文生图工作流可无图直跑)
    let imageNames: string[] = [];
    if (inputs.images.length && sourceImage) {
      const image = await readCanvasImage(sourceImage, request.origin, email);
      const uploaded = await comfyUploadImage(
        endpoint,
        image.buffer,
        `naumi-${(source?.id || "agent").slice(0, 24)}-${Date.now()}.png`,
        image.mimeType
      );
      imageNames = inputs.images.map(() => uploaded);
    }

    // agent 简写:prompt 直填正向文本槽(无正负标注且只有一个文本槽时填它)
    let texts = body?.texts;
    if (!texts && typeof body?.prompt === "string" && body.prompt.trim()) {
      const positives = inputs.texts.filter((t) => t.role === "positive");
      const targets = positives.length ? positives : inputs.texts.length === 1 ? inputs.texts : [];
      texts = Object.fromEntries(targets.map((t) => [t.nodeId, body!.prompt as string]));
    }

    // 种子默认重掷(显式传入优先:逐节点 seeds > 统一 seed > 随机)
    const seeds: Record<string, number> = {};
    const seedAll = typeof body?.seed === "number" ? Math.floor(body.seed) : null;
    for (const seed of inputs.seeds) {
      seeds[seed.nodeId] =
        body?.seeds?.[seed.nodeId] ?? seedAll ?? Math.floor(Math.random() * 1e15);
    }

    // 尺寸覆盖:逐节点 numerics 优先,agent 按字段名的 numericDefaults 兜底
    const numericDefaults = body?.numericDefaults ?? {};
    const numerics: Record<string, Record<string, number>> = {};
    for (const slot of inputs.numerics) {
      const perField = body?.numerics?.[slot.nodeId]?.[slot.field];
      const byName = numericDefaults[slot.field];
      const value = perField ?? (typeof byName === "number" && byName > 0 ? byName : undefined);
      if (value !== undefined) {
        numerics[slot.nodeId] = { ...(numerics[slot.nodeId] ?? {}), [slot.field]: value };
      }
    }

    const api = applyWorkflowOverrides(workflow.apiJson as ApiWorkflow, {
      imageNames,
      texts,
      seeds,
      numerics,
    });

    const promptId = await queuePrompt(endpoint, api, crypto.randomUUID());
    const outputs = await pollHistory(endpoint, promptId, { timeoutMs: 240_000 });
    if (!outputs.length) {
      await finishCreation(creationRecord,email,'failed',{summary:'工作流结束但未返回产物'});
      return reply({ error: "工作流执行完成但没有产物，请检查 SaveImage/视频输出节点" }, { status: 502 });
    }

    const images: { id: string; url: string; width: number; height: number }[] = [];
    const videos: { url: string; mime: string }[] = [];
    let videoArtworkId = "";
    for (const output of outputs) {
      const file = await fetchOutput(endpoint, output);
      if (file.mime.startsWith("image/")) {
        if (images.length >= MAX_IMAGES_PER_RUN) continue;
        const id = `comfy-${Date.now()}-${Math.floor(Math.random() * 10000)}-${images.length}`;
        let url = `data:${file.mime};base64,${file.buffer.toString("base64")}`;
        if (storageEnabled) {
          url = await uploadImage(new Uint8Array(file.buffer), file.mime, `comfy/${id}.${output.filename.split(".").pop() || "png"}`);
        }
        await addArtworks(email, [{
          id,
          title: `${source?.title || "工作流"} · ${workflow.name}`,
          category: "comfy-workflow",
          creationProvenance: { version: 1, operation: "comfyui", entry: "toolbox", ref: promptId, evidence: "server-route" },
          prompt: typeof body?.prompt === "string" && body.prompt
            ? body.prompt.slice(0, 500)
            : JSON.stringify({ workflowId, workflowName: workflow.name }),
          status: "completed",
          image: url,
          gradient: source?.gradient || "from-indigo-100 to-violet-100",
          style: null,
          ratio: null,
          resolution: "1K",
          source: sourceImage || null,
          parentId: source?.id || null,
          parentIds: [],
          origin: source ? "canvas" : "comfy-agent",
          width: 0,
          height: 0,
        }], `comfy-${Date.now()}`);
        images.push({ id, url, width: 0, height: 0 });
      } else if (file.mime.startsWith("video/")) {
        if (!storageEnabled) continue; // 视频不能走 data URL(体积),无持久化存储时跳过
        const key = `comfy/vid-${Date.now()}-${Math.floor(Math.random() * 10000)}.${output.filename.split(".").pop() || "mp4"}`;
        const url = await uploadImage(new Uint8Array(file.buffer), file.mime, key);
        // 视频也落成画布节点(源图有节点时按血缘挂树;面板同时返回直链预览)
        const vidArtId = `comfy-vid-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        try {
          await addArtworks(email, [{
            id: vidArtId,
            title: `${source?.title || "工作流"} · ${workflow.name} 视频`,
            category: "video",
            creationProvenance: { version: 1, operation: "comfyui", entry: "toolbox", ref: promptId, evidence: "server-route" },
            prompt: typeof body?.prompt === "string" && body.prompt
              ? body.prompt.slice(0, 500)
              : workflow.name,
            status: "completed",
            image: url,
            gradient: source?.gradient || "from-slate-100 to-zinc-100",
            style: null,
            ratio: null,
            resolution: "1K",
            source: sourceImage || null,
            parentId: source?.id || null,
            parentIds: [],
            origin: source ? "canvas" : "comfy-agent",
            width: 0,
            height: 0,
            videoUrl: url,
          }], `comfy-vid-${Date.now()}`);
          videoArtworkId = vidArtId;
        } catch { /* 落库失败不影响面板预览 */ }
        videos.push({ url, mime: file.mime });
      }
    }

    if (!images.length && !videos.length) {
      await finishCreation(creationRecord,email,'needs_review',{summary:'工作流产物未能交付，请核对原任务'});
      return reply({ error: "产物类型不受支持(仅图片/视频)" }, { status: 502 });
    }
    await finishCreation(creationRecord,email,'succeeded',{artworkIds:[...images.map(a=>a.id),...(videoArtworkId?[videoArtworkId]:[])]});
    return reply({ ok: true, images, videos, videoArtworkId, promptId,creationId:creationRecord });
  } catch (error) {
    await finishCreation(creationRecord,email!,'needs_review',{summary:'工作流执行中断，按原任务核查，不重复提交'});
    if(error instanceof ModelConfigError)return reply({error:error.message,code:error.code},{status:error.status});
    return reply(
      { error: safeError(error, "工作流执行失败") },
      { status: 502 }
    );
  }
}
