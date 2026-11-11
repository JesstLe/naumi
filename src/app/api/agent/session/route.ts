import {agentHistoryRunning,assertLocalAgentIdle,agentHistoryResponse} from "@/lib/agent/session-lifecycle";
import { forwardLegacyAgentSession } from "@/lib/agent/legacy-runtime";
import { NextResponse } from "next/server";
import { resolveUserEmail } from "@/lib/admin-auth";
import { dbEnabled } from "@/platform/db/pool";
import { readHarnessBody, harnessErrorResponse, validateHarnessHistory, AgentHarness } from "@/lib/agent/harness";
import {saveAgentSession, getAgentSession, listAgentSessions, deleteAgentSession, renameAgentSession, setAgentSessionPinned} from "@/lib/agent/session-repository";
import {workbenchSessionPreview} from "@/lib/agent/workbench-session-preview";
import {
  getSession,
  removeRuntimeSession,
  renameRuntimeSession,
} from "@/lib/agent/runtime";

// ---------------------------------------------------------------------------
// Agent 会话持久化:
//   GET    /api/agent/session                 = 列出我的历史会话
//   GET    /api/agent/session?id=             = 读单个会话(消息+轨迹)
//   POST   /api/agent/session                 = 保存/更新会话
//   PATCH  /api/agent/session                 = 修改会话名称
//   DELETE /api/agent/session?id=             = 删除会话
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authedEmail(request: Request): Promise<string | null> {
  if (!dbEnabled) return null;
  return resolveUserEmail(request);
}

async function localGET(request: Request) {
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (id) {
    if(id.startsWith("cv-"))return NextResponse.json({error:"请从画布查看此会话"},{status:400});
    await getSession(email,id)?.persistPending?.catch(()=>undefined);
    const s = await getAgentSession(email, id);
    if (!s) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    return NextResponse.json({ session: {...new AgentHarness(email, id).sanitize(s),running:await agentHistoryRunning(email,id)} });
  }
  const sessions = await listAgentSessions(email, 50, true);
  return NextResponse.json({
    sessions: sessions.filter(session=>!session.id.startsWith("cv-")).map((session) => ({
      id: session.id,
      title: session.title || "未命名会话",
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
      pinnedAt: session.pinned_at ?? null,
      preview: workbenchSessionPreview(session.messages, getSession(email,session.id)?.events.map(event=>({...event.data,type:event.type})) ?? session.steps),
    })),
  });
}

async function localPOST(request: Request) {
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  let input;
  try { input = await readHarnessBody(request); } catch (error) { return harnessErrorResponse(error); }
  const body = input as {
    id?: string;
    title?: string;
    messages?: unknown[];
    steps?: unknown[];
  } | null;
  const id = (body?.id ?? "").trim().slice(0, 64);
  if (!id) {
    return NextResponse.json({ error: "缺少会话 id" }, { status: 400 });
  }
  if(id.startsWith("cv-"))return NextResponse.json({error:"请从画布管理此会话"},{status:400});
  const live=getSession(email,id);
  // Client autosave is not authority to flush an idle process's cached snapshot.
  if(live){await live.persistPending?.catch(()=>undefined);return NextResponse.json({ok:true,serverOwned:true});}
  if(await getAgentSession(email,id))return NextResponse.json({ok:true,serverOwned:true});
  const title = (body?.title ?? "").trim().slice(0, 120);
  const messages = Array.isArray(body?.messages) ? body!.messages.slice(-100) : [];
  try { validateHarnessHistory(messages); } catch(error) { return harnessErrorResponse(error); }
  // Imported history cannot manufacture approval or tool execution evidence.
  try { await saveAgentSession(email, id, title, new AgentHarness(email, id).sanitize(messages), [], null); }
  catch(error) { if((error as {code?:string}).code!=="AGENT_SESSION_CONFLICT")throw error; }
  return NextResponse.json({ ok: true });
}

async function localPATCH(request: Request) {
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  let input;
  try { input=await readHarnessBody(request.clone()); } catch(error) { return harnessErrorResponse(error); }
  const body = input as {
    id?: string;
    title?: string;
    pinned?: boolean;
  } | null;
  const id = (body?.id ?? "").trim().slice(0, 64);
  const title = (body?.title ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (!id) {
    return NextResponse.json({ error: "缺少会话 id" }, { status: 400 });
  }
  if(id.startsWith("cv-"))return NextResponse.json({error:"请从画布管理此会话"},{status:400});
  if (body && Object.prototype.hasOwnProperty.call(body, "pinned")) {
    if (typeof body.pinned !== "boolean" || body.title !== undefined) return NextResponse.json({error:"置顶参数无效"},{status:400});
    const pinned = await setAgentSessionPinned(email, id, body.pinned);
    return pinned ? NextResponse.json({ok:true,...pinned}) : NextResponse.json({error:"会话不存在"},{status:404});
  }
  // Pin metadata is owned by the current shared catalog, not the legacy run
  // process. Content/title mutations retain their original owner forwarding.
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  if (!title) {
    return NextResponse.json({ error: "会话名称不能为空" }, { status: 400 });
  }
  if(id.startsWith("cv-"))return NextResponse.json({error:"请从画布管理此会话"},{status:400});
  if(getSession(email,id)?.running)return NextResponse.json({error:"请先停止任务"},{status:409});
  await getSession(email,id)?.persistPending?.catch(()=>undefined);
  const renamed = await renameAgentSession(email, id, title,()=>assertLocalAgentIdle(email,id));
  if (!renamed) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  renameRuntimeSession(email, id, title);
  return NextResponse.json({ ok: true, title });
}

async function localDELETE(request: Request) {
  const legacy = await forwardLegacyAgentSession(request);
  if (legacy) return legacy;
  const email = await authedEmail(request);
  if (!email) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }
  const url = new URL(request.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "缺少会话 id" }, { status: 400 });
  }
  // The workbench owns only its history; canvas sessions use the project-scoped route.
  if(id.startsWith("cv-"))return NextResponse.json({error:"请从画布管理此会话"},{status:400});
  if (getSession(email, id)?.running || getSession(email, id)?.canvasExecuting) {
    return NextResponse.json(
      { error: "会话正在执行任务，请先停止后再删除" },
      { status: 409 }
    );
  }
  await getSession(email, id)?.persistPending?.catch(()=>undefined);
  await deleteAgentSession(email, id,()=>assertLocalAgentIdle(email,id));
  removeRuntimeSession(email, id);
  return NextResponse.json({ ok: true });
}

export const GET=(request:Request)=>agentHistoryResponse(()=>localGET(request));

export const POST=(request:Request)=>agentHistoryResponse(()=>localPOST(request));

export const PATCH=(request:Request)=>agentHistoryResponse(()=>localPATCH(request));

export const DELETE=(request:Request)=>agentHistoryResponse(()=>localDELETE(request));
