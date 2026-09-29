"use client";

import { useCallback } from "react";

// ---------------------------------------------------------------------------
// 剪贴板图片粘贴(截图 Ctrl+V):从 ClipboardEvent 提取图片文件。
// 画布/工具页/对话输入框共用;纯文本剪贴板返回空数组,不干扰正常文本粘贴。
// ---------------------------------------------------------------------------

export function extractClipboardImages(
  event: ClipboardEvent | React.ClipboardEvent
): File[] {
  const items = Array.from(event.clipboardData?.items ?? []);
  return items
    .filter((item) => item.kind === "file" && /^image\//.test(item.type))
    .map((item) => item.getAsFile())
    .filter((f): f is File => Boolean(f));
}

/**
 * onPaste 处理器工厂:剪贴板里有图片时拦截并交给 onImages;
 * 无图片时静默放行(文本粘贴不受影响)。
 */
export function useClipboardImagePaste(
  onImages: (files: File[]) => void,
  enabled = true
) {
  return useCallback(
    (event: React.ClipboardEvent) => {
      if (!enabled) return;
      const files = extractClipboardImages(event);
      if (!files.length) return;
      event.preventDefault();
      onImages(files);
    },
    [onImages, enabled]
  );
}
