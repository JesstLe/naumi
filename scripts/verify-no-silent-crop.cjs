const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const ts=require('typescript'),esbuild=require('esbuild'),sharp=require('sharp');
const mode=process.argv[2]||'MODIFIED',out=path.resolve(process.argv[3]||'output/no-silent-crop47-20261015');fs.mkdirSync(out,{recursive:true});
const routeFile=mode==='BASELINE'?path.join(out,'BASELINE_FILE.ts'):mode==='ROLLBACK'?path.join(out,'ROLLBACK_COPY.ts'):'src/app/api/generate-image/route.ts';
const source=fs.readFileSync(routeFile,'utf8'),ast=ts.createSourceFile('route.ts',source,99,true);
const names=['cropToRatio','padToRatio','detectUniformBorder','enforceOutputShape','attachImageDimensions'];const fns=[];
ts.forEachChild(ast,n=>{if(ts.isFunctionDeclaration(n)&&names.includes(n.name?.text))fns.push(n.getText(ast));});
const shape=esbuild.transformSync(fs.readFileSync('src/lib/imagegen/output-shape.ts','utf8').replace('import "server-only";','').replace('import sharp from "sharp";','').replace(/export /g,''),{loader:'ts',format:'cjs'}).code;
// Bind the same installed Sharp in the VM; native dynamic import needs VM module flags.
const code=esbuild.transformSync(fns.join('\n')+'\nglobalThis.test={enforceOutputShape,attachImageDimensions};',{loader:'ts',format:'cjs'}).code.replace(/import\("sharp"\)/g,'Promise.resolve({default:__sharp})');
const dataUrlToBytes=url=>url.startsWith('data:')?{bytes:Buffer.from(url.split(',')[1],'base64')}:null;
const ctx=vm.createContext({require,Buffer,sharp,__sharp:sharp,dataUrlToBytes});vm.runInContext(shape+code,ctx);
const aspectCode=esbuild.transformSync(fs.readFileSync('src/lib/imagegen/aspect.ts','utf8').replace(/export /g,'')+'\nglobalThis.aspect={inheritedImageRatio,imageAspectInstruction};',{loader:'ts'}).code;
vm.runInContext(aspectCode,ctx);
(async()=>{
 const W=1024,H=1536,raw=Buffer.alloc(W*H*3);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*3;raw[i]=y<90?255:20;raw[i+1]=y>H-91?255:60;raw[i+2]=x<70||x>W-71?255:100;}
 const bytes=await sharp(raw,{raw:{width:W,height:H,channels:3}}).png().toBuffer();fs.writeFileSync(path.join(out,'EDGE_FIXTURE.png'),bytes);
 const original={id:'fixture',url:'data:image/png;base64,'+bytes.toString('base64'),ratio:'3:4'};
 const p={ratio:'3:4',targetWidth:0,targetHeight:0,transparent:false};
 const result=(await ctx.test.enforceOutputShape([original],p))[0],output=dataUrlToBytes(result.url).bytes,meta=await sharp(output).metadata();
 fs.writeFileSync(path.join(out,mode+'_OUTPUT.png'),output);
 if(mode!=='MODIFIED'){
  assert.equal(meta.height,1365);assert.notDeepEqual(output,bytes);
  console.log(`${mode}=PASS INPUT=1024x1536 OUTPUT=1024x1365 REMOVED_ROWS=171 SILENT_CROP=REPRODUCED EXIT=0`);return;
 }
 assert.deepEqual(output,bytes);assert.equal(meta.height,H);
 for(const ratio of ['auto','1:1','9:16','16:9','3:4']){const r=(await ctx.test.enforceOutputShape([original],{...p,ratio}))[0];assert.equal(r.url,original.url);}
 const transparent=await sharp(bytes).ensureAlpha(.6).png().toBuffer();assert.deepEqual(await ctx.preserveGeneratedFrame(transparent,p),transparent);
 const resized=await ctx.preserveGeneratedFrame(bytes,{targetWidth:800,targetHeight:800});const rr=await sharp(resized).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([rr.info.width,rr.info.height],[800,800]);
 // Explicit contain retains the top-red and bottom-green test bands; sides are padded, not cropped.
 const pixel=(x,y)=>Array.from(rr.data.subarray((y*800+x)*3,(y*800+x)*3+3));assert.deepEqual(pixel(400,1),[255,60,100]);assert.deepEqual(pixel(400,798),[20,255,100]);
 const tr=await ctx.preserveGeneratedFrame(transparent,{targetWidth:800,targetHeight:800});assert.ok((await sharp(tr).metadata()).hasAlpha);
 const dimensions=(await ctx.test.attachImageDimensions([{...original,ratio:'1:1'}]))[0];assert.equal(dimensions.ratio,'2:3');assert.equal(dimensions.width,1024);assert.equal(dimensions.height,1536);
 const a=ctx.aspect;assert.equal(a.inheritedImageRatio('auto',{width:750,height:1000}),'3:4');assert.equal(a.inheritedImageRatio('auto',{width:1024,height:1365}),'3:4');assert.equal(a.inheritedImageRatio('auto',{width:1000,height:731}),'auto');assert.equal(a.inheritedImageRatio('16:9',{width:750,height:1000}),'16:9');assert.ok(a.imageAspectInstruction('auto',{width:1000,height:731}).includes('1000×731'));
 const exif=await sharp({create:{width:100,height:200,channels:3,background:'#ff0000'}}).jpeg().withMetadata({orientation:6}).toBuffer();
 assert.deepEqual(JSON.parse(JSON.stringify(await ctx.sourceImageDimensions(exif))),{width:200,height:100});
 const exifResult=(await ctx.test.attachImageDimensions([{url:'data:image/jpeg;base64,'+exif.toString('base64')}]))[0];assert.equal(exifResult.width,200);assert.equal(exifResult.height,100);assert.equal(exifResult.ratio,'2:1');
 assert.equal(await ctx.sourceImageDimensions(),undefined);
 assert.ok(!source.includes('async function cropToRatio'));assert.ok(!/fit:\s*["']cover["']/.test(source));
 console.log('MODIFIED=PASS INPUT=1024x1536 OUTPUT=1024x1536 BYTES=EXACT ALL_EDGES=PRESERVED CUSTOM=CONTAIN SOURCE_RATIO=3:4 EXPLICIT_OVERRIDE=16:9 ACTUAL_METADATA=2:3 PAID_CALLS=0 EXIT=0');
})().catch(e=>{console.error(e);process.exitCode=1;});

