/** Original route pixel statements vs actual extracted owner; only managed
 * reads are fixture ports. Real Sharp, same bytes, no DB/provider. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{build}=require('esbuild'),ts=require('typescript'),sharp=require('sharp');
const option=k=>{const i=process.argv.indexOf(k);return i<0?undefined:process.argv[i+1];};
const root=process.cwd(),base=path.resolve(option('--baseline-root')||'output/refactor-r8c-20261030/rollback-copy'),out=path.resolve(option('--out')||process.env.CANVAS_STITCH_PIXELS_EVIDENCE||'output/canvas-stitch-pixels');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const source=fs.readFileSync(path.join(base,'src/app/api/canvas/stitch/route.ts'),'utf8'),ast=ts.createSourceFile('route.ts',source,99,true),post=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='POST'),block=post.body.statements.find(ts.isTryStatement).tryBlock;
 const statements=block.statements,first=statements.findIndex(n=>n.getText(ast).startsWith('const sources =')),last=statements.findIndex(n=>n.getText(ast).startsWith('const longImage ='));assert(first>=0&&last>=first);
 const oldCode='async function original(images){const artworks=images.map(image=>({image}));const request={url:"http://fixture"};'+statements.slice(first,last+1).map(n=>n.getText(ast)).join('\n')+';return{bytes:longImage,width:targetWidth,height:totalHeight};}exports.original=original;';
 const data=new Map(),m={exports:{}},c={module:m,exports:m.exports,require,Buffer,sharp,MAX_LONG_EDGE:24000,readArtworkImage:async key=>data.get(key)};vm.createContext(c);vm.runInContext(oldCode,c);
 const built=await build({stdin:{contents:"export {prepareCanvasStitch} from './src/lib/canvas/stitch-pixels';",resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'managed-pixel-fixture',setup(b){b.onResolve({filter:/object-storage\/(?:runtime|managed-read)$/},()=>({path:'media',namespace:'fixture'}));b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='empty'?'':'export const isManagedImageUrl=()=>true;export const readManagedObject=async key=>({bytes:globalThis.__stitchBytes.get(key)});'}));}}]});
 const mod={exports:{}},ctx={module:mod,exports:mod.exports,require,Buffer,console,__stitchBytes:data};vm.createContext(ctx);vm.runInContext(built.outputFiles[0].text,ctx);
 const specs=[[[8,6],[8,4]],[[16,9],[8,12]],[[2,3],[3,2]],[[512,1024],[1024,512]],[[1600,100],[2048,160]],[[12,9],[9,12],[10,10]],Array.from({length:12},(_,i)=>[8+i,4+i]),[[20,400],[18,350]],[[9,6],[8,4]],[[15,5],[5,15]],[[1,1],[1,2]],[[4,3],[5,7]]],rows=[];
 for(const [index,spec]of specs.entries()){
  data.clear();const images=[];
  for(const [i,[width,height]]of spec.entries()){
   let image=sharp({create:{width,height,channels:4,background:{r:i?20:200,g:i?120:30,b:80,alpha:index%3===0?.5:1}}});
   const bytes=index===8?await image.jpeg().withMetadata({orientation:6}).toBuffer():await image.png().toBuffer();const key='/media/'+i;data.set(key,bytes);images.push(key);
  }
  const old=await m.exports.original(images),current=await mod.exports.prepareCanvasStitch(images,'http://fixture');assert.equal(current.width,old.width);assert.equal(current.height,old.height);assert(current.bytes.equals(old.bytes),'Exact PNG pixels case'+index);
  rows.push({index,inputs:spec,width:old.width,height:old.height,sha256:crypto.createHash('sha256').update(old.bytes).digest('hex')});
 }
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',cases:rows.length,checks:rows.length*3,baselineRoot:base,originalStatements:'Actual original route AST',sharp:'actual',rows},null,2)+'\n');console.log('CANVAS_STITCH_PIXELS=PASS CASES='+rows.length+' CHECKS='+rows.length*3+' ORIGINAL_ROUTE_AST=ACTUAL SHARP=REAL PNG_BYTES=EXACT EXIF_ALPHA_SCALE_ORDER=RETAINED');
})().catch(error=>{console.error(error);process.exitCode=1;});
