export type CanvasMediaVariant = 'thumbnail'|'preview'|'original';
export const CANVAS_PREVIEW_MAX_PIXELS=400;
export function canvasMediaVariant(screenWidth:number, pixelRatio=1):CanvasMediaVariant {
  // High-DPI screens need their real pixel density; capping at 2 leaves a
  // 3x/4x display on a preview after it has already outgrown that preview.
  const pixels=screenWidth*(Number.isFinite(pixelRatio)?Math.max(1,pixelRatio):1);
  // Design canvas: never visibly softer than the source. The lossy 1600px preview
  // is used only with >=4x oversampling (indistinguishable once downscaled); any
  // larger on-screen size gets the original. The 512px thumbnail is not used here.
  return pixels<=CANVAS_PREVIEW_MAX_PIXELS?'preview':'original';
}

/** A ticket owns one slot until load/error, or cancels before the image starts. */
export class MediaLoadQueue {
  active=0;
  private pending:Array<{start:()=>void;running:boolean;cancelled:boolean}>=[];
  constructor(private limit=6) {}
  enqueue(start:()=>void) {
    const ticket={start,running:false,cancelled:false};this.pending.push(ticket);this.drain();
    return ()=>{if(ticket.cancelled)return;ticket.cancelled=true;if(ticket.running)this.active--;this.drain();};
  }
  private drain() {
    this.pending=this.pending.filter(t=>!t.cancelled);
    while(this.active<this.limit&&this.pending.length) {
      const next=this.pending.shift()!;next.running=true;this.active++;next.start();
    }
  }
}

/** Reserve bandwidth only after authorization/cache lookup, not while awaiting
 * metadata. Cancelled offscreen tickets never start a byte transfer. */
export function acquireMediaSlot(queue: MediaLoadQueue, signal?: AbortSignal):Promise<()=>void> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    let finish:()=>void=()=>{}; let settled=false;
    const abort=()=>{finish();if(!settled){settled=true;reject(new DOMException('Aborted','AbortError'));}};
    finish=queue.enqueue(()=>{settled=true;resolve(()=>{signal?.removeEventListener('abort',abort);finish();});});
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}
