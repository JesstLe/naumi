"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { cdnUrl, cdnThumb, onImgError, probeCdnHealth } from "@/lib/cdn";

/** 视频 URL 识别:按扩展名或上传目录判断,视频走 <video> 缩略而非 <img>。 */
function isVideoUrl(url: string): boolean {
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return true;
  return url.includes("/media/videos/") || url.includes("/videos/");
}

// Real image with a tasteful gradient fallback + loading skeleton, so the UI
// always looks finished even if a CDN image fails or the user is offline.
export function Media({
  src,
  alt,
  ratio = "aspect-[4/3]",
  gradient = "from-emerald-100 to-teal-100",
  className,
  imgClassName,
  overlay = true,
  children,
  priority = false,
  thumbWidth,
}: {
  src: string;
  alt: string;
  ratio?: string;
  gradient?: string;
  className?: string;
  imgClassName?: string;
  overlay?: boolean;
  children?: React.ReactNode;
  // true = 首屏关键图(eager + high fetch priority),false = 默认 lazy
  priority?: boolean;
  // 列表预览:本地缓存压缩/国内 CDN 缩放，原图地址不变。
  thumbWidth?: number;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  // CDN 改写源不可达(开代理用户请求被挂起,不触发 onError)→ 探测后改用原始源。
  const [useOrig, setUseOrig] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const video = isVideoUrl(src);
  // 视频不做 CDN 缩放(缩放管线只认图片),直接原地址。
  const rewritten = !video && thumbWidth ? cdnThumb(src, thumbWidth) : cdnUrl(src);
  useEffect(() => {
    const image = imageRef.current;
    setState(image?.complete && image.naturalWidth > 0 ? "ready" : "loading");
    setUseOrig(false);
  }, [src, rewritten]);
  useEffect(() => {
    if (cdnUrl(src) === src) return; // Local optimizer is not an external CDN.
    if (video) return; // 视频直连,不探测图片 CDN
    let on = true;
    void probeCdnHealth(rewritten).then((ok) => {
      if (on && !ok) setUseOrig(true);
    });
    return () => {
      on = false;
    };
  }, [rewritten, src, video]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border bg-secondary",
        ratio,
        className
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-br transition-opacity duration-500",
          gradient,
          state === "ready" ? "opacity-0" : "opacity-100"
        )}
      />
      {state === "loading" && (
        <div className="absolute inset-0 animate-pulse bg-secondary" />
      )}
      {state !== "error" && video ? (
        <>
          <video
            src={rewritten}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={() => setState("ready")}
            onError={() => setState("error")}
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
              state === "ready" ? "opacity-100" : "opacity-0",
              imgClassName
            )}
          />
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white">
            <Play className="h-3 w-3" />
          </span>
        </>
      ) : state !== "error" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          ref={imageRef}
          src={useOrig ? src : rewritten}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          // @ts-expect-error React 18 typings 不识别 fetchpriority,但 HTML 已支持
          fetchpriority={priority ? "high" : undefined}
          onLoad={() => setState("ready")}
          onError={(e) => { if (!onImgError(e, src)) setState("error"); }}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
            state === "ready" ? "opacity-100" : "opacity-0",
            imgClassName
          )}
        />
      ) : null}
      {overlay && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-900/15 via-transparent to-transparent" />
      )}
      {children}
    </div>
  );
}
