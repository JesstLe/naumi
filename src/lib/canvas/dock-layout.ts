import { separateCanvasDocks, type DockPlacement, type ToolbarPlacement } from './dock-placement';
export type NodeScreen = {left:number;top:number;bottom:number;cx:number};
export type CanvasSize = {width:number;height:number};
export type SafeArea = {left:number;right:number;top:number;bottom:number};
export type DockMetrics = {dockHeight:number;toolbarHeight:number;toolbarWidth:number;dockMinimumHeight?:number};
export function canvasOverlaySafeArea(canvasSize:CanvasSize):SafeArea {
 return {left:8,right:8,top:canvasSize.width>0&&canvasSize.width<768?108:64,bottom:canvasSize.width>0&&canvasSize.width<1000?128:84};
}
export function canvasDockWidth(canvasSize:CanvasSize,overlaySafeArea:SafeArea) {
 return canvasSize.width?Math.max(1,Math.min(820,canvasSize.width-overlaySafeArea.left-overlaySafeArea.right)):820;
}
export function canvasAnchorCenter(nodeScreen:NodeScreen|undefined,canvasSize:CanvasSize,dockWidth:number,overlaySafeArea:SafeArea):number|undefined {
    if (!nodeScreen) return undefined;
    const cw = canvasSize.width;
    const HALF = dockWidth / 2;
    let cx = nodeScreen.cx;
    if (cw) {
      cx = Math.max(
        HALF + overlaySafeArea.left,
        Math.min(cx, cw - HALF - overlaySafeArea.right)
      );
      // 低高度宽窗口中，尽量把 Dock 推到左下视图工具条右侧。这样可以安全使用
      // 更低的 bottom inset，为 Dock + 节点工具条 + 节点主体腾出完整纵向空间。
      const viewToolbarClearance = 232;
      const maxDockLeft = cw - dockWidth - overlaySafeArea.right;
      if (
        canvasSize.height > 0 &&
        canvasSize.height < 680 &&
        maxDockLeft >= viewToolbarClearance
      ) {
        cx = Math.max(cx, viewToolbarClearance + HALF);
      }
    }
    return cx;
}
export function preferredCanvasDock(nodeScreen:NodeScreen|undefined,canvasSize:CanvasSize,dockWidth:number,overlaySafeArea:SafeArea,selectedTextId:string|null,nodeTitleHeight=0,measuredToolbarHeight?:number):DockPlacement|undefined {
 const anchorCenterX=canvasAnchorCenter(nodeScreen,canvasSize,dockWidth,overlaySafeArea);
 if(!nodeScreen||anchorCenterX==null)return undefined;
    const ch = canvasSize.height;
    const left = anchorCenterX - dockWidth / 2;
    if (!ch) return { left, top: nodeScreen.bottom + 14, width: dockWidth };
    const safeTop = overlaySafeArea.top;
    // 左下视图工具条只占约 216px 宽；Dock 与它横向不相交时保留普通 8px
    // 即可，避免在宽屏无谓压缩用户手动扩展的提示词编辑区。
    // 主工具栏常驻底部；所有生成 Dock 都要预留其高度，不能再依赖“选中时隐藏工具栏”。
    const bottomInset = overlaySafeArea.bottom;
    const safeBottom = Math.max(safeTop + 120, ch - bottomInset);
    // The image action bar is 49.5px in Chromium. When it is clamped to the
    // top safe area (notably 390px wide screens), the node itself can sit
    // underneath it, so positioning the Dock from the node bottom alone lets
    // the two overlays overlap. Reserve the rendered toolbar plus an 8px gap.
    const topbarHeight = measuredToolbarHeight ?? 50;
    const topbarTop = Math.max(safeTop, nodeScreen.top - topbarHeight - 12 - nodeTitleHeight);
    const belowTop = Math.max(
      nodeScreen.bottom + 14,
      topbarTop + topbarHeight + 8
    );
    const belowSpace = Math.max(0, safeBottom - belowTop);
    const nodeToolbarReserve = measuredToolbarHeight === undefined ? 70 : topbarHeight + 24;
    const aboveBottom = nodeScreen.top - nodeToolbarReserve - nodeTitleHeight;
    const aboveSpace = Math.max(0, aboveBottom - safeTop);
    const preferredHeight = selectedTextId ? 360 : 310;
    const minimumComfort = selectedTextId
      ? canvasSize.width < 480
        ? 240
        : 218
      : 220;
    // 优先选择能容纳完整自适应输入区的一侧；两侧都不足时选择空间更大的一侧。
    const useBelow =
      belowSpace >= preferredHeight ||
      (belowSpace >= minimumComfort && belowSpace >= aboveSpace);
    if (useBelow) {
      return {
        left,
        top: Math.max(safeTop, belowTop),
        width: dockWidth,
        maxHeight: Math.max(120, belowSpace),
      };
    }
    if (aboveSpace >= minimumComfort) {
      // The top is computed from this height. Allowing the panel to grow beyond
      // it puts a long prompt/footer inside the action bar above the node.
      const maxHeight = Math.min(preferredHeight, aboveSpace);
      return {
        left,
        top: Math.max(safeTop, aboveBottom - Math.min(preferredHeight, maxHeight)),
        width: dockWidth,
        maxHeight,
      };
    }

    // 两侧都放不下时退化为画布内底部 sheet。它始终位于安全区内，
    // 不再覆盖顶部项目 chrome，也不会压住左下视图工具条。
    const availableHeight = Math.max(120, safeBottom - safeTop);
    const sheetHeight = Math.min(preferredHeight, availableHeight);
    return {
      left,
      top: Math.max(safeTop, safeBottom - sheetHeight),
      width: dockWidth,
      maxHeight: sheetHeight,
    };
}
export function preferredCanvasToolbar(nodeScreen:NodeScreen|undefined,canvasSize:CanvasSize,overlaySafeArea:SafeArea,dockMetrics:DockMetrics,nodeTitleHeight=0,measuredToolbarHeight?:number):ToolbarPlacement|undefined {
    if (!nodeScreen) return undefined;
    const TBAR_H = measuredToolbarHeight ?? 46;
    const cw = canvasSize.width;
    const availableWidth = Math.max(
      1,
      cw - overlaySafeArea.left - overlaySafeArea.right
    );
    const renderedWidth = Math.min(dockMetrics.toolbarWidth || 1088, availableWidth);
    const half = renderedWidth / 2;
    const left = cw
      ? Math.max(
          overlaySafeArea.left + half,
          Math.min(
            nodeScreen.cx,
            cw - overlaySafeArea.right - half
          )
        )
      : nodeScreen.cx;
    const top = Math.max(overlaySafeArea.top, nodeScreen.top - TBAR_H - 12 - nodeTitleHeight);
    return { left, top };
}
/** Header sits outside the React Flow image box and scales with the canvas,
 * whereas the composer and toolbar are unscaled screen-space overlays. */
export function canvasImageTitleInset(zoom:number) {
 return 38 * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
}

function protectImageTitle(layout:{dock:DockPlacement;toolbar:ToolbarPlacement},node:NodeScreen,titleHeight:number,
  metrics:DockMetrics,safeTop:number,safeBottom:number) {
 const gap=12,h=metrics.toolbarHeight>0?metrics.toolbarHeight:50;
 const minimum=metrics.dockMinimumHeight||120;
 const titleTop=node.top-titleHeight,titleBottom=node.top;
 const dh=Math.min(metrics.dockHeight||310,layout.dock.maxHeight??310);
 const intersects=(top:number,height:number)=>top<titleBottom&&top+height>titleTop;
 const titleCollision=intersects(layout.toolbar.top,h)||intersects(layout.dock.top,dh);
 const bodyCollision=layout.dock.top<node.bottom&&layout.dock.top+dh>node.top;
 if(!titleCollision&&!bodyCollision)return layout;
 const upperEnd=Math.min(safeBottom,titleTop-gap),lowerStart=Math.max(safeTop,titleBottom+gap);
 const above=Math.max(0,upperEnd-safeTop),below=Math.max(0,safeBottom-lowerStart);
 const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(n,Math.max(lo,hi)));
 const belowImage=Math.max(0,safeBottom-node.bottom-gap);
 // Prefer leaving the picture itself visible too. A bounded scrollable
 // composer above the action bar beats covering the selected image with a sheet.
 if(above>=h+gap+minimum){
   const maxHeight=Math.min(layout.dock.maxHeight??310,above-h-gap);
   const toolbar={...layout.toolbar,top:upperEnd-h};
   return {toolbar,dock:{...layout.dock,maxHeight,top:toolbar.top-gap-Math.min(dh,maxHeight)}};
 }
 if(above>=h&&belowImage>=minimum)return {
   toolbar:{...layout.toolbar,top:upperEnd-h},
   dock:{...layout.dock,top:node.bottom+gap,maxHeight:Math.min(layout.dock.maxHeight??310,belowImage)},
 };
 if(!titleCollision)return layout;
 // Split the two overlays around the title when both sides have useful room.
 if(above>=h&&below>=minimum)return {
   toolbar:{...layout.toolbar,top:clamp(layout.toolbar.top,safeTop,upperEnd-h)},
   dock:{...layout.dock,top:lowerStart,maxHeight:Math.min(layout.dock.maxHeight??310,below)},
 };
 if(below>=h&&above>=minimum){
   const maxHeight=Math.min(layout.dock.maxHeight??310,above);
   return {toolbar:{...layout.toolbar,top:lowerStart},dock:{...layout.dock,maxHeight,top:upperEnd-Math.min(dh,maxHeight)}};
 }
 // A short viewport has one usable side. Keep the header visible and shrink
 // only the scrollable composer; never raise the title over interactive buttons.
 const lo=above>=below?safeTop:lowerStart,hi=above>=below?upperEnd:safeBottom;
 if(hi-lo<h+gap+1)return layout;
 return separateCanvasDocks({...layout,dockHeight:dh,toolbarHeight:h,safeTop:lo,safeBottom:hi});
}

/** Expanded images use the largest title-free interval. The current measured
 * dock height must not choose this interval: it changes after expansion and
 * would otherwise make ResizeObserver repeatedly shrink/reposition the panel. */
function expandAroundImageTitle(dock:DockPlacement,toolbar:ToolbarPlacement,node:NodeScreen,titleHeight:number,
  metrics:DockMetrics,safeTop:number,safeBottom:number) {
 const gap=12,h=metrics.toolbarHeight>0?metrics.toolbarHeight:50;
 const upperEnd=Math.max(safeTop,Math.min(safeBottom,node.top-titleHeight-gap));
 const lowerStart=Math.min(safeBottom,Math.max(safeTop,node.top+gap));
 const above=upperEnd-safeTop,below=safeBottom-lowerStart;
 const options:Array<{dockTop:number;dockHeight:number;toolbarTop:number}>=[];
 // Putting the action bar on the other side leaves the entire interval for
 // editing. If only one side is usable, stack the two overlays on that side.
 if(above>=h&&below>0)options.push({dockTop:lowerStart,dockHeight:below,toolbarTop:upperEnd-h});
 if(below>=h&&above>0)options.push({dockTop:safeTop,dockHeight:above,toolbarTop:lowerStart});
 if(above>h+gap)options.push({dockTop:safeTop,dockHeight:above-h-gap,toolbarTop:upperEnd-h});
 if(below>h+gap)options.push({dockTop:lowerStart+h+gap,dockHeight:below-h-gap,toolbarTop:lowerStart});
 const best=options.sort((a,b)=>b.dockHeight-a.dockHeight)[0];
 return best?{dock:{...dock,top:best.dockTop,height:best.dockHeight,maxHeight:best.dockHeight},toolbar:{...toolbar,top:best.toolbarTop}}:undefined;
}

export function canvasDockLayout(input:{nodeScreen:NodeScreen|undefined;canvasSize:CanvasSize;dockMetrics:DockMetrics;selectedTextId:string|null;textComposerExpanded:boolean;mediaComposerExpanded?:boolean;readOnly:boolean;nodeTitleHeight?:number;protectNodeTitle?:boolean}) {
 const {nodeScreen,canvasSize,dockMetrics,selectedTextId,textComposerExpanded,readOnly}=input;
 const overlaySafeArea=canvasOverlaySafeArea(canvasSize),dockWidth=canvasDockWidth(canvasSize,overlaySafeArea);
 const measured=input.protectNodeTitle?(dockMetrics.toolbarHeight>0?dockMetrics.toolbarHeight:50):undefined;
 const dock=preferredCanvasDock(nodeScreen,canvasSize,dockWidth,overlaySafeArea,selectedTextId,input.nodeTitleHeight,measured),toolbar=preferredCanvasToolbar(nodeScreen,canvasSize,overlaySafeArea,dockMetrics,input.nodeTitleHeight,measured);
 // Expand the composer, never the canvas viewport or its node. For images,
 // retain the title/pixel clearance instead of returning the full-screen
 // sheet before the opt-in title protection has had a chance to run.
 if(dock&&toolbar&&canvasSize.height&&input.mediaComposerExpanded&&!selectedTextId){
  const safeBottom=Math.max(overlaySafeArea.top+1,canvasSize.height-overlaySafeArea.bottom);
  if(input.protectNodeTitle&&nodeScreen&&input.nodeTitleHeight){
   const protectedExpansion=expandAroundImageTitle(dock,toolbar,nodeScreen,input.nodeTitleHeight,dockMetrics,overlaySafeArea.top,safeBottom);
   if(protectedExpansion)return protectedExpansion;
  }
  const top=Math.min(safeBottom-1,overlaySafeArea.top+Math.max(0,dockMetrics.toolbarHeight)+12);
  const height=Math.max(1,safeBottom-top);
  return {dock:{...dock,top,height,maxHeight:height},toolbar:{...toolbar,top:overlaySafeArea.top}};
 }
 if(!dock||!toolbar||!canvasSize.height||readOnly)return {dock,toolbar};
 const placed=separateCanvasDocks({dock:textComposerExpanded&&selectedTextId?{...dock,top:overlaySafeArea.top,maxHeight:canvasSize.height-overlaySafeArea.bottom-overlaySafeArea.top}:dock,toolbar,
 dockHeight:textComposerExpanded&&selectedTextId?canvasSize.height-overlaySafeArea.bottom-overlaySafeArea.top:dockMetrics.dockHeight||(selectedTextId?360:310),toolbarHeight:dockMetrics.toolbarHeight,safeTop:overlaySafeArea.top,safeBottom:canvasSize.height-overlaySafeArea.bottom});
 return input.protectNodeTitle&&nodeScreen&&input.nodeTitleHeight
   ?protectImageTitle(placed,nodeScreen,input.nodeTitleHeight,dockMetrics,overlaySafeArea.top,canvasSize.height-overlaySafeArea.bottom):placed;
}
