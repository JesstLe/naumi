import { NextResponse } from "next/server";
import {setArtworkCanvasLayout, setArtworkCanvasSize} from "@/lib/canvas/artwork-repository";
import { authenticatedEmail } from "@/lib/request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const email = await authenticatedEmail(request);
  if (!email) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  let body: {
    id?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    sizeOnly?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const ok = body.sizeOnly
    ? await setArtworkCanvasSize(
        email,
        String(body.id || ""),
        Number(body.width),
        Number(body.height)
      )
    : await setArtworkCanvasLayout(
        email,
        String(body.id || ""),
        Number(body.x),
        Number(body.y),
        Number(body.width),
        Number(body.height)
      );
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "画布尺寸参数无效或作品不存在" }, { status: 400 });
}
