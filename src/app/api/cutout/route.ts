import {NextResponse} from "next/server";
import {withBillingRequest} from "@/lib/billing/synchronous";
import {withBiRequest} from "@/lib/bi/model-observer";
import {resolveUserEmail} from "@/lib/admin-auth";
import {clientIp} from "@/lib/ip";
import {executeCutout} from "@/lib/imagegen/cutout";
import type {CutoutInput} from "@/lib/imagegen/cutout-types";
export const runtime="nodejs";
export const maxDuration=120;

async function parseInput(request: Request): Promise<CutoutInput | null> {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) return null;
  const f = await request.formData();
  const s = (k: string) => (f.get(k) ?? "").toString();

  let bytes: Buffer | null = null;
  let type = "image/png";
  const file = f.get("image");
  if (file instanceof File && file.size > 0) {
    bytes = Buffer.from(await file.arrayBuffer());
    type = file.type || "image/png";
  } else {
    // 也支持传 sourceUrl(画布里对已有节点抠图,不必先下载再上传)
    const src = s("sourceUrl").trim();
    if (src) {
      const r = await fetch(src, { cache: "no-store" });
      if (r.ok) {
        bytes = Buffer.from(await r.arrayBuffer());
        type = r.headers.get("content-type") || "image/png";
      }
    }
  }
  if (!bytes) return null;

  const q = s("quality").trim();
  return {
    bytes,
    type,
    email: s("email").trim(),
    parentId: s("parentId").trim(),
    title: s("title").trim() || "抠图",
    category: s("category") || "main",
    ratio: s("ratio") || "1:1",
    resolution: s("resolution") || "1K",
    quality: q === "fine" ? "fine" : q === "fast" ? "fast" : "",
  };
}

async function handleObservedPost(request:Request){
  let input:CutoutInput|null;
  try{input=await parseInput(request);}catch{return NextResponse.json({error:"请求格式不正确"},{status:400});}
  if(!input)return NextResponse.json({error:"缺少待抠图的图片"},{status:400});
  const result=await executeCutout(input,{actor:()=>resolveUserEmail(request),ip:clientIp(request)});
  return NextResponse.json(result.body,{status:result.status});
}
export async function POST(request:Request){
  return withBillingRequest(request,"tool.cutout",()=>withBiRequest(request,()=>handleObservedPost(request)));
}
