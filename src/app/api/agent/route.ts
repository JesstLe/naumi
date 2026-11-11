import {resolveCreationSettings} from "@/lib/agent/creation-settings-server";
import {agentEventCursor, agentEventsSince} from "@/lib/agent/event-buffer";
import {agentTurnOutcome, recordAuthoritativeReply} from "@/lib/agent/stream-recovery";
import {getAgentSession} from "@/lib/agent/session-repository";
import {agentHistoryRunning} from "@/lib/agent/session-lifecycle";
import { observeReleaseRequest, routeAgentToOwner } from "@/lib/release-runtime/http";
import { releaseRuntimeEnabled, releaseError } from "@/lib/release-runtime/identity";
import { forwardLegacyAgentSession } from "@/lib/agent/legacy-runtime";
import { resolveImageSkill } from "@/lib/image-skills/server";
import { SkillError } from "@/lib/image-skills/catalog";
import {randomUUID} from "node:crypto";
import { NextResponse } from "next/server";
import {withBiRequest} from "@/lib/bi/request";
import { resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/platform/db/pool";
import {checkRateLimit} from "@/lib/rate-limit-http";
import { getOpenAISettings } from "@/lib/settings";
import {
  AgentVisionInputError,
  appendSessionEvent,
  recordTurnCreationSettings,
  agentVisionEnabled,
  getOrCreateSession,
  getSession,
  markVisionUnsupported,
  MODEL_ID,
  persistAgentSession,
  primeAgentSystemPrompt,
  refreshSessionCredentials,
  resolveVisionImages,
} from "@/lib/agent/runtime";
import { buildTaskPlan, classifyAgentFailure } from "@/lib/agent/recovery";
import { requestedTextModel } from "@/lib/text-models";
import { readHarnessBody, assertHarnessSessionId, harnessErrorResponse, HarnessError } from "@/lib/agent/harness";

// ---------------------------------------------------------------------------
// Naumi Agent API(常驻会话版):
//   POST   /api/agent  = 一次性执行(向后兼容入口)
//   PUT    /api/agent  = SSE 流式执行(推荐):实时推送工具进度事件
//   PATCH  /api/agent  = steering:向运行中的会话插话修正
//   DELETE /api/agent  = 中止运行中的会话
//   GET    /api/agent  = 轮询会话事件(SSE 不可用时的降级方案)
// 会话与事件存内存(TTL 1 小时);积分预检在 runtime.ts 的 beforeToolCall。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 800;

type ChatMsg = { role: string; content: string };

async function authedEmail(request: Request): Promise<string | null> {
  if (!dbEnabled) return null;
  return resolveUserEmail(request);
}

// ── SSE 流式执行 ───────────────────────────────────────────────────────────
async function localPUT(request: Request) {
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  try { return await withBiRequest(request, () => handlePut(request)); }
  catch (error) { if (error instanceof AgentVisionInputError) return NextResponse.json({error:error.message},{status:422}); if (error instanceof HarnessError) return harnessErrorResponse(error); throw error; }
}
async function handlePut(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录后再使用 Agent" }, { status: 401 });
  }
  const body = (await readHarnessBody(request)) as {
    message?: string;
    sessionId?: string;
    history?: ChatMsg[];
    images?: string[];
    skill?: unknown;
    creationSettings?: unknown;
  } | null;
  const message = (body?.message ?? "").trim().slice(0, 4000);
  const sessionId =
    (body?.sessionId ?? "").trim().slice(0, 64) ||
    `ag-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  if(sessionId.startsWith("cv-"))return NextResponse.json({error:"请从画布继续此会话"},{status:400});
  assertHarnessSessionId(sessionId, "workbench");
  if (!message) {
    return NextResponse.json({ error: "请输入任务内容" }, { status: 400 });
  }
  const rateLimitResult = await checkRateLimit(`agent:${email}`, 20, 600_000);
  if (rateLimitResult instanceof Response) return rateLimitResult;
  if (!rateLimitResult) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
  let creationSettings;
  try { creationSettings=await resolveCreationSettings(body?.creationSettings); } catch(error) { return NextResponse.json({error:error instanceof Error&&!error.message.startsWith("[")?error.message:"本轮创作设置格式无效"},{status:400}); }
  let imageSkill;
  try { imageSkill = await resolveImageSkill(email, body?.skill); } catch (error) { if (error instanceof SkillError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
  const settings = await getOpenAISettings();
  if (!process.env.AGENT_API_KEY && !settings.apiKey) {
    return NextResponse.json({ error: "模型接口未配置" }, { status: 503 });
  }
  // 视觉输入(按模型自动判定,AGENT_VISION 可强制):随消息图片转多模态 parts 直喂模型
  const modelId = requestedTextModel(request, MODEL_ID);
  const imageUrls = Array.isArray(body?.images)
    ? body!.images
        .filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 2048)
        .slice(0, 6)
    : [];
  const visionImages =
    agentVisionEnabled(modelId) && imageUrls.length
      ? await resolveVisionImages(
          imageUrls,
          request.headers.get("cookie") ?? "", email, [new URL(request.url).origin]
        )
      : [];
  const history = Array.isArray(body?.history)
    ? body!.history
        .filter(
          (m) =>
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string"
        )
        .slice(-10)
    : [];
  const session = await getOrCreateSession(
    email,
    sessionId,
    history,
    {
      cookie: request.headers.get("cookie") ?? "",
      authorization: request.headers.get("authorization") ?? "",
      imageQuality: request.headers.get("x-naumi-image-quality") || "medium",
    },
    modelId, undefined, imageSkill
  );
  if (session.running || session.canvasExecuting) {
    return NextResponse.json(
      { error: "当前会话有任务正在执行,请等待完成或插话修正" },
      { status: 409 }
    );
  }
  const eventCursor = agentEventCursor(session);
  session.turnId=randomUUID();
  recordTurnCreationSettings(session,creationSettings,modelId);
  if (imageSkill) appendSessionEvent(session, "image_skill", { id:imageSkill.id, revision:imageSkill.revision, name:imageSkill.name, turnId:session.turnId });
  if (session.agent.state.messages.length === 0) {
    session.title = message.slice(0, 120) || session.title;
  }
  appendSessionEvent(session, "plan", { items: buildTaskPlan(message, !!imageSkill?.instructions.includes("name: brand-packaging-strategy")) });
  session.running = true;
  try { await persistAgentSession(session); }
  catch(error) {
    session.running=false;
    if((error as {code?:string}).code==='AGENT_SESSION_CONFLICT')return NextResponse.json({error:'会话已在其他连接更新，请重新打开；已有任务不会重新执行',code:'AGENT_SESSION_CONFLICT',sessionId},{status:409});
    throw error;
  }
  // The request may disconnect while its initial CAS save is in flight.
  // An abort listener added afterwards will not observe that earlier abort.
  if (request.signal.aborted) {
    session.running = false;
    return harnessErrorResponse(new HarnessError("RUN_INACTIVE", 409));
  }

  const encoder = new TextEncoder();
  let cancelStream = () => {};
  const onRequestAbort = () => cancelStream();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let pump: ReturnType<typeof setInterval> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const onDelta = (text: string) => send("delta", { text });
      const cleanup = () => {
        clearInterval(pump);
        clearTimeout(timeout);
        if (session.onDelta === onDelta) session.onDelta = undefined;
        request.signal.removeEventListener("abort", onRequestAbort);
      };
      const close = () => {
        closed = true;
        cleanup();
        try { controller.close(); } catch { /* already cancelled */ }
      };
      cancelStream = () => {
        if (closed) return;
        close();
        appendSessionEvent(session,"error",{code:"ABORTED",message:"任务已停止，可从历史继续"});
        // Cancel this conversation's orchestration, not accepted durable tools.
        // Retain admission ownership until prompt() and its evidence settle.
        session.agent.abort();
        void persistAgentSession(session).catch(()=>undefined);
      };
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          cancelStream();
        }
      };
      let cursor = eventCursor;
      request.signal.addEventListener("abort", onRequestAbort, { once: true });
      send("open", { sessionId });
      // An initial enqueue failure already cancelled transport. Do not install
      // fresh resources or start a prompt after that cleanup has run.
      if (closed) {
        session.running = false;
        void persistAgentSession(session).catch(()=>undefined);
        return;
      }
      // 注册流式回调:assistant 文本增量绕过 events 轮询,直写 SSE(毫秒级到达)
      session.onDelta = onDelta;

      let lastSent = Date.now();
      const flush = () => {
        if (closed) return;
        const page = agentEventsSince(session, cursor);
        if (page.reset) send("history_required", {total:page.total});
        for (const event of page.events) send(event.type, event.data);
        cursor = page.total;
        if (page.events.length) lastSent = Date.now();
        if (Date.now() - lastSent >= 15000) { send("heartbeat", {}); lastSent = Date.now(); }
      };
      pump = setInterval(flush, 700);

      timeout = setTimeout(() => session.agent.abort(), 780_000);
      void (async () => {
        let failure: unknown;
        try {
          primeAgentSystemPrompt(session, message);
          await session.agent.prompt(message, visionImages.length ? visionImages : undefined);
        } catch (error) {
          failure = error;
          if (visionImages.length && markVisionUnsupported(modelId, error)) failure = new Error("当前模型不接受图片输入，请选择支持图片的模型后继续");
        } finally {
          clearTimeout(timeout);
          session.running = false;
          if (closed) { await persistAgentSession(session).catch(()=>undefined); return; }
          try {
            if (failure) throw failure;
            const last = session.agent.state.messages.findLast(m => m.role === "assistant");
            const outcome = agentTurnOutcome(last, agentEventsSince(session,eventCursor).events);
            if (outcome.authoritative) recordAuthoritativeReply(session.agent,outcome.reply,last);
            await persistAgentSession(session);
            flush();
            send("final", {sessionId,reply:outcome.reply,authoritative:outcome.authoritative,turns:session.agent.state.messages.length});
          } catch (error) {
            const detail = classifyAgentFailure(error);
            appendSessionEvent(session,"error",detail);
            await persistAgentSession(session).catch(()=>undefined);
            flush();
          } finally { close(); }
        }
      })();
    },
    cancel() {
      cancelStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// ── Steering 插话 ──────────────────────────────────────────────────────────
async function localPATCH(request: Request) {
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  let validatedBody;
  try { validatedBody = await readHarnessBody(request); } catch(error) { return harnessErrorResponse(error); }
  const body = validatedBody as {
    sessionId?: string;
    message?: string;
  } | null;
  const sessionId = (body?.sessionId ?? "").trim();
  try { assertHarnessSessionId(sessionId, "workbench"); } catch(error) { return harnessErrorResponse(error); }
  const message = (body?.message ?? "").trim().slice(0, 2000);
  if (!sessionId || !message) {
    return NextResponse.json({ error: "参数不完整" }, { status: 400 });
  }
  const session = getSession(email, sessionId);
  if (!session) {
    return NextResponse.json({ error: "会话不存在或已过期" }, { status: 404 });
  }
  if (!session.running) {
    return NextResponse.json({ error: "当前没有运行中的任务" }, { status: 409 });
  }
  refreshSessionCredentials(session, request);
  session.agent.steer({
    role: "user",
    content: `[用户插话] ${message}`,
    timestamp: Date.now(),
  });
  return NextResponse.json({ ok: true });
}

// ── 中止 ───────────────────────────────────────────────────────────────────
async function localDELETE(request: Request) {
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const sessionId = (url.searchParams.get("sessionId") ?? "").trim();
  try { assertHarnessSessionId(sessionId, "workbench"); } catch(error) { return harnessErrorResponse(error); }
  const session = getSession(email, sessionId);
  if (!session) {
    return NextResponse.json({ error: "会话不存在或已过期" }, { status: 404 });
  }
  refreshSessionCredentials(session, request);
  session.agent.abort();
  return NextResponse.json({ ok: true });
}

// ── 事件轮询(降级) ─────────────────────────────────────────────────────────
async function localGET(request: Request) {
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const sessionId = (url.searchParams.get("sessionId") ?? "").trim();
  try { assertHarnessSessionId(sessionId, "workbench"); } catch(error) { return harnessErrorResponse(error); }
  const since = Number(url.searchParams.get("since") || "0");
  const session = getSession(email, sessionId);
  if (!session) {
    const saved=await getAgentSession(email,sessionId);
    if(!saved)return NextResponse.json({ error: "会话不存在或已过期" }, { status: 404 });
    if(await agentHistoryRunning(email,sessionId))return NextResponse.json({error:"原会话仍在执行，请稍后重新连接"},{status:503});
    // The history route owns the full transcript. A reset tells old and new
    // observers to read it instead of guessing from a missing in-memory run.
    return NextResponse.json({events:[],running:false,total:0,reset:true});
  }
  refreshSessionCredentials(session, request);
  return NextResponse.json({
    ...session.harness.sanitize(agentEventsSince(session, Number.isSafeInteger(since) && since >= 0 ? since : 0)),
    running: session.running,
  });
}

// ── 一次性执行(向后兼容) ─────────────────────────────────────────────────────
async function localPOST(request: Request) {
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  try { return await withBiRequest(request, () => handlePost(request)); }
  catch (error) { if (error instanceof AgentVisionInputError) return NextResponse.json({error:error.message},{status:422}); if (error instanceof HarnessError) return harnessErrorResponse(error); throw error; }
}
async function handlePost(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录后再使用 Agent" }, { status: 401 });
  }
  const body = (await readHarnessBody(request)) as {
    message?: string;
    sessionId?: string;
    history?: ChatMsg[];
    images?: string[];
    skill?: unknown;
    creationSettings?: unknown;
  } | null;
  const message = (body?.message ?? "").trim().slice(0, 4000);
  if (!message) {
    return NextResponse.json({ error: "请输入任务内容" }, { status: 400 });
  }
  const rateLimitResult2 = await checkRateLimit(`agent:${email}`, 20, 600_000);
  if (rateLimitResult2 instanceof Response) return rateLimitResult2;
  if (!rateLimitResult2) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
  let creationSettings;
  try { creationSettings=await resolveCreationSettings(body?.creationSettings); } catch(error) { return NextResponse.json({error:error instanceof Error&&!error.message.startsWith("[")?error.message:"本轮创作设置格式无效"},{status:400}); }
  let imageSkill;
  try { imageSkill = await resolveImageSkill(email, body?.skill); } catch (error) { if (error instanceof SkillError) return NextResponse.json({ error: error.message }, { status: error.status }); throw error; }
  const tempId = body?.sessionId?.trim() || `ag-once-${randomUUID()}`;
  assertHarnessSessionId(tempId,"workbench");
  const postModelId = requestedTextModel(request, MODEL_ID);
  const imageUrls = Array.isArray(body?.images)
    ? body!.images
        .filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 2048)
        .slice(0, 6)
    : [];
  const visionImages =
    agentVisionEnabled(postModelId) && imageUrls.length
      ? await resolveVisionImages(
          imageUrls,
          request.headers.get("cookie") ?? "", email, [new URL(request.url).origin]
        )
      : [];
  const history = Array.isArray(body?.history)
    ? body!.history.filter((m) => typeof m.content === "string").slice(-10)
    : [];
  const session = await getOrCreateSession(email, tempId, history, {
    cookie: request.headers.get("cookie") ?? "",
    authorization: request.headers.get("authorization") ?? "",
      imageQuality: request.headers.get("x-naumi-image-quality") || "medium",
  }, postModelId, undefined, imageSkill);
  if (session.running) {
    return NextResponse.json({ error: "任务正在执行中" }, { status: 409 });
  }
  if(request.signal.aborted) return harnessErrorResponse(new HarnessError("RUN_INACTIVE",409));
  session.running=true; session.turnId=randomUUID();
  recordTurnCreationSettings(session,creationSettings,postModelId);
  const onAbort=()=>session.agent.abort();request.signal.addEventListener("abort",onAbort,{once:true});
  const timeout = setTimeout(() => session.agent.abort(), 780_000);
  try {
    primeAgentSystemPrompt(session, message);
    await session.agent.prompt(
      message,
      visionImages.length ? visionImages : undefined
    );
  } catch (e) {
    // 发图被拒:证伪该模型的视觉能力,提示重发(纯文本即可正常执行)
    if (visionImages.length && markVisionUnsupported(postModelId, e)) {
      return NextResponse.json({
        reply:
          "当前模型不接受图片输入,已自动关闭视觉并降级为纯文本。请把这条消息再发一次即可。",
        error: "vision_unsupported",
      });
    }
    const msg = session.harness.publicText(e instanceof HarnessError ? e.message : "Agent 执行失败，请检查任务轨迹");
    return NextResponse.json({
      reply: `任务中断:${msg}`,
      steps: session.events
        .filter((e) => e.type === "tool_end")
        .map((e) => e.data),
      error: msg,
    });
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort",onAbort);
    session.running=false;
    try { await persistAgentSession(session); }
    catch(error) {
      if((error as {code?:string}).code==='AGENT_SESSION_CONFLICT')return NextResponse.json({error:'会话已在其他连接更新，请重新打开；已有任务不会重新执行',code:'AGENT_SESSION_CONFLICT',sessionId:tempId},{status:409});
      throw error;
    }
  }
  const lastAssistant = [...session.agent.state.messages]
    .reverse()
    .find((m) => m.role === "assistant");
  let reply: string;
  try {
    const outcome=agentTurnOutcome(lastAssistant,session.events);
    reply=outcome.reply;
    if(outcome.authoritative){recordAuthoritativeReply(session.agent,reply,lastAssistant);await persistAgentSession(session);}
  } catch(error) {
    const failure=classifyAgentFailure(error);appendSessionEvent(session,"error",failure);await persistAgentSession(session);
    return NextResponse.json({error:failure.message,code:failure.code,sessionId:tempId},{status:502});
  }
  return NextResponse.json({
    sessionId:tempId,
    reply,
    steps: session.events
      .filter((e) => e.type === "tool_end")
      .map((e) => e.data),
    turns: session.agent.state.messages.length,
  });
}

async function releaseDispatch(request: Request, handler: (request: Request) => Promise<Response>) {
  if (!releaseRuntimeEnabled()) return handler(request);
  return observeReleaseRequest(request, async () => {
    try {
      const email = await authedEmail(request);
      if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
      let body: Record<string, unknown> | undefined;
      let forwardedRequest = request;
      const isRun = request.method === "PUT" || request.method === "POST";
      if (["POST", "PUT", "PATCH"].includes(request.method)) {
        body = await readHarnessBody(request);
        if (isRun && !body.sessionId) body.sessionId = `ag-${randomUUID()}`;
        forwardedRequest = new Request(request.url, { method: request.method, headers: request.headers, body: JSON.stringify(body), signal: request.signal });
      }
      const sessionId = body ? String(body.sessionId || "") : new URL(request.url).searchParams.get("sessionId") || "";
      assertHarnessSessionId(sessionId, "workbench");
      const routed = await routeAgentToOwner(forwardedRequest, email, sessionId, "workbench", isRun, body);
      return routed || handler(forwardedRequest);
    } catch (e) { return e instanceof HarnessError ? harnessErrorResponse(e) : releaseError(e); }
  });
}
export const PUT = (request: Request) => releaseDispatch(request, localPUT);
export const POST = (request: Request) => releaseDispatch(request, localPOST);
export const PATCH = (request: Request) => releaseDispatch(request, localPATCH);
export const DELETE = (request: Request) => releaseDispatch(request, localDELETE);
export const GET = (request: Request) => releaseDispatch(request, localGET);
