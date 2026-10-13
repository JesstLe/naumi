import assert from 'node:assert/strict';
async function main() {
 const media=await import('../src/lib/canvas/media-loading');
 assert.equal(typeof media.canvasMediaVariant,'function','zoom-aware media sizing');
 assert.equal(media.canvasMediaVariant(120,2),'thumbnail');
 assert.equal(media.canvasMediaVariant(420,2),'preview');
 assert.equal(media.canvasMediaVariant(1800,1),'original');
 const queue=new media.MediaLoadQueue(2),started:number[]=[];
 const done:Array<()=>void>=[];
 for(let i=0;i<4;i++) done.push(queue.enqueue(()=>started.push(i)));
 assert.deepEqual(started,[0,1],'concurrency bounded');
 done[3]();done[0]();assert.deepEqual(started,[0,1,2],'cancelled pending image never starts');
 done[1]();done[2]();assert.equal(queue.active,0);
 console.log('PASS canvas thumbnail/preview/original selection, bounded concurrency and cancellation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
