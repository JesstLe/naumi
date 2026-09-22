"use client";

import { Sparkles } from "lucide-react";
import { imageModelFamily } from "@/lib/image-model-routing";

/** Compact vector marks for model families; no emoji or raster assets. */
export function ModelIcon({ modelId, size = 16 }: { modelId: string; size?: number }) {
  const family = imageModelFamily(modelId);
  const gradientId = `model-icon-${modelId.replace(/[^a-zA-Z0-9]/g, "-")}`;

  if (family === "nano-banana-2" || family === "nano-banana-pro") {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="flex-none">
        <defs>
          <linearGradient id={gradientId} x1="3" y1="3" x2="21" y2="21">
            <stop offset="0" stopColor="#4285F4" />
            <stop offset="0.48" stopColor="#9B72CB" />
            <stop offset="1" stopColor="#F4B400" />
          </linearGradient>
        </defs>
        <path fill={`url(#${gradientId})`} d="M12 1.8c1.1 5.2 2.9 7 8.2 8.2-5.3 1.2-7.1 3-8.2 8.2-1.1-5.2-2.9-7-8.2-8.2C9.1 8.8 10.9 7 12 1.8Z" />
        <path fill="#fff" opacity=".72" d="M18.7 16.2c.35 1.55.9 2.1 2.5 2.5-1.6.4-2.15.95-2.5 2.5-.35-1.55-.9-2.1-2.5-2.5 1.6-.4 2.15-.95 2.5-2.5Z" />
      </svg>
    );
  }

  if (family === "imagen-4") {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="flex-none">
        <defs>
          <linearGradient id={gradientId} x1="3" y1="21" x2="21" y2="3">
            <stop offset="0" stopColor="#34A853" />
            <stop offset="0.5" stopColor="#4285F4" />
            <stop offset="1" stopColor="#EA4335" />
          </linearGradient>
        </defs>
        <rect x="3" y="3" width="18" height="18" rx="5" fill={`url(#${gradientId})`} />
        <path fill="#fff" d="m7.3 16.8 3.4-7.7h2.2l3.8 7.7h-2.2l-.8-1.8h-4l-.7 1.8H7.3Zm3.1-3.5h2.4l-1.2-2.8-1.2 2.8Z" />
      </svg>
    );
  }

  if (modelId.startsWith("gpt-image") || modelId.startsWith("naumi-image")) {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="flex-none">
        <path fill="currentColor" d="M12 2.2c2.05 0 3.36 1.15 4.1 2.5 1.54-.2 3.37.1 4.4 1.88 1.03 1.77.47 3.52-.48 4.72.95 1.2 1.5 2.95.48 4.72-1.03 1.78-2.86 2.08-4.4 1.88C15.36 19.25 14.05 20.4 12 20.4s-3.36-1.15-4.1-2.5c-1.54.2-3.37-.1-4.4-1.88-1.03-1.77-.47-3.52.48-4.72-.95-1.2-1.5-2.95-.48-4.72 1.03-1.78 2.86-2.08 4.4-1.88.74-1.35 2.05-2.5 4.1-2.5Zm0 3.1c-1.15 0-1.85.72-2.27 1.64l-.42.92-.99-.16c-1-.16-1.95.08-2.43.9-.48.83-.18 1.77.45 2.56l.63.78-.63.78c-.63.79-.93 1.73-.45 2.56.48.82 1.43 1.06 2.43.9l.99-.16.42.92c.42.92 1.12 1.64 2.27 1.64s1.85-.72 2.27-1.64l.42-.92.99.16c1 .16 1.95-.08 2.43-.9.48-.83.18-1.77-.45-2.56l-.63-.78.63-.78c.63-.79.93-1.73.45-2.56-.48-.82-1.43-1.06-2.43-.9l-.99.16-.42-.92C13.85 6.02 13.15 5.3 12 5.3Z" />
      </svg>
    );
  }

  return <Sparkles aria-hidden="true" size={size} strokeWidth={1.8} className="flex-none" />;
}
