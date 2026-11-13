import { separateCanvasDocks, type DockPlacement, type ToolbarPlacement } from './dock-placement';
export type NodeScreen = {left:number;top:number;bottom:number;cx:number};
export type CanvasSize = {width:number;height:number};
export type SafeArea = {left:number;right:number;top:number;bottom:number};
export type DockMetrics = {dockHeight:number;toolbarHeight:number;toolbarWidth:number;dockMinimumHeight?:number;dockNaturalHeight?:number};

const COMPACT_IMAGE_DOCK_WIDTH = 620;
const COMPACT_IMAGE_SIDE_MIN_WIDTH = 600;
const COMPACT_IMAGE_DOCK_MAX_HEIGHT = 360;
const COMPACT_IMAGE_EXPANDED_HEIGHT = 420;
const COMPACT_IMAGE_EXPANDED_MAX_HEIGHT = 480;

type CompactDockSlot = {
 left:number;width:number;start:number;end:number;align:'start'|'end'|'node';
};

/** Compact media screen-space placement. Slots and their height limits depend on
 * geometry, never on the previous rendered Dock height. The latter only picks
 * a fitting slot and bottom-aligns an upper Dock, so clipping cannot feed a
 * different maximum height back into ResizeObserver on every frame. */
function compactImageDockLayout(node:NodeScreen|undefined,canvas:CanvasSize,metrics:DockMetrics,
 safe:SafeArea,titleHeight:number,expanded:boolean):{dock:DockPlacement|undefined;toolbar:ToolbarPlacement|undefined} {
 if(!node)return {dock:undefined,toolbar:undefined};
 const gap=12,nodeGap=14;
 const availableWidth=canvas.width?Math.max(1,canvas.width-safe.left-safe.right):COMPACT_IMAGE_DOCK_WIDTH;
 const width=Math.min(COMPACT_IMAGE_DOCK_WIDTH,availableWidth);
 const leftBound=safe.left,rightBound=canvas.width?canvas.width-safe.right:leftBound+availableWidth;
 const topBound=safe.top,bottomBound=canvas.height?Math.max(topBound+1,canvas.height-safe.bottom):Infinity;
 const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,Math.max(min,max)));
 const left=clamp(node.cx-width/2,leftBound,rightBound-width);
 const nodeRight=node.left+Math.max(0,2*(node.cx-node.left));
 const titleTop=node.top-Math.max(0,titleHeight);
 const toolbarHeight=metrics.toolbarHeight>0?metrics.toolbarHeight:50;
 const toolbarWidth=Math.min(metrics.toolbarWidth>0?metrics.toolbarWidth:620,availableWidth);
 const toolbarLeft=clamp(node.cx-toolbarWidth/2,leftBound,rightBound-toolbarWidth);
 const toolbar:ToolbarPlacement={left:toolbarLeft+toolbarWidth/2,
  top:clamp(titleTop-gap-toolbarHeight,topBound,bottomBound-toolbarHeight)};
 // A title clamped against the top chrome has no room for an action bar above
 // it. Try below the picture, then beside it, before covering picture pixels.
 if(toolbar.top+toolbarHeight+gap>titleTop&&toolbar.top<node.top+gap){
  if(node.bottom+gap+toolbarHeight<=bottomBound)toolbar.top=Math.max(topBound,node.bottom+gap);
  else if(nodeRight+gap+toolbarWidth<=rightBound){
   toolbar.left=nodeRight+gap+toolbarWidth/2;
   toolbar.top=clamp(node.top,topBound,bottomBound-toolbarHeight);
  }else if(node.left-gap-toolbarWidth>=leftBound){
   toolbar.left=node.left-gap-toolbarWidth/2;
   toolbar.top=clamp(node.top,topBound,bottomBound-toolbarHeight);
  }else toolbar.top=clamp(node.top+gap,topBound,bottomBound-toolbarHeight);
 }
 const measuredMinimum=metrics.dockMinimumHeight??0;
 const minimum=measuredMinimum>0?measuredMinimum:availableWidth<480?260:178;
 // Normal mode follows the real content height. Expanded mode deliberately
 // ignores dockHeight, including the stale height from the preceding mode.
 const desired=expanded
  ?Math.min(COMPACT_IMAGE_EXPANDED_MAX_HEIGHT,Math.max(COMPACT_IMAGE_EXPANDED_HEIGHT,minimum))
  :Math.min(COMPACT_IMAGE_DOCK_MAX_HEIGHT,Math.max(minimum,metrics.dockNaturalHeight||metrics.dockHeight||220));
 const heightLimit=expanded?desired:COMPACT_IMAGE_DOCK_MAX_HEIGHT;
 const splitAround=(slot:CompactDockSlot,obstacle:{left:number;right:number;top:number;bottom:number})=>{
  if(slot.left+slot.width+gap<=obstacle.left||slot.left>=obstacle.right+gap||slot.end<=obstacle.top-gap||slot.start>=obstacle.bottom+gap)return [slot];
  return [{...slot,end:Math.min(slot.end,obstacle.top-gap)},
   {...slot,start:Math.max(slot.start,obstacle.bottom+gap)}].filter(part=>part.end>part.start);
 };
 const toolbarRect={left:toolbar.left-toolbarWidth/2,right:toolbar.left+toolbarWidth/2,
  top:toolbar.top,bottom:toolbar.top+toolbarHeight};
 const clearToolbar=(slots:CompactDockSlot[])=>slots.flatMap(slot=>splitAround(slot,toolbarRect));
 const vertical:CompactDockSlot[]=[
  {left,width,start:Math.max(topBound,node.bottom+nodeGap),end:bottomBound,align:'start'},
  {left,width,start:topBound,end:Math.min(bottomBound,titleTop-nodeGap),align:'end'},
 ];
 const sides:CompactDockSlot[]=[];
 const rightSpace=rightBound-nodeRight-nodeGap,leftSpace=node.left-nodeGap-leftBound;
 if(rightSpace>=COMPACT_IMAGE_SIDE_MIN_WIDTH)sides.push({left:nodeRight+nodeGap,width:Math.min(width,rightSpace),start:topBound,end:bottomBound,align:'node'});
 if(leftSpace>=COMPACT_IMAGE_SIDE_MIN_WIDTH){
  const sideWidth=Math.min(width,leftSpace);
  sides.push({left:node.left-nodeGap-sideWidth,width:sideWidth,start:topBound,end:bottomBound,align:'node'});
 }
 const slots=clearToolbar((expanded?[...sides,...vertical]:[...vertical,...sides]).filter(slot=>slot.end>slot.start));
 const capacity=(slot:CompactDockSlot)=>Math.max(0,Math.min(heightLimit,slot.end-slot.start));
 let chosen=slots.find(slot=>capacity(slot)>=desired);
 if(!chosen){
  // No full-height slot: keep the whole picture visible if the fixed chrome
  // still fits. A long prompt scrolls instead of making a full-screen sheet.
  chosen=slots.filter(slot=>capacity(slot)>=minimum).sort((a,b)=>capacity(b)-capacity(a))[0];
 }
 if(!chosen){
  // The viewport cannot show image + minimum composer simultaneously. Keep
  // title and action bar clear; the bounded sheet may cover image body pixels.
  // If even fixed chrome cannot fit, report the real remaining maxHeight
  // (possibly below minimum) rather than moving a node or the canvas viewport.
  const titleRect={left:node.left,right:nodeRight,top:titleTop,bottom:node.top};
  const fallback=clearToolbar(splitAround({left,width,start:topBound,end:bottomBound,align:'end'},titleRect));
  chosen=[...slots,...fallback].sort((a,b)=>capacity(b)-capacity(a))[0];
  // A title/tool-bar split can leave only a header-sized sliver despite there
  // being room for a useful scrollable sheet. In that constrained case stack
  // the toolbar at the safe top and give the composer the remaining interval.
  // This is independent of the previous measured height, so it converges.
  const stackedSpace=bottomBound-topBound-toolbarHeight-gap;
  // Keyboard-height windows cannot also reserve the selected picture/title.
  // Normal desktop/tablet/phone heights retain the existing title exclusion.
  if(canvas.height<=360&&stackedSpace>0&&(!chosen||capacity(chosen)<Math.min(112,stackedSpace))){
   toolbar.left=toolbarLeft+toolbarWidth/2;toolbar.top=topBound;
   chosen={left,width,start:topBound+toolbarHeight+gap,end:bottomBound,align:'start'};
  }
 }
 const slot=chosen??{left,width,start:topBound,end:topBound+1,align:'start' as const};
 const maxHeight=Math.max(1,capacity(slot)),height=Math.min(desired,maxHeight);
 const top=slot.align==='end'?slot.end-height:slot.align==='node'?clamp(node.top,slot.start,slot.end-height):slot.start;
 return {dock:{left:slot.left,top,width:slot.width,maxHeight,...(expanded?{height}: {})},toolbar};
}

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
export function preferredCanvasDock(nodeScreen:NodeScreen|undefined,canvasSize:CanvasSize,dockWidth:number,overlaySafeArea:SafeArea,selectedTextId:string|null,nodeTitleHeight=0,readOnly=false,measuredToolbarHeight?:number):DockPlacement|undefined {
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
    const narrowImage = !readOnly && !selectedTextId && canvasSize.width > 0 && canvasSize.width < 480;
    const preferredHeight = selectedTextId || narrowImage ? 360 : 310;
    // A narrow image footer has its own action row. Do not select a 220px
    // gap that leaves only the header/footer and clips the editable body;
    // use the existing bottom-sheet placement when neither side fits.
    const minimumComfort = narrowImage
      ? preferredHeight
      : selectedTextId
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
 // Reserve the allowed height, not the current ResizeObserver sample. A dock
 // shortened by this clearance can grow to maxHeight again on the next render;
 // using its sampled height here alternates between clear and colliding layouts.
 const dh=layout.dock.maxHeight??(metrics.dockHeight||310);
 const intersects=(top:number,height:number)=>top<titleBottom&&top+height>titleTop;
 const titleCollision=intersects(layout.toolbar.top,h)||intersects(layout.dock.top,dh);
 const bodyCollision=layout.dock.top<node.bottom&&layout.dock.top+dh>node.top;
 const overlayCollision=layout.dock.top<layout.toolbar.top+h+gap&&layout.dock.top+dh+gap>layout.toolbar.top;
 if(!titleCollision&&!bodyCollision&&!overlayCollision)return layout;
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

export function canvasDockLayout(input:{nodeScreen:NodeScreen|undefined;canvasSize:CanvasSize;dockMetrics:DockMetrics;selectedTextId:string|null;textComposerExpanded:boolean;mediaComposerExpanded?:boolean;readOnly:boolean;nodeTitleHeight?:number;protectNodeTitle?:boolean;compactImage?:boolean}) {
 const {nodeScreen,canvasSize,dockMetrics,selectedTextId,textComposerExpanded,readOnly}=input;
 if(input.compactImage&&!selectedTextId)return compactImageDockLayout(nodeScreen,canvasSize,dockMetrics,canvasOverlaySafeArea(canvasSize),input.nodeTitleHeight??0,!!input.mediaComposerExpanded);
 const overlaySafeArea=canvasOverlaySafeArea(canvasSize),dockWidth=canvasDockWidth(canvasSize,overlaySafeArea);
 const measured=input.protectNodeTitle?(dockMetrics.toolbarHeight>0?dockMetrics.toolbarHeight:50):undefined;
 const dock=preferredCanvasDock(nodeScreen,canvasSize,dockWidth,overlaySafeArea,selectedTextId,input.nodeTitleHeight,readOnly,measured),toolbar=preferredCanvasToolbar(nodeScreen,canvasSize,overlaySafeArea,dockMetrics,input.nodeTitleHeight,measured);
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

export type CanvasOverlayViewport={x:number;y:number;zoom:number};
export type CanvasOverlayNode={x:number;y:number;width:number;height:number};

/** Render/live-transform geometry share the same anchor; no DOM or Flow state. */
export function canvasOverlayNodeScreen(node:CanvasOverlayNode|undefined,viewport:CanvasOverlayViewport):NodeScreen|undefined{
 if(!node)return;
 const z=viewport.zoom||1,left=node.x*z+viewport.x,top=node.y*z+viewport.y;
 return {left,top,bottom:top+node.height*z,cx:left+node.width*z/2};
}

/** Minimal pan after selection/area changes. Never changes zoom or node data.
 * The view hook decides when to run; pure geometry cannot initiate navigation. */
export function canvasAnchorViewport(input:{node:CanvasOverlayNode|undefined;viewport:CanvasOverlayViewport;size:CanvasSize;safeArea:SafeArea;selectedText:boolean;titleHeight:number;protectNodeTitle?:boolean;compactImage?:boolean;metrics?:DockMetrics}):CanvasOverlayViewport|undefined{
 const {node,viewport:current,size:canvasSize,safeArea:overlaySafeArea,selectedText,titleHeight}=input;
 if(!node||!canvasSize.width||!canvasSize.height)return;
 const left=node.x*current.zoom+current.x,top=node.y*current.zoom+current.y;
 const right=left+node.width*current.zoom,bottom=top+node.height*current.zoom;
 const safeLeft=overlaySafeArea.left,safeRight=canvasSize.width-overlaySafeArea.right,defaultSafeTop=overlaySafeArea.top+(input.protectNodeTitle?(input.metrics?.toolbarHeight||50)+12+titleHeight:58);
 // The view toolbar occupies only the left224px, not the complete canvas width.
 const nodeIntersectsViewToolbar=left<=224&&right>=overlaySafeArea.left;
 const safeBottom=canvasSize.height-(nodeIntersectsViewToolbar?overlaySafeArea.bottom:overlaySafeArea.right);
 const estimatedDockHeight=selectedText?(canvasSize.width<480?240:218):220;
 const stackedSafeTop=input.protectNodeTitle
  ?overlaySafeArea.top+Math.max(estimatedDockHeight,input.metrics?.dockMinimumHeight||(canvasSize.width<480?300:178))+(input.metrics?.toolbarHeight||50)+24+titleHeight
  :overlaySafeArea.top+estimatedDockHeight+70+titleHeight;
 let dx=0,dy=0;
 const visibleWidth=safeRight-safeLeft,nodeWidth=right-left,nodeHeight=bottom-top;
 const safeTop=!input.compactImage&&safeBottom-stackedSafeTop>=nodeHeight?stackedSafeTop:defaultSafeTop,visibleHeight=safeBottom-safeTop;
 if(nodeWidth>visibleWidth)dx=safeLeft+(visibleWidth-nodeWidth)/2-left;
 else if(left<safeLeft)dx=safeLeft-left;
 else if(right>safeRight)dx=safeRight-right;
 if(nodeHeight>visibleHeight)dy=safeTop+(visibleHeight-nodeHeight)/2-top;
 else if(top<safeTop)dy=safeTop-top;
 else if(bottom>safeBottom)dy=safeBottom-bottom;
 if(Math.abs(dx)<1&&Math.abs(dy)<1)return;
 return {x:current.x+dx,y:current.y+dy,zoom:current.zoom};
}
