"use client";
import { CachedImage } from "@/components/cached-image";

import { ImageIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import { cdnUrl } from "@/lib/cdn";

import { TOOL_DEMOS, type ToolDemoConfig } from "@/lib/tool-demo-catalog";
export { TOOL_DEMOS } from "@/lib/tool-demo-catalog";

/** 取某工具的演示配置。combo / before/after 都可能为空(未配真实图)。 */
export function getDemo(key?: string) {
  if (!key) return null;
  const d = TOOL_DEMOS[key];
  if (!d) return null;
  return { ...d };
}

export function ToolDemo({
  title,
  combo,
  before,
  after,
  gallery,
  beforeLabel,
  beforeLabelEn,
  afterLabel,
  afterLabelEn,
  transparent = false,
  compact = false,
  notice = false,
}: ToolDemoConfig & {
  compact?: boolean;
  notice?: boolean;
}) {
  const { locale } = useI18n();
  const L = (z: string, e: string) => (locale === "en" ? e : z);
  const hasPair = !!before && !!after;
  return (
    <div
      data-testid="tool-demo"
      className={
        compact
          ? "flex w-full flex-col items-center gap-3 text-center"
          : "flex flex-1 flex-col items-center justify-start gap-6 px-4 pb-8 pt-10 text-center"
      }
    >
      <h3
        className={
          compact
            ? "max-w-[90%] text-[16px] font-bold leading-snug text-acc"
            : "max-w-[90%] text-[18px] font-bold leading-snug text-acc sm:text-[21px]"
        }
      >
        {title}
      </h3>
      {gallery?.length ? (
        <div className="grid w-full max-w-[560px] grid-cols-3 items-stretch gap-2 sm:gap-3">
          {gallery.map((g, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <CachedImage
              key={i}
              src={cdnUrl(g)}
              alt={`${title} ${L("示例", "example")} ${i + 1}`}
              width={640}
              height={1080}
              decoding="async"
              className="h-auto w-full min-w-0 rounded-xl border border-c-border bg-white object-contain shadow-card"
            />
          ))}
        </div>
      ) : combo ? (
        <div className="w-full max-w-[460px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <CachedImage
            src={cdnUrl(combo)}
            alt={title}
            className="w-full rounded-2xl border border-c-border object-contain shadow-card"
          />
        </div>
      ) : hasPair ? (
        <div className={`grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3 ${compact ? "max-w-[340px]" : "max-w-[560px]"}`}>
          <figure className="flex min-w-0 flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <CachedImage
              src={cdnUrl(before!)}
              alt={`${title} · ${L(beforeLabel || "原图", beforeLabelEn || "Original")}`}
              width={640}
              height={720}
              decoding="async"
              className="aspect-[8/9] h-auto w-full rounded-xl border border-c-border bg-white object-contain shadow-card"
            />
            <figcaption className="text-[11.5px] text-c-text3">{L(beforeLabel || "原图", beforeLabelEn || "Original")}</figcaption>
          </figure>
          <svg
            aria-hidden="true"
            className="mb-6 h-5 w-5 flex-none text-c-text4 sm:h-6 sm:w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <figure className="flex min-w-0 flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <CachedImage
              src={cdnUrl(after!)}
              alt={`${title} · ${L(afterLabel || "效果示例", afterLabelEn || "Result example")}`}
              width={640}
              height={720}
              decoding="async"
              style={transparent ? { backgroundColor: "#ffffff", backgroundImage: "conic-gradient(#e8edf2 25%, #ffffff 0 50%, #e8edf2 0 75%, #ffffff 0)", backgroundSize: "16px 16px" } : undefined}
              className="aspect-[8/9] h-auto w-full rounded-xl border border-c-border bg-white object-contain shadow-card"
            />
            <figcaption className="text-[11.5px] font-medium text-acc">
              {L(afterLabel || "效果示例", afterLabelEn || "Result example")}
            </figcaption>
          </figure>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2.5 text-c-text3">
          <ImageIcon className="h-9 w-9 text-c-text4" />
          <p className="text-[13px]">{L("上传左侧图片,马上体验", "Upload an image on the left to try it")}</p>
        </div>
      )}
      {notice && (combo || hasPair || gallery?.length) ? (
        <p className="text-[11px] text-c-text4">
          {L("示例为演示素材,实际结果以你的图片为准", "Demo only; results depend on your image")}
        </p>
      ) : null}
    </div>
  );
}
