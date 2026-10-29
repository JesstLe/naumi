// Immutable numerical baseline from e6835722 src/lib/mock-data.ts. Test-only.
export const IMAGE_NODE_DEFAULT_LONG_SIDE = 420;
export const IMAGE_NODE_MAX_LONG_SIDE = 720;
export const IMAGE_NODE_MIN_SHORT_SIDE = 120;

/**
 * 将任意原图尺寸映射为画布上的舒适初始尺寸。原图像素保持不变，
 * 这里只决定无限画布节点的可视大小，避免高分辨率图片过大或缩得看不清。
 */
export function adaptiveCanvasImageSize(width?: number | null, height?: number | null) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return { width: 320, height: 200 };
  }
  const longSide = Math.max(sourceWidth, sourceHeight);
  const shortSide = Math.min(sourceWidth, sourceHeight);
  const scale = Math.min(
    IMAGE_NODE_MAX_LONG_SIDE / longSide,
    Math.max(
      IMAGE_NODE_DEFAULT_LONG_SIDE / longSide,
      IMAGE_NODE_MIN_SHORT_SIDE / shortSide
    )
  );
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

