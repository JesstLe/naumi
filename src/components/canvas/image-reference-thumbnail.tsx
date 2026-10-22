"use client";
import { Maximize2, X } from "lucide-react";
import { CachedImage } from "@/components/cached-image";

export function ImageReferenceThumbnail({ src, title, number, english = false, onInsert, onPreview, onRemove }: {
  src: string; title: string; number: number; english?: boolean;
  onInsert?: () => void; onPreview: () => void; onRemove?: () => void;
}) {
  const label = english ? `Image${number}` : `图片${number}`;
  return (
    <div data-image-reference={number} className="group relative h-[52px] w-[52px] flex-none rounded-[9px] border border-[var(--canvas-ui-border)] bg-white">
      <button type="button" aria-label={onInsert ? (english ? `Insert ${label}` : `引用${label}`) : (english ? `Preview ${label}` : `查看${label}`)}
        title={`${label}${title ? ` · ${title}` : ""}`} onMouseDown={event => event.preventDefault()} onClick={onInsert || onPreview}
        className="relative block h-full w-full overflow-hidden rounded-[8px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315fc8]">
        <CachedImage src={src} alt={title || label} className="h-full w-full object-cover" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-white/95 py-0.5 text-center text-[10px] font-semibold leading-3 text-[#26334d]">{label}</span>
      </button>
      {onInsert && <button type="button" aria-label={english ? `Preview ${label}` : `查看${label}`} onMouseDown={event => event.preventDefault()} onClick={onPreview}
        className="absolute left-0 top-0 flex h-5 w-5 items-center justify-center rounded-br-md rounded-tl-[8px] bg-white/95 text-[#334155] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
        <Maximize2 aria-hidden="true" className="h-3 w-3" />
      </button>}
      {onRemove && <button type="button" aria-label={english ? `Remove ${label}` : `移除${label}`} onMouseDown={event => event.preventDefault()} onClick={onRemove}
        className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-md rounded-tr-[8px] bg-white/95 text-[#475569] hover:bg-red-50 hover:text-red-600">
        <X aria-hidden="true" className="h-3 w-3" />
      </button>}
    </div>
  );
}
