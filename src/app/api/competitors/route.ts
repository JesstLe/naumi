import {withBiRequest} from "@/lib/bi/request";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { insertCompetitorItem, listCompetitorItems } from "@/lib/db";
import { uploadImage, deleteImageByUrl } from "@/lib/storage";
import { competitorActor, competitorError, normalizeUpload, WorkspaceError } from "@/lib/competitor-server";
import { normalizeImportPath } from "@/lib/competitor-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { return NextResponse.json({ items: await listCompetitorItems(await competitorActor(req)) }); }
  catch(e) { return competitorError(e); }
}
async function handleObservedPost(req: Request) {
  let url = "";
  try {
    const email = await competitorActor(req);
    const form = await req.formData();
    const file = form.get("image");
    const batch = z.string().uuid().safeParse(form.get("batchId"));
    if (!(file instanceof File) || !batch.success) throw new WorkspaceError("缺少图片或导入批次");
    let filePath: string;
    try { filePath = normalizeImportPath(String(form.get("path") || file.name)); }
    catch { throw new WorkspaceError("文件路径无效"); }
    const all = await listCompetitorItems(email);
    const existing = all.find(i => i.batchId === batch.data && i.path === filePath);
    if (existing) return NextResponse.json({ item: existing }); // retry is idempotent
    if (all.length >= 500 || all.filter(i => i.batchId === batch.data).length >= 100) throw new WorkspaceError("每批最多 100 张，工作台最多保留 500 张", 409);
    const normalized = await normalizeUpload(file);
    const id = randomUUID();
    url = await uploadImage(normalized.data, "image/png", `competitors/${id}/original.png`);
    const item = await insertCompetitorItem(email, {
      id, batchId: batch.data, path: filePath, image: url, width: normalized.info.width, height: normalized.info.height,
      prompt: "", regions: [], versions: [], activeVersion: "", revision: 0, busy: false, createdAt: new Date().toISOString(),
    });
    if (item.id !== id) await deleteImageByUrl(url).catch(() => { console.warn("STORAGE_CLEANUP_PENDING operation=competitor-duplicate"); });
    return NextResponse.json({ item });
  } catch(e) { if (url) await deleteImageByUrl(url).catch(() => { console.warn("STORAGE_CLEANUP_PENDING operation=competitor-import"); }); return competitorError(e); }
}

export async function POST(req: Request) {
  return withBiRequest(req, () => handleObservedPost(req));
}
