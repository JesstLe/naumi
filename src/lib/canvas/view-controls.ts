export type CanvasPrimaryTool="move"|"marquee"|"hand";
export type DesktopPlatform="mac"|"windows"|"other";
export const CANVAS_MIN_ZOOM=Number.EPSILON;
export const CANVAS_MAX_ZOOM=Number.MAX_SAFE_INTEGER;

export function detectDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "other";
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = `${nav.userAgentData?.platform ?? ""} ${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  if (/Mac|iPhone|iPad|iPod/i.test(platform)) return "mac";
  if (/Win/i.test(platform)) return "windows";
  return "other";
}

export function zoomPercentInput(zoom: number): string {
  return String(zoom * 100);
}

export function zoomPercentLabel(zoom: number): string {
  const percent = zoom * 100;
  if (percent < 0.01 || percent >= 1_000_000) {
    return `${percent.toExponential(2)}%`;
  }
  if (percent >= 1000) {
    return `${Math.round(percent).toLocaleString("en-US")}%`;
  }
  return `${Number(percent.toFixed(2))}%`;
}
