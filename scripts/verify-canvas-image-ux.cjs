// Production geometry/download owner, explicit byte/clock ports. No backend writes.
const assert=require('node:assert/strict'),vm=require('node:vm'),{buildSync,build}=require('esbuild');
const compiled=buildSync({stdin:{contents:'export {canvasImageImportGrid} from "./src/lib/canvas/image-size";export {createCanvasDownloads} from "./src/lib/canvas/downloads";',resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const modulePort={exports:{}};vm.runInNewContext(compiled,{module:modulePort,exports:modulePort.exports,require,console,Set,Map,AbortController});
const {canvasImageImportGrid:grid,createCanvasDownloads:downloads}=modulePort.exports;let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;};const spacing={x:90,y:48,title:36,minimumRow:236};
for(let count=1;count<=64;count++){
 const sizes=Array.from({length:count},(_,i)=>({width:120+(i*139)%601,height:120+(i*197)%601})),columns=Math.min(4,Math.ceil(Math.sqrt(count))),result=grid(sizes,columns,spacing);
 ok(result.positions.length===count,'one ordered position per image');
 for(let i=0;i<count;i++){
  if(i>=columns)ok(result.positions[i].x===result.positions[i%columns].x,'shared column alignment');
  ok(result.positions[i].x+sizes[i].width<=result.width,'within batch bounds');
  ok(result.positions[i].y+sizes[i].height+spacing.title<=result.height,'title within row bounds');
  for(let j=0;j<i;j++){const a=result.positions[i],b=result.positions[j];ok(a.x>=b.x+sizes[j].width||b.x>=a.x+sizes[i].width||a.y>=b.y+sizes[j].height+spacing.title||b.y>=a.y+sizes[i].height+spacing.title,'no image/title overlap');}
 }
}
ok(grid([],0,spacing).positions.length===0,'empty selection');
function fixture(){
 const state={current:true,reads:0,encodes:0,saves:[],tips:[],hold:null,fail:false,smaller:true},original=new Blob(['original-image-pixel-bytes']),compressed=new Blob(['small'],{type:'image/webp'});
 const owner=downloads({viewCurrent:()=>state.current,documentCurrent:()=>state.current},{
  image:async()=>{state.reads++;if(state.hold)await state.hold;if(state.fail)throw Error('read failed');return{blob:original,name:'original.png'};},
  compress:async(blob,signal)=>{assert.equal(blob,original);state.encodes++;signal.throwIfAborted();return state.smaller?compressed:null;},
  archive:async()=>new Blob(),save:(blob,name)=>state.saves.push({blob,name}),video:()=>{},
 });
 const feedback={notice:text=>state.tips.push(text),imageFailed:'download failed',archiveFailed:'archive failed',compressionFailed:'compression failed'};
 return{state,owner,compressed,run:()=>owner.compressImage('/media/original.png','主图.png',feedback)};
}
(async()=>{
 const encoder=(await build({stdin:{contents:'export {prepareImageUpload} from "./src/lib/client-image-upload";',resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'auth-port',setup(b){b.onResolve({filter:/supabase$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const authHeader=async()=>({});'}));}}]})).outputFiles[0].text;
 for(const mime of ['image/png','image/webp']){
  let closed=false;const m={exports:{}},canvas={width:0,height:0,getContext:()=>({drawImage(){}}),toBlob:cb=>cb(new Blob(['smaller'],{type:mime}))};
  vm.runInNewContext(encoder,{module:m,exports:m.exports,require,File,Blob,WeakMap,createImageBitmap:async()=>({width:640,height:480,close(){closed=true;}}),document:{createElement:()=>canvas}});
  const original=new File([new Uint8Array(400)],'original.png',{type:'image/png'}),result=await m.exports.prepareImageUpload(original,{force:true,maxEdge:Number.MAX_SAFE_INTEGER});
  ok(result.optimized===(mime==='image/webp'),'encoder fallback never masquerades as WebP');ok(closed,'decoded bitmap always released');
  if(mime==='image/png')ok(result.file===original,'unsupported encoding preserves original object');
  else ok(result.file.type==='image/webp'&&result.width===640&&result.height===480,'explicit compression retains resolution');
 }
 let f=fixture();await f.run();ok(f.state.saves.length===1&&f.state.saves[0].blob===f.compressed,'only compressed bytes saved');ok(f.state.saves[0].name==='主图-compressed.webp','separate filename');ok(!f.owner.getSnapshot().compressing,'busy released');
 f=fixture();let release;f.state.hold=new Promise(r=>release=r);const pending=f.run(),duplicate=f.run();ok(f.state.reads===1&&f.owner.getSnapshot().compressing,'double click shares one admitted compression');release();await Promise.all([pending,duplicate]);ok(f.state.saves.length===1,'one file delivered');
 f=fixture();f.state.hold=new Promise(r=>release=r);const stale=f.run();f.state.current=false;f.owner.cancel();release();await stale;ok(!f.state.saves.length&&!f.owner.getSnapshot().compressing,'account/workspace retirement cannot deliver stale file');
 f=fixture();f.state.smaller=false;await f.run();ok(!f.state.saves.length&&f.state.tips.length===1,'no savings does not disguise the original as compressed');
 f=fixture();f.state.fail=true;await f.run();ok(f.state.tips[0]==='compression failed'&&!f.owner.getSnapshot().compressing,'failure is explicit and releases admission');f.state.fail=false;await f.run();ok(f.state.saves.length===1,'explicit retry works');
 console.log('CANVAS_IMAGE_UX=PASS CHECKS='+checks+' GRID_COUNTS=64 ORIGINAL_WRITES=0 COMPRESSION_DEDUP=PASS SCOPE_CANCEL=PASS SUPPLIER=0');
})().catch(e=>{console.error(e);process.exitCode=1;});
