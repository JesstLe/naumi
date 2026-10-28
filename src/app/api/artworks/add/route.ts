import {artworkImportRequest,importCanvasArtwork,readCanvasArtworkImport} from "@/lib/canvas/artwork-import";
import {ModelConfigError} from "@/lib/model-config/types";
import {withCreationRoute,withCreationReceiptRoute} from "@/lib/saas/creation-context";
import {withCreationOperation} from "@/lib/saas/creation-writer";
import { NextResponse } from "next/server";
import {dbEnabled} from "@/platform/db/pool";
import {addArtworks} from "@/lib/artworks/writer";
import {setArtworkPosition} from "@/lib/canvas/artwork-repository";
import { provenanceEntry } from "@/lib/artwork-provenance";
import { uploadImage } from "@/lib/media-upload";
import { authenticatedEmail } from "@/lib/request-auth";
import { adaptiveCanvasImageSize } from "@/lib/mock-data";
import {ORIGINAL_IMAGE_MAX_BYTES} from "@/lib/image-upload-policy";
import {originalImageMetadata,browserPreviewsFromForm,saveCanvasOriginal} from "@/lib/canvas-original-upload";
import {readImagegenBody} from "@/lib/imagegen/body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRADIENTS = [
  "from-rose-100 to-slate-100",
  "from-emerald-100 to-teal-100",
  "from-sky-100 to-indigo-100",
  "from-amber-100 to-orange-100",
];

function newId() {
  return `art-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// 新增作品(画布用):
//  - multipart(含 image 文件)= 上传图片作新节点(默认根节点,或挂 parentId)
//  - json {src} = 创建副本 / 复制粘贴节点(复制源图与血缘)
// email 限定,沿用本站信任模式。
async function handlePost(request: Request) {
  if (!dbEnabled)
    return NextResponse.json({ error: "未启用存储" }, { status: 400 });

  const ctype = request.headers.get("content-type") || "";
  const authenticated = await authenticatedEmail(request);
  if (!authenticated) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  // ── 上传图片作节点 ──
  if (ctype.includes("multipart/form-data")) {
    let fd: FormData;
    try {
      const bytes=await readImagegenBody(request,ORIGINAL_IMAGE_MAX_BYTES+9*1024*1024);
      fd = await new Response(new Uint8Array(bytes),{headers:{"content-type":ctype}}).formData();
    } catch {
      return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
    }
    const email = authenticated;
    const parentId = String(fd.get("parentId") ?? "").trim() || null;
    const title = String(fd.get("title") ?? "").trim() || "上传图片";
    // linked=1(拉线建的)→ 画连线(source≠canvas-add);否则独立无线
    const linked = String(fd.get("linked") ?? "") === "1";
    const canvasGroupId = String(fd.get("canvasGroupId") ?? "").trim().slice(0, 120) || null;
    const px = Number(fd.get("x"));
    const py = Number(fd.get("y"));
    const file = fd.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }
    if (file.size > ORIGINAL_IMAGE_MAX_BYTES) {
      return NextResponse.json({ error: "原图过大（每张不超过64MiB）" }, { status: 413 });
    }
    if(file.size>12*1024*1024&&(!fd.get("thumbnail")||!fd.get("preview")))return NextResponse.json({error:"大图请通过画布上传，浏览器会自动准备预览"},{status:422});
    const id = newId();
    const buf = new Uint8Array(await file.arrayBuffer());
    let width: number | null = null;
    let height: number | null = null;
    let ext="png";
    try {
      const meta = await originalImageMetadata(Buffer.from(buf));
      width = meta.width ?? null;
      height = meta.height ?? null;
      ext=meta.extension;
    } catch {
      return NextResponse.json({ error: "图片格式无效" }, { status: 400 });
    }
    let url: string;
    try {
      const saved=await saveCanvasOriginal(Buffer.from(buf),`canvas-uploads/${id}.${ext}`,email,await browserPreviewsFromForm(fd));url=saved.url;
    } catch {
      return NextResponse.json({ error: "上传失败" }, { status: 500 });
    }
    try {
      const canvasSize = adaptiveCanvasImageSize(width, height);
      await addArtworks(email, [
        {
          id,
          title,
          category: "main",
          creationProvenance: { version: 1, operation: "upload", entry: provenanceEntry(fd.get("entry"), "canvas"), ref: id, evidence: "server-route" },
          prompt: "",
          status: "completed",
          image: url,
          gradient: GRADIENTS[0],
          parentId,
          source: linked ? "upload" : "canvas-add",
          canvasGroupId,
          width,
          height,
          canvasWidth: canvasSize.width,
          canvasHeight: canvasSize.height,
        },
      ]);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      );
    }
    if (Number.isFinite(px) && Number.isFinite(py)) {
      await setArtworkPosition(email, id, px, py).catch(() => {});
    }
    const canvasSize = adaptiveCanvasImageSize(width, height);
    return NextResponse.json({
      ok: true,
      id,
      image: url,
      width,
      height,
      canvasWidth: canvasSize.width,
      canvasHeight: canvasSize.height,
      canvasGroupId,
    });
  }

  // JSON insertion delegates its validation, ownership and atomic receipt to Canvas.
  let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:"请求格式不正确"},{status:400});}
  try {
    const input=artworkImportRequest.safeParse(body);
    if(!input.success)return NextResponse.json({error:"请求格式不正确"},{status:400});
    const run=()=>importCanvasArtwork(authenticated,input.data);
    const result=input.data.operationId
      ?await withCreationOperation("canvas-copy",input.data.operationId,authenticated,{parameters:{mode:"import"}},run,r=>({artworkIds:[r.id]}))
      :await run();
    return NextResponse.json(result);
  } catch(error) {
    if(error instanceof ModelConfigError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});
    return NextResponse.json({error:"导入未完成，请重试原操作"},{status:503});
  }
}
export function POST(request:Request){return withCreationRoute(request,()=>handlePost(request));}
export function GET(request:Request){return withCreationReceiptRoute(request,async()=>{
  const email=await authenticatedEmail(request);if(!email)return NextResponse.json({error:"请先登录"},{status:401});
  if(!dbEnabled)return NextResponse.json({error:"未启用存储"},{status:503});
  const operationId=artworkImportRequest.shape.operationId.safeParse(new URL(request.url).searchParams.get("operationId"));
  if(!operationId.success||!operationId.data)return NextResponse.json({error:"导入编号无效"},{status:400});
  try{const result=await readCanvasArtworkImport(email,operationId.data);return result?NextResponse.json(result):NextResponse.json({error:"尚无导入回执"},{status:404});}
  catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"原导入结果尚未同步，请重试"},{status:503});}
});}
