import {canvasTextSnapshotSchema} from "@/lib/canvas/history-contract";
import {CanvasTextWriteConflict} from "@/lib/canvas/text-write";
import { NextResponse } from "next/server";
import {dbEnabled} from "@/platform/db/pool";
import {deleteCanvasTextNodes, listCanvasTextNodes, upsertCanvasTextNode, type CanvasTextNodeRecord} from "@/lib/canvas/text-node-repository";
import {listArtworksByIds} from "@/lib/artworks/repository";
import { authenticatedEmail, authorizedTargetEmail } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!dbEnabled) return NextResponse.json({ persisted: false, nodes: [] });
  const requested = new URL(request.url).searchParams.get("email");
  const email = await authorizedTargetEmail(request, requested, true);
  if (!email) {
    return NextResponse.json({ error: "未登录或无权访问" }, { status: 401 });
  }
  const nodes = await listCanvasTextNodes(email);
  return NextResponse.json({ persisted: true, nodes });
}

export async function POST(request: Request) {
  if (!dbEnabled) return NextResponse.json({ persisted: false });
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let body: Partial<CanvasTextNodeRecord>&{base?:CanvasTextNodeRecord|null};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const id = String(body.id || "").trim();
  const projectKey = String(body.projectKey || "").trim();
  const canvasX = Number(body.canvasX);
  const canvasY = Number(body.canvasY);
  if (!id || !projectKey || !Number.isFinite(canvasX) || !Number.isFinite(canvasY)) {
    return NextResponse.json({ error: "缺少文字节点参数" }, { status: 400 });
  }
  const width = Math.round(
    Math.min(4096, Math.max(8, Number(body.width) || 300))
  );
  const height = Math.round(
    Math.min(100000, Math.max(8, Number(body.height) || 176))
  );
  const sourceIds = Array.from(
    new Set(
      (Array.isArray(body.sourceIds) ? body.sourceIds : [])
        .map((source) => String(source).trim())
        .filter(Boolean)
    )
  ).slice(0, 200);
  if (sourceIds.length&&!Object.hasOwn(body,"base")) {
    const references = await listArtworksByIds(email, sourceIds);
    const projectTexts = (await listCanvasTextNodes(email)).filter(node => node.projectKey === projectKey);
    const texts = projectTexts.filter(node => sourceIds.includes(node.id) && node.id !== id);
    if (new Set([...references.map(node => node.id), ...texts.map(node => node.id)]).size !== sourceIds.length) {
      return NextResponse.json(
        { error: "部分引用节点不存在或无权访问" },
        { status: 400 }
      );
    }
    // A source text must not already depend on the target, even indirectly.
    const byId = new Map(projectTexts.map(node => [node.id,node]));
    const todo = texts.map(node=>node.id),seen = new Set<string>();
    while (todo.length) {
      const source = todo.pop()!;
      if (source === id) return NextResponse.json({error:"不能形成循环连线"},{status:400});
      if (seen.has(source)) continue; seen.add(source); todo.push(...(byId.get(source)?.sourceIds || []));
    }
  }
  // 产品图绑定(帮写节点生成图片时作为 edit 首参考):首张为主产品图
  const productIds = Array.from(
    new Set(
      (Array.isArray(body.productIds) ? body.productIds : [])
        .map((id) => String(id).trim())
        .filter(Boolean)
    )
  ).slice(0, 2);
  if (productIds.length&&!Object.hasOwn(body,"base")) {
    const products = await listArtworksByIds(email, productIds);
    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "绑定的产品图不存在或无权访问" },
        { status: 400 }
      );
    }
  }
  const now = new Date().toISOString();
  if(Object.hasOwn(body,"base")&&body.base!==null){const parsed=canvasTextSnapshotSchema.safeParse(body.base);if(!parsed.success||parsed.data.id!==id||parsed.data.projectKey!==projectKey)return NextResponse.json({error:"文字保存基线无效"},{status:400});body.base={...parsed.data,updatedAt:parsed.data.updatedAt||now};}
  try{
  const node = await upsertCanvasTextNode(email, {
    id,
    projectKey,
    title: String(body.title || "文字生成").trim() || "文字生成",
    prompt: String(body.prompt || ""),
    content: String(body.content || ""),
    error: body.status === "failed" ? String(body.error || "").slice(0, 2000) : "",
    status:
      body.status === "generating" || body.status === "failed" || body.status === "idle"
        ? body.status
        : "completed",
    canvasX,
    canvasY,
    width,
    height,
    createdAt: String(body.createdAt || now),
    updatedAt: now,
    sourceIds,
    productIds,
    targetIds: Array.from(
      new Set(
        (Array.isArray(body.targetIds) ? body.targetIds : [])
          .map((target) => String(target).trim())
          .filter(Boolean)
      )
    ).slice(0, 200),
  },Object.hasOwn(body,"base")?{base:body.base!}:undefined);
  return NextResponse.json({ persisted: true, node });
  }catch(error){if(error instanceof CanvasTextWriteConflict)return NextResponse.json({error:error.message,code:error.code,id:error.id,fields:error.fields,current:error.current},{status:409});if(error instanceof Error&&/引用节点|绑定的产品图|循环连线/.test(error.message))return NextResponse.json({error:error.message},{status:400});throw error;}
}

export async function DELETE(request: Request) {
  if (!dbEnabled) return NextResponse.json({ persisted: false, deleted: 0 });
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (!ids.length) return NextResponse.json({ error: "缺少文字节点" }, { status: 400 });
  const deleted = await deleteCanvasTextNodes(email, ids);
  return NextResponse.json({ persisted: true, deleted });
}
