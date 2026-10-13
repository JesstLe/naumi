"use client";
import { CachedImage } from "@/components/cached-image";

import { cn } from "@/lib/utils";
import { useBrand } from "@/lib/brand-context";

export function Logo({ className }: { className?: string }) {
  // 运行时品牌:后台可改站点名 / Logo(DB 覆盖 → env 默认兜底),无需重新 build。
  const { name, logo, logoHasText } = useBrand();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <CachedImage
        src={logo}
        alt={name}
        className={cn(
          // wordmark (含文字) 用大点宽度;icon 用方形
          logoHasText ? "h-9 w-auto" : "h-8 w-auto rounded-lg",
          // 仅默认单色标随主题反白，不改变用户上传的彩色/白标图片。
          logo === "/brand/naumi/symbol-black.svg" && "dark:brightness-0 dark:invert"
        )}
      />
      {/* logo 已含品牌文字时不再渲染外置文字,避免重复 */}
      {!logoHasText && (
        <span className="text-lg font-bold tracking-tight">{name}</span>
      )}
    </div>
  );
}
