import { NextResponse } from "next/server";
import {z} from "zod";

import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";
import { safeError } from "@/lib/api-error";
import {getVideoTask, getVideoTaskByIdempotencyKey} from "@/lib/video/task-repository";
import {listVideoTaskViews,publicVideoTaskView} from "@/lib/video/queries";
import {pollAndSettle} from "@/lib/video/runtime";

// ---------------------------------------------------------------------------
// 视频任务查询(兼容契约 {ok, task}):惰性触发一次服务端轮询与结算(service)。
// 无 id 时为列表模式(§6):按状态过滤列出当前用户任务,工作台历史区数据源。
// 页面关闭也没关系——常驻 worker 会继续恢复扫描。
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

const VALID_STATUS = new Set(["processing", "queued", "needs_attention", "completed", "failed", "cancelled"]);

export async function GET(request: Request) {
  const actor = await authenticatedEmail(request);
  if (!actor) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const url = new URL(request.url);
  const email=await authorizedTargetEmail(request,url.searchParams.get("email"),true);
  if(!email)return NextResponse.json({error:"无权访问目标账号"},{status:403});
  const id = url.searchParams.get("id") || "";
  const operation=url.searchParams.get("idempotencyKey");
  if(!id&&operation){const task=await getVideoTaskByIdempotencyKey(email,operation);return task?NextResponse.json({ok:true,task:publicVideoTaskView(task)},{headers:{"cache-control":"private, no-store"}}):NextResponse.json({error:"任务不存在"},{status:404});}

  if (!id) {
    const status=url.searchParams.get("status")||undefined,source=url.searchParams.get("source")||undefined,sourceIds=(url.searchParams.get("sourceIds")||"").split(",").map(value=>value.trim()).filter(Boolean),limit=Number(url.searchParams.get("limit")??30);
    let cursor:{createdAt:string;id:string}|undefined;try{if(url.searchParams.has("cursor"))cursor=z.strictObject({createdAt:z.iso.datetime(),id:z.string().min(1).max(160)}).parse(JSON.parse(url.searchParams.get("cursor")!));}catch{return NextResponse.json({error:"任务分页参数无效"},{status:422});}
    if(status&&!VALID_STATUS.has(status)||source&&!['canvas','workbench','agent','workflow'].includes(source)||!Number.isInteger(limit)||limit<1||limit>500||sourceIds.length>500)return NextResponse.json({error:"任务查询参数无效"},{status:422});
    try{const options={status,source,sourceIds,projectKey:url.searchParams.get("projectKey")||undefined,nodeId:url.searchParams.get("nodeId")||undefined};
      const rows=await listVideoTaskViews(email,{...options,cursor,limit:limit+1}),page=rows.slice(0,limit),last=page[page.length-1],nextCursor=rows.length>limit&&last?{createdAt:last.cursorCreatedAt||last.createdAt,id:last.id}:null;
      if(!cursor&&!status){const pending=await listVideoTaskViews(email,{...options,pendingOnly:true}),known=new Set(page.map(task=>task.id));page.push(...pending.filter(task=>!known.has(task.id)));}
      return NextResponse.json({ok:true,tasks:page.map(publicVideoTaskView),nextCursor},{headers:{"cache-control":"private, no-store"}});
    }catch{return NextResponse.json({error:"视频任务历史暂不可用"},{status:503});}
  }

  try {
    const task = email===actor?await pollAndSettle(email,id):await getVideoTask(email,id);
    if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    return NextResponse.json({ ok: true, task: publicVideoTaskView(task) },{headers:{"cache-control":"private, no-store"}});
  } catch (error) {
    return NextResponse.json(
      { error: safeError(error, "视频任务查询失败") },
      { status: 502 }
    );
  }
}
