import crypto from "crypto";
import { NextResponse } from "next/server";

import { authenticatedEmail } from "@/lib/request-auth";
import {uploadVideoReference} from "@/lib/video/reference-upload";
import {ModelConfigError} from "@/lib/model-config/types";
import {sameSiteBiMutation} from "@/lib/bi/access";
import {z} from "zod";
import {withCreationRoute} from '@/lib/saas/creation-context';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LIMITS = { image: 20 * 1024 * 1024, video: 200 * 1024 * 1024, audio: 50 * 1024 * 1024 } as const;
const EXTENSIONS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/webm": "webm",
};

async function handlePost(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if(!sameSiteBiMutation(request))return NextResponse.json({error:"不允许跨站上传素材"},{status:403});
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择素材文件" }, { status: 400 });
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "";
  if (!kind || !EXTENSIONS[file.type]) return NextResponse.json({ error: "不支持的素材格式" }, { status: 415 });
  if (file.size <= 0 || file.size > LIMITS[kind]) return NextResponse.json({ error: `${kind} 素材大小不符合限制` }, { status: 413 });
  const operationId=form.get("operationId");if(operationId!==null&&!z.uuid().safeParse(operationId).success)return NextResponse.json({error:"上传操作编号无效"},{status:422});
  const id = typeof operationId==="string"?operationId:crypto.randomUUID();
  const owner = crypto.createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);
  const storageKey = `video-references/${owner}/${id}.${EXTENSIONS[file.type]}`;
  try{const url=await uploadVideoReference(email,id,storageKey,new Uint8Array(await file.arrayBuffer()),file.type);
    return NextResponse.json({ ok: true, reference: { id, kind, role: kind === "image" ? "reference" : kind === "video" ? "source_video" : "source_audio", url, mimeType: file.type, storageKey } },{headers:{"cache-control":"private, no-store"}});
  }catch(error){return error instanceof ModelConfigError?NextResponse.json({error:error.message,code:error.code},{status:error.status}):NextResponse.json({error:"素材上传暂不可用，操作编号已保留"},{status:503});}
}
export function POST(request:Request){return withCreationRoute(request,()=>handlePost(request));}
