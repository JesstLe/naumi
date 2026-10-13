import { NextResponse } from "next/server";
import { saveCompetitorItem, deleteCompetitorItem } from "@/lib/db";
import { competitorActor, competitorError, ownedCompetitor, checkVersion, WorkspaceError } from "@/lib/competitor-server";
import { draftSchema } from "@/lib/competitor-types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try { return NextResponse.json({ item: await ownedCompetitor(await competitorActor(req), (await params).id) }); }
  catch(e) { return competitorError(e); }
}
export async function PATCH(req: Request, { params }: Context) {
  try {
    const email = await competitorActor(req);
    const item = await ownedCompetitor(email, (await params).id);
    const draft = draftSchema.safeParse(await req.json());
    if (!draft.success) throw new WorkspaceError("提示词或选区格式不正确");
    checkVersion(item, draft.data.activeVersion);
    const saved = await saveCompetitorItem(email, { ...item, ...draft.data });
    if (!saved) throw new WorkspaceError("其他页面已更新或正在生成，请重新加载后编辑", 409);
    return NextResponse.json({ item: saved });
  } catch(e) { return competitorError(e); }
}
export async function DELETE(req: Request, { params }: Context) {
  try {
    const email = await competitorActor(req);
    await ownedCompetitor(email, (await params).id);
    if (!await deleteCompetitorItem(email, (await params).id)) throw new WorkspaceError("正在生成，请稍后删除", 409);
    // Keep media: it may already be referenced by an exported canvas artwork.
    return NextResponse.json({ ok: true });
  } catch(e) { return competitorError(e); }
}
