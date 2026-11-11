"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { CachedImage } from "@/components/cached-image";
import { cdnThumb } from "@/lib/cdn";
import { templateCoverDimensions, type TemplateCover as CoverMetadata } from "@/lib/templates/cover-layout";

/** Caller keys by image so a changed source starts a fresh load state. */
export function TemplateCover({ image, title, gradient, cover }: {
  image: string; title: string; gradient: string; cover?: CoverMetadata;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [width, height] = templateCoverDimensions({ image, cover });
  return <div className={`relative w-full overflow-hidden bg-secondary/40 bg-gradient-to-br ${gradient}`}
    data-template-cover={state} aria-busy={state === "loading"} style={{ aspectRatio: `${width} / ${height}` }}>
    <CachedImage src={cdnThumb(image, 640)} alt={title} loading="lazy" width={width} height={height}
      className={`absolute inset-0 h-full w-full object-contain ${state === "ready" ? "" : "invisible"}`}
      onLoad={() => setState("ready")} onError={() => setState("error")} />
    {state === "loading" && <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-secondary/40" />}
    {state === "error" && <span role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
      <ImageOff className="h-5 w-5"/><span>封面加载失败</span>
    </span>}
  </div>;
}
