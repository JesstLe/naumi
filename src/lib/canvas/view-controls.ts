export type CanvasPrimaryTool="move"|"marquee"|"hand";
export type DesktopPlatform="mac"|"windows"|"other";
export const CANVAS_MIN_ZOOM=Number.EPSILON;
export const CANVAS_MAX_ZOOM=Number.MAX_SAFE_INTEGER;

export type CanvasEditableArea={x:number;y:number;width:number;height:number};
/** Original new-node visibility geometry. This never moves document nodes or
 * clamps an existing zoom down to a product preset. */
export function canvasEditableAreaTarget(area:CanvasEditableArea,view:{x:number;y:number;zoom:number},canvas:{clientWidth:number;clientHeight:number}){
  const zoom=Math.max(view.zoom,Math.min(1,Math.max(.75,240/area.width,160/area.height)));
  const left=area.x*view.zoom+view.x,top=area.y*view.zoom+view.y;
  const outside=left+area.width*view.zoom<40||top+area.height*view.zoom<40||left>canvas.clientWidth-40||top>canvas.clientHeight-80;
  return !outside&&view.zoom>=zoom*.95?null:{x:area.x+area.width/2,y:area.y+area.height/2,zoom};
}

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
