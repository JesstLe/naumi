import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticatedEmail } from "../request-auth";
import { dbEnabled, getPool, listArtworksByIds, type ArtworkRecord } from "../db";
import { rateLimit } from "../rate-limit";
import { currentModelExecution } from "../model-config/context";
import { getModelAdministration } from "../model-config/server";
import { configuredToolCost, completeSynchronousStream, failSynchronousStream } from "../billing/synchronous";
import { dataUrlToBytes, isManagedImageUrl, readManagedObject } from "../storage";
import { toVisionDataUrl } from "../vision-image";
import { getOrCreateSession, primeAgentSystemPrompt, resolveVisionImages, persistAgentSession, appendSessionEvent, MODEL_ID, type Session } from "./runtime";
import { canvasSessionPrefix, canvasProjectSessionPrefix, canvasAgentHistory } from "./canvas-history";
import { classifyAgentFailure } from "./recovery";
import type { CanvasAgentContext } from "./canvas-context";

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
export async function runCanvasAgent(request: Request) {
  const email = await authenticatedEmail(request);
  if (!dbEnabled || !email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!rateLimit(`canvas-agent:${email}`, 40, 600000)) return NextResponse.json({ error: "请求过于频繁，请稍后重试" }, { status: 429 });
  const body = record(await request.json().catch(() => null));
  const anchorId = String(body.anchorId || "").trim();
  const history = (Array.isArray(body.messages) ? body.messages : []).map(record).filter(turn => ["user", "assistant"].includes(turn.role) && typeof turn.content === "string").slice(-12).map(turn => ({role:String(turn.role),content:String(turn.content).slice(0,4000)}));
  const message = String(history.at(-1)?.role === "user" ? history.at(-1)?.content : "").trim().slice(0, 4000);
  const projectKey=String(body.projectKey||"").trim().slice(0,200);
  if ((!anchorId&&!projectKey) || !message || !/^[\w-]{8,80}$/.test(String(body.sessionId || ""))) return NextResponse.json({ error: "请输入对话内容与画布项目" }, { status: 400 });
  const ids = Array.from(new Set([...(anchorId?[anchorId]:[]), ...(Array.isArray(body.contextIds) ? body.contextIds.map(String) : [])])).slice(0, 5);
  const found = await listArtworksByIds(email, ids);
  const ordered = ids.map(id => found.find(art => art.id === id));
  if (ordered.some(art => !art)) return NextResponse.json({ error: "图片不存在或无权访问" }, { status: 404 });
  const artworks = ordered as ArtworkRecord[], anchor = artworks[0];
  const scope = currentModelExecution("text");
  if (artworks.length && scope && !scope.capabilities.vision) return NextResponse.json({ error: "当前模型不支持图片理解，请选择兼容模型" }, { status: 400 });
  const origin = (process.env.INTERNAL_APP_ORIGIN || new URL(request.url).origin).replace(/\/$/, "") + "/";
  const cookie = request.headers.get("cookie") || "";
  const images = await Promise.all(artworks.map(art => vision(art, origin, cookie)));
  const canvas: CanvasAgentContext = {
    anchorId, imageUrls: artworks.map(art => new URL(art.image, origin).toString()),
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
  const started = new Date(), artifacts: Artifact[] = [], delivered = new Set<string>();
  let liveSession: Session | undefined;
  const attach = async (result: unknown) => {
    const details = record(record(result).details);
    const urls = [details.url, ...(Array.isArray(details.urls) ? details.urls : []), ...(Array.isArray(details.images) ? details.images : [])].filter(url => typeof url === "string");
    const output = await getPool().query("UPDATE app_artworks SET parent_id=COALESCE(parent_id,$3),group_id=COALESCE($4,group_id),origin='canvas',source_url='agent',canvas_x=COALESCE(canvas_x,$5),canvas_y=COALESCE(canvas_y,$6),batch_id=COALESCE(batch_id,$10) WHERE email=$1 AND deleted_at IS NULL AND created_at >= $7 AND id<>ALL($8::text[]) AND (image_url=ANY($2::text[]) OR id=$9) RETURNING id,title,image_url", [email.toLowerCase(), urls, anchor?.id||null, anchor?.groupId || (projectKey.startsWith("tree:")?projectKey.slice(5):null), (anchor?.canvasX || 0) + (anchor?.canvasWidth || 320) + 80 + delivered.size * 40, (anchor?.canvasY || 0) + delivered.size * 40, started, ids, typeof details.artworkId === "string" ? details.artworkId : "", !anchor&&projectKey.startsWith("batch:")?projectKey.slice(6):null]);
    const added:Artifact[]=[];
    for (const row of output.rows) if (!delivered.has(row.id)) { delivered.add(row.id); const art={ id: row.id, image: row.image_url, title: row.title || "Agent 结果" };artifacts.push(art);added.push(art); }
    if(liveSession&&added.length){appendSessionEvent(liveSession,"artifacts",{artifacts:added,anchorId,turnId:liveSession.turnId});await persistAgentSession(liveSession);}
  };
  await configuredToolCost();
  const session = await getOrCreateSession(email, sessionId, history.slice(0, -1), { cookie, authorization: request.headers.get("authorization") || "", imageQuality: canvas.quality }, modelId, {
    canvas, onToolResult: attach,
    systemPrompt: `你正在画布侧边栏执行任务，当前显示模型为「${label}」。\n当前图：${canvas.imageUrls[0]||"未选择图片，可直接文本对话；图片处理先向用户索取参考图，不猜测图片"}\n上游参考图：${canvas.imageUrls.slice(1).join("\n")}\n当前图标题：${anchor?.title||"无"}\n当前图提示词：${anchor?.prompt || "无"}\n默认生图参数：${canvas.ratio}、${canvas.resolution}、${canvas.quality}。\n用户要求换色、精修或生图时实际调用工具，不只改写提示词；站内成品动画和仅分析、讨论或编写提示词时不调用收费工具。生图工具自动引用当前图与上游参考。文字模型只负责理解和编排，图片工具使用独立的后台画布生图模型。禁止将文字模型ID作为生图模型。`,
  });
  if (session.running || session.canvasExecuting) return NextResponse.json({ error: "当前任务仍在执行，请勿重复提交" }, { status: 409 });
  liveSession=session;session.toolResultsPending=undefined;
  session.turnId = String(body.turnId || body.sessionId);
  if (!session.agent.state.messages.length) session.title = message.slice(0,120);
  const messageIndex=session.agent.state.messages.filter(turn=> { if(turn.role!=="user"&&turn.role!=="assistant")return false; return typeof turn.content==="string" ? !!turn.content.trim() : turn.content.some(part=>part.type==="text"&&!!part.text.trim()); }).length;
  appendSessionEvent(session,"canvas_turn",{turnId:session.turnId,anchorId,projectKey,message,messageIndex});
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
          const reply = Array.isArray(last?.content) ? last.content.filter(part => part.type === "text").map(part => part.type === "text" ? part.text : "").join("").trim() : output.trim();
          if (!reply || failed) throw new Error("Agent 执行未完成，已产出的结果保留，请勿重复提交收费任务");
          const frames = [{ type: "final", data: { reply, sessionId } }, ...(artifacts.length ? [{ type: "artifacts", data: { artifacts, anchorId } }] : [])];
          await completeSynchronousStream({ text: reply, model: modelId, agentFrames: frames });
          appendSessionEvent(session,"canvas_terminal",{status:"completed",turnId:session.turnId});
          await persistAgentSession(session);
          send("final", { reply, sessionId }); send("done", { ok: true });
        } catch (error) { if (!closed) { const failure=classifyAgentFailure(error); appendSessionEvent(session,"error",failure); appendSessionEvent(session,"canvas_terminal",{status:failure.code==="ABORTED"?"stopped":"failed",turnId:session.turnId}); flush(); send("error", failure); } await failSynchronousStream(); }
        finally { cleanup(); await persistAgentSession(session).catch(()=>undefined); session.canvasExecuting = false; if (!closed) { closed = true; controller.close(); } }
      })();
    }, cancel() { cancel(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" } });
}
