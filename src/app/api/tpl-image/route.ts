import { NextResponse } from "next/server";
import {getTemplateImageCacheState, setTemplateImageCacheFailure, setTemplateImageCacheSuccess} from "@/lib/templates/cache-repository";
import {dbEnabled} from "@/platform/db/pool";
import {persistTemplateImage} from "@/lib/template-image-cache";
import {remoteTemplateImageSource} from "@/lib/templates/image-source";
import { TEMPLATES as SEED } from "@/lib/templates-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
};

function redirectToCached(cachedUrl: string): Response {
  return new Response(null, {
    status: 307,
    headers: { ...CACHE_HEADERS, Location: cachedUrl },
  });
}

/**
 * 模板图片同源入口。首次请求安全抓取远程图片并写入 MEDIA_DIR/R2，随后跳转到
 * 内容哈希稳定地址；带模板 id 时同步把 app_templates.image 回写成稳定地址。
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const source = remoteTemplateImageSource(params.get("u") || "");
  const id = (params.get("id") || "").trim();
  if (!source) {
    return NextResponse.json({ error: "模板图片 URL 非法" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "缺少模板 id" }, { status: 400 });
  }

  let expectedImage = source;
  if (dbEnabled) {
    const template = await getTemplateImageCacheState(id).catch(() => null);
    const currentSource = template ? remoteTemplateImageSource(template.image) : null;
    if (!template || (currentSource !== source && template.imageSource !== source)) {
      return NextResponse.json({ error: "模板图片已变更" }, { status: 409 });
    }
    if (!currentSource && template.imageSource === source) {
      return redirectToCached(template.image);
    }
    expectedImage = template.image;
  } else {
    const template = SEED.find((item) => item.id === id);
    if (!template || remoteTemplateImageSource(template.image) !== source) {
      return NextResponse.json({ error: "模板图片不存在" }, { status: 404 });
    }
  }

  try {
    const cached = await persistTemplateImage(source);
    if (dbEnabled) {
      await setTemplateImageCacheSuccess(
        id,
        expectedImage,
        source,
        cached.cachedUrl
      ).catch(() => false);
    }
    return redirectToCached(cached.cachedUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "模板图片缓存失败";
    if (dbEnabled) {
      await setTemplateImageCacheFailure(
        id,
        expectedImage,
        source,
        message
      ).catch(() => false);
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
