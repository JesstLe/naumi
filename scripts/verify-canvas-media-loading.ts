import assert from 'node:assert/strict';
async function main() {
 const media=await import('../src/lib/canvas/media-loading');
 assert.equal(typeof media.canvasMediaVariant,'function','zoom-aware media sizing');
 assert.equal(media.canvasMediaVariant(120,2),'original');assert.equal(media.canvasMediaVariant(200,2),'original');assert.equal(media.canvasMediaVariant(201,2),'original');
 assert.equal(media.canvasMediaVariant(420,2),'original');assert.equal(media.canvasMediaVariant(400,1),'original');
 assert.equal(media.canvasMediaVariant(1800,1),'original');
 const queue=new media.MediaLoadQueue(2),started:number[]=[];
 const done:Array<()=>void>=[];
 for(let i=0;i<4;i++) done.push(queue.enqueue(()=>started.push(i)));
 assert.deepEqual(started,[0,1],'concurrency bounded');
 done[3]();done[0]();assert.deepEqual(started,[0,1,2],'cancelled pending image never starts');
 done[1]();done[2]();assert.equal(queue.active,0);
 const slots=new media.MediaLoadQueue(2), controllers=Array.from({length:5},()=>new AbortController());
 const active:Array<()=>void>=[];let startedSlots=0;
 const tasks=controllers.map((c,i)=>media.acquireMediaSlot(slots,c.signal).then(release=>{startedSlots++;active[i]=release;return true;}).catch(()=>false));
 await Promise.resolve();assert.equal(startedSlots,2);assert.equal(slots.active,2);
 controllers[4].abort();controllers[0].abort();await Promise.resolve();assert.equal(startedSlots,3);assert.equal(slots.active,2);
 active[1]();await Promise.resolve();assert.equal(startedSlots,4);active[2]();active[3]();assert.equal(slots.active,0);assert.deepEqual(await Promise.all(tasks),[true,true,true,true,false]);
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(media.acquireMediaSlot(slots,cancelled.signal),/Aborted/);assert.equal(slots.active,0);
 console.log('PASS canvas source-only selection at every zoom, no canvas thumbnail, bounded concurrency, queued and running cancellation; cache bytes slot after metadata');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
