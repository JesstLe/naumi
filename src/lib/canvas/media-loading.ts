export type CanvasMediaVariant = 'thumbnail'|'preview'|'original';
export function canvasMediaVariant(screenWidth:number, pixelRatio=1):CanvasMediaVariant {
  const pixels=screenWidth*Math.min(2,Math.max(1,pixelRatio));
  return pixels<=512?'thumbnail':pixels<=1600?'preview':'original';
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
