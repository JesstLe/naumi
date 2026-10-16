import { routeAgentToOwner, observeReleaseRequest } from "@/lib/release-runtime/http";
import { releaseRuntimeEnabled, releaseError, ReleaseRuntimeError } from "@/lib/release-runtime/identity";
import { resolveImageSkill } from "@/lib/image-skills/server";
import { SkillError } from "@/lib/image-skills/catalog";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticatedEmail } from "../request-auth";
import { dbEnabled, getPool, listArtworksByIds, type ArtworkRecord } from "../db";
import { rateLimit } from "../rate-limit";
import { currentModelExecution } from "../model-config/context";
import { getModelAdministration } from "../model-config/server";
import { configuredToolCost, completeSynchronousStream, failSynchronousStream } from "../billing/synchronous";
import { dataUrlToBytes, isManagedImageUrl, readManagedObject } from "../storage";
import { toVisionDataUrl } from "../vision-image";
import { completeAgentReleaseActivity, getOrCreateSession, primeAgentSystemPrompt, resolveVisionImages, persistAgentSession, appendSessionEvent, MODEL_ID, type Session } from "./runtime";
import { canvasSessionPrefix, canvasProjectSessionPrefix, canvasAgentHistory } from "./canvas-history";
import { classifyAgentFailure } from "./recovery";
import {authorizeVideoProject} from "../canvas/video-node-service";
import {getVideoNode} from "../canvas/video-node-repository";
import type { CanvasAgentContext } from "./canvas-context";
import { readHarnessBody } from "./harness";

type Artifact = { id: string; image: string; title: string };
const record = (value: unknown): Record<string, any> => value && typeof value === "object" ? value as Record<string, any> : {};

async function vision(artwork: ArtworkRecord, origin: string, cookie: string) {
  const inline = dataUrlToBytes(artwork.image);
  const object = inline ? { bytes: Buffer.from(inline.bytes), contentType: inline.contentType } : isManagedImageUrl(artwork.image) ? await readManagedObject(artwork.image, 12 * 1024 * 1024) : null;
  if (object) {
    const url = await toVisionDataUrl(Buffer.from(object.bytes), object.contentType);
    const match = /^data:([^;]+);base64,(.+)$/.exec(url);
    if (!match) throw new Error("无法读取当前图片");
    return { type: "image" as const, mimeType: match[1], data: match[2] };
  }
  const images = await resolveVisionImages([new URL(artwork.image, origin).toString()], cookie);
  if (!images.length) throw new Error("参考图片读取失败，请重新选择图片；未执行生图");
  return images[0];
}

/** The canvas owns references and output placement; the existing Agent owns tools and billing. */
async function runCanvasAgentLocal(request: Request) {
  const email = await authenticatedEmail(request);
  if (!dbEnabled || !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`canvas-agent:${email}`, 40, 600000)) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });
  const body = record(await readHarnessBody(request));
  const anchorId = String(body.anchorId || "").trim();
  const history = (Array.isArray(body.messages) ? body.messages : []).map(record).filter(turn => ["user", "assistant"].includes(turn.role) && typeof turn.content === "string").slice(-12).map(turn => ({role:String(turn.role),content:String(turn.content).slice(0,4000)}));
  const message = String(history.at(-1)?.role === "user" ? history.at(-1)?.content : "").trim().slice(0, 4000);
  const projectKey=String(body.projectKey||"").trim().slice(0,200);
  if ((!anchorId&&!projectKey) || !message || !/^[\w-]{8,80}$/.test(String(body.sessionId || ""))) return NextResponse.json({ error: "请输入对话内容与画布项目" }, { status: 400 });
  let imageSkill;
  try { imageSkill = await resolveImageSkill(email, body.skill); } catch (error) { if (error instanceof SkillError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
  const ids = Array.from(new Set([...(anchorId?[anchorId]:[]), ...(Array.isArray(body.contextIds) ? body.contextIds.map(String) : [])])).slice(0, 5);
  const found = await listArtworksByIds(email, ids);
  const ordered = ids.map(id => found.find(art => art.id === id));
  if (ordered.some(art => !art)) return NextResponse.json({ error: "图片不存在或无权访问" }, { status: 404 });
  const artworks = ordered as ArtworkRecord[],imageArtworks=artworks.filter(art=>!art.videoUrl&&!["audio","media"].includes(art.category||"")), anchor = imageArtworks[0];
  let video:CanvasAgentContext["video"];
  if(projectKey&&projectKey!=="workspace"){
    try{await authorizeVideoProject(email,projectKey);const videoId=typeof body.videoNodeId==="string"?body.videoNodeId:"",node=videoId?await getVideoNode(email,videoId):null;if(videoId&&(!node||node.projectKey!==projectKey))return NextResponse.json({error:"视频节点不存在或不属于当前项目"},{status:404});const textId=typeof body.textNodeId==="string"?body.textNodeId:"";if(textId&&!(await getPool().query("SELECT 1 FROM app_canvas_text_nodes WHERE email=$1 AND id=$2 AND project_key=$3",[email,textId,projectKey])).rowCount)return NextResponse.json({error:"文字节点不存在或不属于当前项目"},{status:404});video={projectKey,...(textId?{textNodeId:textId}:{}),...(node?{nodeId:node.id,revision:node.revision}:{})};}catch{return NextResponse.json({error:"画布项目不存在或无权访问"},{status:404});}
  }
  const scope = currentModelExecution("text");
  if (imageArtworks.length && scope && !scope.capabilities.vision) return NextResponse.json({ error: "当前模型不支持图片理解，请选择兼容模型" }, { status: 400 });
  const origin = (process.env.INTERNAL_APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, "") + "/";
  const cookie = request.headers.get("cookie") || "";
  const images = await Promise.all(imageArtworks.map(art => vision(art, origin, cookie)));
  const canvas: CanvasAgentContext = {
    video,anchorId:anchor?.id||"", imageUrls: imageArtworks.map(art => new URL(art.image, origin).toString()),
    imageModelId: typeof body.imageModelId === "string" ? body.imageModelId : undefined,
    ratio: /^\d+:\d+$/.test(String(body.ratio)) ? body.ratio : anchor?.ratio || "1:1",
    resolution: ["1K", "2K", "4K"].includes(body.resolution) ? body.resolution : "1K",
    quality: ["low", "medium", "high", "xhigh", "max"].includes(body.quality) ? body.quality : "medium",
  };
  const modelId = scope?.frozen.publicModelId || MODEL_ID;
  const snapshot = scope ? await (await getModelAdministration()).repo.byVersion(scope.frozen.modelVersion) : null;
  const label = snapshot?.config.publicModels.find(model => model.id === modelId)?.label || modelId;
  const legacyPrefix=anchorId?canvasSessionPrefix(anchorId):"";
  const prefix = legacyPrefix&&String(body.sessionId).startsWith(legacyPrefix)?legacyPrefix:projectKey?canvasProjectSessionPrefix(projectKey):legacyPrefix;
  let authorizedLegacy=false;
  if(String(body.sessionId).startsWith("cv-")&&!String(body.sessionId).startsWith(prefix)){
    if(!projectKey)return NextResponse.json({error:"请从当前项目历史恢复会话"},{status:409});
    const lookup=new URL(request.url);lookup.searchParams.set("projectKey",projectKey);lookup.searchParams.set("id",String(body.sessionId));
    authorizedLegacy=(await canvasAgentHistory(new Request(lookup,{headers:request.headers}))).status===200;
    if(!authorizedLegacy)return NextResponse.json({error:"该会话不属于当前项目"},{status:404});
  }
  const sessionId = authorizedLegacy?String(body.sessionId): String(body.sessionId).startsWith(prefix) ? String(body.sessionId) : prefix + createHash("sha256").update(String(body.sessionId)).digest("hex").slice(0,32);
  if (releaseRuntimeEnabled()) {
    const routed = await routeAgentToOwner(request, email, sessionId, "canvas", true, body);
    if (routed) return routed;
  }
  const started = new Date(), artifacts: Artifact[] = [], delivered = new Set<string>();
  let liveSession: Session | undefined;
  const attach = async (result: unknown,tool:string) => {
    const details = record(record(result).details);
    if(["plan_video_script","plan_video_storyboard"].includes(tool)&&liveSession){
      const planned=Array.isArray(details.nodes)?details.nodes:[details.node];
      const textIds=planned.flatMap(value=>{
        const node=record(value),config=record(node.config),inputs=Array.isArray(node.inputs)?node.inputs:[],shots=Array.isArray(config.shots)?config.shots:[];
        return [...inputs.filter(input=>record(input).kind==="text").map(input=>String(record(input).nodeId).replace(/^text:/,"")),...shots.map(shot=>record(shot).textNodeId)];
      });
      const ids=Array.from(new Set((tool==="plan_video_script"?[record(details.node).id]:textIds).filter((id):id is string=>typeof id==="string")));
      const nodes=ids.length?(await getPool().query("SELECT id,project_key AS \"projectKey\" FROM app_canvas_text_nodes WHERE email=$1 AND id=ANY($2::text[]) AND project_key=$3",[email,ids,projectKey])).rows:[];
      if(nodes.length){appendSessionEvent(liveSession,"text_nodes",{nodes,turnId:liveSession.turnId});await persistAgentSession(liveSession);}
    }
    if(["create_video_node","plan_video_shot","plan_video_storyboard"].includes(tool)&&liveSession){
      const nodeIds=Array.from(new Set([details.nodeId,record(details.node).id,...(Array.isArray(details.nodeIds)?details.nodeIds:[])].filter((id):id is string=>typeof id==="string")));
      const owned=[];for(const id of nodeIds){const node=await getVideoNode(email,id);if(node&&(!video?.projectKey||node.projectKey===video.projectKey))owned.push({id:node.id,projectKey:node.projectKey});}
      if(owned.length){appendSessionEvent(liveSession,"video_nodes",{nodes:owned,turnId:liveSession.turnId});await persistAgentSession(liveSession);}return;
    }
    if(details.taskId||details.jobId||details.nodeId||details.runId)return;
    const urls = [details.url, ...(Array.isArray(details.urls) ? details.urls : []), ...(Array.isArray(details.images) ? details.images : [])].filter(url => typeof url === "string");
    const output = await getPool().query("UPDATE app_artworks SET parent_id=COALESCE(parent_id,$3),group_id=COALESCE($4,group_id),origin='canvas',source_url='agent',canvas_x=COALESCE(canvas_x,$5),canvas_y=COALESCE(canvas_y,$6),batch_id=COALESCE(batch_id,$10) WHERE email=$1 AND deleted_at IS NULL AND created_at >= $7 AND id<>ALL($8::text[]) AND (image_url=ANY($2::text[]) OR id=$9) RETURNING id,title,image_url", [email.toLowerCase(), urls, anchor?.id||null, anchor?.groupId || (projectKey.startsWith("tree:")?projectKey.slice(5):null), (anchor?.canvasX || 0) + (anchor?.canvasWidth || 320) + 80 + delivered.size * 40, (anchor?.canvasY || 0) + delivered.size * 40, started, ids, typeof details.artworkId === "string" ? details.artworkId : "", !anchor&&projectKey.startsWith("batch:")?projectKey.slice(6):null]);
    const added:Artifact[]=[];
    for (const row of output.rows) if (!delivered.has(row.id)) { delivered.add(row.id); const art={ id: row.id, image: row.image_url, title: row.title || "Agent 结果" };artifacts.push(art);added.push(art); }
    if(liveSession&&added.length){appendSessionEvent(liveSession,"artifacts",{artifacts:added,anchorId,turnId:liveSession.turnId});await persistAgentSession(liveSession);}
  };
  await configuredToolCost();
  const session = await getOrCreateSession(email, sessionId, history.slice(0, -1), { cookie, authorization: request.headers.get("authorization") || "", imageQuality: canvas.quality }, modelId, {
    canvas, onToolResult: attach,
    systemPrompt: `你正在画布侧边栏执行任务，当前显示模型为「${label}」。\n当前图：${canvas.imageUrls[0]||"未选择图片，可直接文本对话；图片处理先向用户索取参考图，不猜测图片"}\n上游参考图：${canvas.imageUrls.slice(1).join("\n")}\n当前图片节点身份：${canvas.anchorId||"无"}\n当前图标题：${anchor?.title||"无"}\n当前图提示词：${anchor?.prompt || "无"}\n当前视频项目/节点：${JSON.stringify(canvas.video||null)}。视频节点通过工具查询和修改，持久任务由Worker恢复，不通过图片URL挂载。\n默认生图参数：${canvas.ratio}、${canvas.resolution}、${canvas.quality}。\n用户要求换色、精修或生图时实际调用工具，不只改写提示词；站内成品动画和仅分析、讨论或编写提示词时不调用收费工具。生图工具自动引用当前图与上游参考。文字模型只负责理解和编排，图片工具使用独立的后台画布生图模型。禁止将文字模型ID作为生图模型。`,
  }, imageSkill);
  if (session.running || session.canvasExecuting) return NextResponse.json({ error: "当前任务仍在执行，请勿重复提交" }, { status: 409 });
  liveSession=session;session.toolResultsPending=undefined;
  session.turnId = randomUUID();
  if (!session.agent.state.messages.length) session.title = message.slice(0,120);
  const messageIndex=session.agent.state.messages.filter(turn=> { if(turn.role!=="user"&&turn.role!=="assistant")return false; return typeof turn.content==="string" ? !!turn.content.trim() : turn.content.some(part=>part.type==="text"&&!!part.text.trim()); }).length;
  appendSessionEvent(session,"canvas_turn",{turnId:session.turnId,anchorId,projectKey,message,messageIndex,skill:imageSkill ? {id:imageSkill.id,revision:imageSkill.revision,name:imageSkill.name} : null});
  session.running = true; session.canvasExecuting = true;
  await persistAgentSession(session);
  const cursorStart = session.events.length;
  const encoder = new TextEncoder();
  let cancel = () => { session.agent.abort(); };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let cursor = cursorStart, output = "", closed = false, failed = false;
      const send = (type: string, data: unknown) => { if (!closed) { try { controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { cancel(); } } };
      const flush = () => {
        for (; cursor < session.events.length; cursor++) { const event = session.events[cursor]; if (event.type === "error") failed = true; send(event.type, event.data); }
      };
      const timer = setInterval(flush, 300);
      const timeout = setTimeout(() => cancel(), 780000);
      const cleanup = () => { clearInterval(timer); clearTimeout(timeout); request.signal.removeEventListener("abort", cancel); session.onDelta = undefined; session.onToolResult = undefined; session.running = false; };
      cancel = () => { if (closed) return; appendSessionEvent(session,"error",{code:"ABORTED",message:"任务已停止，已受理的图片保留，请勿重复提交"}); appendSessionEvent(session,"canvas_terminal",{status:"stopped",turnId:session.turnId}); session.agent.abort(); cleanup(); closed = true; void failSynchronousStream(); void persistAgentSession(session).catch(()=>undefined); try { controller.close(); } catch {} };
      request.signal.addEventListener("abort", cancel, { once: true });
      if (request.signal.aborted) { cancel(); return; }
      session.onDelta = text => { output += text; send("delta", { text }); };
      send("open", { sessionId });
      void (async () => {
        try {
          primeAgentSystemPrompt(session, message);
          await session.agent.prompt(message, images.length?images:undefined);
          // Async tool subscribers may still be attaching persisted results.
          await session.toolResultsPending;
          flush();
          if(closed)throw new Error("任务已停止，请从历史核对已有结果");
          const last = [...session.agent.state.messages].reverse().find(turn => turn.role === "assistant");
          if(last&&"stopReason" in last&&last.stopReason==="aborted")throw new DOMException("任务已停止","AbortError");
          if (last && "stopReason" in last && last.stopReason==="error") throw new Error("模型未完成任务，已产出的图片保留；请勿重复提交");
          const attention = session.events.slice(cursorStart).findLast(event => event.type === "attention");
          const pendingAttention = attention?.data.kind === "waiting" || attention?.data.kind === "restricted";
          const modelReply = Array.isArray(last?.content) ? last.content.filter(part => part.type === "text").map(part => part.type === "text" ? part.text : "").join("").trim() : output.trim();
          // A terminated confirmation gate may have no final model text. Surface its
          // existing public quote rather than label the blocked tool as completed.
          const reply = modelReply || (pendingAttention ? String(attention?.data.message || (attention?.data.kind === "waiting" ? "请明确确认报价后继续。" : "当前操作受限，请调整任务后继续。")) : "");
          if (!reply || failed) throw new Error("Agent 执行未完成，已产出的结果保留，请勿重复提交收费任务");
          if (!modelReply && pendingAttention) {
            session.agent.state.messages = [...session.agent.state.messages, {
              role: "assistant", api: session.agent.state.model?.api || "openai-completions", provider: "naumi-local", model: "naumi-local-reply",
              content: [{ type: "text", text: reply }], stopReason: "stop", timestamp: Date.now(),
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            }];
          }
          const frames = [...(attention ? [{ type: "attention", data: attention.data }] : []), { type: "final", data: { reply, sessionId } }, ...(artifacts.length ? [{ type: "artifacts", data: { artifacts, anchorId } }] : [])];
          await completeSynchronousStream({ text: reply, model: modelId, agentFrames: frames });
          appendSessionEvent(session,"canvas_terminal",{status:pendingAttention?String(attention?.data.kind):"completed",turnId:session.turnId});
          await persistAgentSession(session);
          send("final", { reply, sessionId }); send("done", { ok: true });
        } catch (error) { if (!closed) { const failure=classifyAgentFailure(error); appendSessionEvent(session,"error",failure); appendSessionEvent(session,"canvas_terminal",{status:failure.code==="ABORTED"?"stopped":"failed",turnId:session.turnId}); flush(); send("error", failure); } await failSynchronousStream(); }
        finally { cleanup(); await persistAgentSession(session).catch(()=>undefined); session.canvasExecuting = false; await completeAgentReleaseActivity(session).catch(()=>undefined); if (!closed) { closed = true; controller.close(); } }
      })();
    }, cancel() { cancel(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" } });
}

export async function runCanvasAgent(request: Request) {
  return observeReleaseRequest(request, () => runCanvasAgentLocal(request).catch(error => { if (error instanceof ReleaseRuntimeError) return releaseError(error); throw error; }));
}
