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
import { rateLimit } from "@/lib/rate-limit";
import { getOpenAISettings } from "@/lib/settings";
import {
  appendSessionEvent,
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
  catch (error) { if (error instanceof HarnessError) return harnessErrorResponse(error); throw error; }
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
  if (!rateLimit(`agent:${email}`, 20, 600_000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
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
          request.headers.get("cookie") ?? ""
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
  session.turnId=randomUUID();
  if (imageSkill) appendSessionEvent(session, "image_skill", { id:imageSkill.id, revision:imageSkill.revision, name:imageSkill.name, turnId:session.turnId });
  const eventCursor = session.events.length;
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

      // One pump owns event delivery and completion. Neither idle check emits
      // a heartbeat; do not count 700ms polling ticks as wire events.
      const flush = () => {
        if (closed) return;
        for (; cursor < session.events.length; cursor++) {
          const e = session.events[cursor];
          send(e.type, e.data);
        }
        if (!session.running && cursor >= session.events.length) {
          const lastAssistant = [...session.agent.state.messages]
            .reverse()
            .find((m) => m.role === "assistant");
          const reply = Array.isArray(lastAssistant?.content)
            ? (lastAssistant!.content as { type?: string; text?: string }[])
                .map((c) => (c.type === "text" ? c.text ?? "" : ""))
                .join("")
                .trim()
            : "";
          const failed = lastAssistant && "stopReason" in lastAssistant && ["error", "aborted"].includes(String(lastAssistant.stopReason));
          if (failed || !reply && !session.events.slice(eventCursor).some(event => event.type === "attention")) {
            const failure = classifyAgentFailure(new Error(failed && lastAssistant.stopReason === "aborted" ? "任务已停止" : "模型服务未完成本轮请求"));
            if (!session.events.slice(eventCursor).some(event => event.type === "error")) appendSessionEvent(session, "error", failure);
            send("error", failure);
          } else send("final", {
            sessionId,
            reply,
            turns: session.agent.state.messages.length,
          });
          void persistAgentSession(session).catch(()=>undefined);
          close();
        }
      };
      pump = setInterval(flush, 700);

      timeout = setTimeout(() => session.agent.abort(), 780_000);
      void (async () => {
        primeAgentSystemPrompt(session, message);
        await session.agent.prompt(message, visionImages.length ? visionImages : undefined);
      })()
        .catch((e) => {
          // 发图被拒:证伪该模型的视觉能力并提示重发(不做同会话自动重试,避免状态污染)
          if (visionImages.length && markVisionUnsupported(modelId, e)) {
            send("error", {
              message:
                "当前模型不接受图片输入,已自动关闭视觉并降级为纯文本。请把这条消息再发一次即可。",
            });
            return;
          }
          const failure=classifyAgentFailure(e);appendSessionEvent(session,"error",failure);
          send("error", failure);
        })
        .finally(() => {
          clearTimeout(timeout);
          session.running = false;
          void persistAgentSession(session).catch(()=>undefined);
          flush();
        });
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
    return NextResponse.json({ error: "会话不存在或已过期" }, { status: 404 });
  }
  refreshSessionCredentials(session, request);
  return NextResponse.json({
    events: session.harness.sanitize(session.events.slice(Number.isInteger(since) && since >= 0 ? since : 0)),
    running: session.running,
    total: session.events.length,
  });
}

// ── 一次性执行(向后兼容) ─────────────────────────────────────────────────────
async function localPOST(request: Request) {
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  try { return await withBiRequest(request, () => handlePost(request)); }
  catch (error) { if (error instanceof HarnessError) return harnessErrorResponse(error); throw error; }
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
  } | null;
  const message = (body?.message ?? "").trim().slice(0, 4000);
  if (!message) {
    return NextResponse.json({ error: "请输入任务内容" }, { status: 400 });
  }
  if (!rateLimit(`agent:${email}`, 20, 600_000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }
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
          request.headers.get("cookie") ?? ""
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
  if (lastAssistant && "stopReason" in lastAssistant && ["error", "aborted"].includes(String(lastAssistant.stopReason))) {
    const failure = classifyAgentFailure(new Error(lastAssistant.stopReason === "aborted" ? "任务已停止" : "模型服务未完成本轮请求"));
    appendSessionEvent(session, "error", failure); await persistAgentSession(session);
    return NextResponse.json({error: failure.message, code: failure.code, sessionId: tempId}, {status: 502});
  }
  const modelReply = Array.isArray(lastAssistant?.content)
    ? (lastAssistant!.content as { type?: string; text?: string }[])
        .map((c) => (c.type === "text" ? c.text ?? "" : ""))
        .join("")
        .trim()
    : "";
  const attention=session.events.findLast(event=>event.type==="attention");
  const reply=modelReply || (attention?.data.kind==="waiting"||attention?.data.kind==="restricted" ? String(attention.data.message||"请确认报价后继续") : "");
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
