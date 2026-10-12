import { authenticatedEmail } from "@/lib/request-auth";
import { canvasAgentHistory } from "@/lib/agent/canvas-history";
import { getSession, refreshSessionCredentials } from "@/lib/agent/runtime";
import { assertHarnessSessionId, readHarnessBody, harnessErrorResponse } from "@/lib/agent/harness";

/** Canvas controls require both authenticated account and current project/anchor ownership. */
export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return Response.json({error:"请先登录"},{status:401});
  try {
    const body = await readHarnessBody(request), sessionId = String(body.sessionId || "");
    assertHarnessSessionId(sessionId,"canvas");
    if (!["stop","steer","poll"].includes(String(body.action))) return Response.json({error:"操作无效"},{status:400});
    const url = new URL(request.url); url.searchParams.set("id",sessionId);
    if (typeof body.projectKey === "string") url.searchParams.set("projectKey",body.projectKey);
    if (typeof body.anchorId === "string") url.searchParams.set("anchorId",body.anchorId);
    const history = await canvasAgentHistory(new Request(url,{headers:request.headers}));
    if (history.status !== 200) return history;
    const session = getSession(email,sessionId);
    if (!session) return Response.json({error:"会话不存在或已过期"},{status:404});
    refreshSessionCredentials(session,request);
    if (body.action === "poll") return Response.json({events:session.harness.sanitize(session.events),running:session.running});
    if (!session.running && !session.canvasExecuting) return Response.json({error:"当前没有运行中的任务"},{status:409});
    if (body.action === "stop") { session.harness.stop(); session.agent.abort(); }
    else {
      if (typeof body.message !== "string" || !body.message.trim()) return Response.json({error:"请输入调整内容"},{status:400});
      // Steering cannot grant confirmation authority or enlarge the frozen tool capability scope.
      session.agent.steer({role:"user",content:`[用户插话] ${body.message}`,timestamp:Date.now()});
    }
    return Response.json({ok:true});
  } catch(error) { return harnessErrorResponse(error); }
}
