// Pure shared display dimensions. No UI, mock catalog or storage imports.
export const IMAGE_NODE_DEFAULT_LONG_SIDE = 420;
export const IMAGE_NODE_MAX_LONG_SIDE = 720;
export const IMAGE_NODE_MIN_SHORT_SIDE = 120;

/** Import-only grid. Each column shares an x anchor across differently shaped
 * rows; row height reserves the tallest image and its external title. */
export function canvasImageImportGrid(sizes:readonly {width:number;height:number}[],columns:number,
  spacing:{x:number;y:number;title:number;minimumRow:number}) {
  if(!sizes.length)return {width:0,height:0,positions:[] as {x:number;y:number}[]};
  const count=Math.max(1,Math.min(sizes.length,Math.floor(columns)||1));
  const widths=Array.from({length:count},(_,column)=>Math.max(...sizes.filter((_,index)=>index%count===column).map(size=>size.width)));
  const xs=widths.map((_,column)=>widths.slice(0,column).reduce((sum,width)=>sum+width+spacing.x,0));
  let height=0;const positions:{x:number;y:number}[]=[];
  for(let start=0;start<sizes.length;start+=count){
    const row=sizes.slice(start,start+count);
    row.forEach((_,column)=>positions.push({x:xs[column],y:height}));
    height+=Math.max(spacing.minimumRow,...row.map(size=>size.height+spacing.title))+spacing.y;
  }
  return {width:widths.reduce((sum,width)=>sum+width,0)+spacing.x*(count-1),height:height-spacing.y,positions};
}

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

