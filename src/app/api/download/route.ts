import { NextResponse } from "next/server";
import { parseDownloadSource, fetchDownloadSource } from "@/lib/download-source";
import { GET as readMedia } from "@/app/media/[...path]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const reqUrl = new URL(request.url);
  const raw = reqUrl.searchParams.get("u");
  if (!raw) return NextResponse.json({ error: "缺少参数 u" }, { status: 400 });
  const name = (reqUrl.searchParams.get("n") || "naumi.png").replace(/[^\w.\-]+/g, "_").slice(0, 160);
  let target: URL;
  try { target = parseDownloadSource(raw, reqUrl.origin); }
  catch { return NextResponse.json({ error: "不允许的下载来源" }, { status: 403 }); }
  try {
    // Read directly instead of connecting to the request's Host header.
    const upstream = target.origin === reqUrl.origin
      ? await readMedia(new Request(target.toString()+`${target.search?'&':'?'}download=${encodeURIComponent(name)}`,{headers:request.headers,signal:request.signal}), { params: Promise.resolve({ path: target.pathname.slice(7).split("/").map(decodeURIComponent) }) })
      : await fetchDownloadSource(target, AbortSignal.any([request.signal,AbortSignal.timeout(30_000)]));
    if(upstream.status===307) return upstream;
    if([401,403,404].includes(upstream.status)) return new NextResponse(null,{status:upstream.status,headers:{'cache-control':'no-store'}});
    if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "源文件暂时无法下载" }, { status: 502 });
    return new NextResponse(upstream.body, { headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return NextResponse.json({ error: "下载失败，请稍后重试" }, { status: 502 }); }
}
