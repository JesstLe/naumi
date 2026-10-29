import { separateCanvasDocks, type DockPlacement, type ToolbarPlacement } from './dock-placement';
export type NodeScreen = {left:number;top:number;bottom:number;cx:number};
export type CanvasSize = {width:number;height:number};
export type SafeArea = {left:number;right:number;top:number;bottom:number};
export type DockMetrics = {dockHeight:number;toolbarHeight:number;toolbarWidth:number};
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
export function preferredCanvasDock(nodeScreen:NodeScreen|undefined,canvasSize:CanvasSize,dockWidth:number,overlaySafeArea:SafeArea,selectedTextId:string|null,nodeTitleHeight=0,readOnly=false):DockPlacement|undefined {
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
    const topbarHeight = 50;
    const topbarTop = Math.max(safeTop, nodeScreen.top - topbarHeight - 12 - nodeTitleHeight);
    const belowTop = Math.max(
      nodeScreen.bottom + 14,
      topbarTop + topbarHeight + 8
    );
    const belowSpace = Math.max(0, safeBottom - belowTop);
    const nodeToolbarReserve = 70;
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
export function preferredCanvasToolbar(nodeScreen:NodeScreen|undefined,canvasSize:CanvasSize,overlaySafeArea:SafeArea,dockMetrics:DockMetrics,nodeTitleHeight=0):ToolbarPlacement|undefined {
    if (!nodeScreen) return undefined;
    const TBAR_H = 46;
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
export function canvasDockLayout(input:{nodeScreen:NodeScreen|undefined;canvasSize:CanvasSize;dockMetrics:DockMetrics;selectedTextId:string|null;textComposerExpanded:boolean;readOnly:boolean;nodeTitleHeight?:number}) {
 const {nodeScreen,canvasSize,dockMetrics,selectedTextId,textComposerExpanded,readOnly}=input;
 const overlaySafeArea=canvasOverlaySafeArea(canvasSize),dockWidth=canvasDockWidth(canvasSize,overlaySafeArea);
 const dock=preferredCanvasDock(nodeScreen,canvasSize,dockWidth,overlaySafeArea,selectedTextId,input.nodeTitleHeight,readOnly),toolbar=preferredCanvasToolbar(nodeScreen,canvasSize,overlaySafeArea,dockMetrics,input.nodeTitleHeight);
 if(!dock||!toolbar||!canvasSize.height||readOnly)return {dock,toolbar};
 return separateCanvasDocks({dock:textComposerExpanded&&selectedTextId?{...dock,top:overlaySafeArea.top,maxHeight:canvasSize.height-overlaySafeArea.bottom-overlaySafeArea.top}:dock,toolbar,
 dockHeight:textComposerExpanded&&selectedTextId?canvasSize.height-overlaySafeArea.bottom-overlaySafeArea.top:dockMetrics.dockHeight||(selectedTextId?360:310),toolbarHeight:dockMetrics.toolbarHeight,safeTop:overlaySafeArea.top,safeBottom:canvasSize.height-overlaySafeArea.bottom});
}
