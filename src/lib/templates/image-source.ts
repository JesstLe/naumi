import "server-only";
import { isManagedImageUrl } from "@/lib/object-storage/runtime";
import { repairedTemplateCover } from "./cover-repairs";

export function normalizeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * 取出模板图片真正的远程源地址。兼容早期保存进数据库的
 * /api/tpl-image?u=... 形式；当前实例已经托管的 /media 或 R2 地址不回源。
 */
export function remoteTemplateImageSource(image: string): string | null {
  const value = (image || "").trim();
  if (!value || isManagedImageUrl(value)) return null;

  if (value.startsWith("/api/tpl-image?")) {
    try {
      const source = new URL(value, "http://template-cache.local").searchParams.get(
        "u"
      );
      if (!source || isManagedImageUrl(source)) return null;
      return normalizeHttpUrl(source);
    } catch {
      return null;
    }
  }

  return normalizeHttpUrl(value);
}

/** 公共页面统一输出本站代理地址，首次浏览时即可完成懒缓存。 */
export function templateImageDeliveryUrl(id: string, image: string): string {
  const source = remoteTemplateImageSource(image);
  if (!source) return image;
  const repaired = repairedTemplateCover(id, source);
  if (repaired) return repaired;
  return `/api/tpl-image?id=${encodeURIComponent(id)}&u=${encodeURIComponent(source)}`;
}
