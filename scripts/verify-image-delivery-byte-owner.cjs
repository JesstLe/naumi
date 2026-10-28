'use strict';
// The refactor owns Buffer delivery in complete-image-delivery, not HTTP route
// helpers. Exercise the actual byte reader/transform contracts at that boundary.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),ts=require('typescript'),sharp=require('sharp');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const workspace=path.resolve(__dirname,'..'),root=path.resolve(arg('--source-root',workspace)),out=path.resolve(arg('--output',process.env.IMAGE_DELIVERY_BYTES_EVIDENCE||'output/image-delivery-byte-owner')),baseline=args.includes('--baseline');
fs.mkdirSync(out,{recursive:true});
const source=p=>fs.readFileSync(path.join(root,p),'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fn(file,name){const text=source(file),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);ts.forEachChild(n,visit)}visit(ast);assert.ok(found,name);return found;}
function load(text,dependencies={}){const exports={};vm.runInNewContext(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,{exports,Buffer,Uint8Array,URL,AbortSignal,process,console,fetch:()=>{throw Error('Unexpected HTTP')},require:n=>Object.hasOwn(dependencies,n)?dependencies[n]:require(n)});return exports;}
const decode=load(fn('src/lib/object-storage/runtime.ts','dataUrlToBytes')).dataUrlToBytes;
let calls=0,managedReads=0,access=true;
const measured=url=>{calls++;return decode(url);};
const make=baseline?null:load(source('src/lib/imagegen/delivery-bytes.ts')).createImageDeliveryBytes;
const io=load(source('src/lib/canvas-image-input.ts')+'\nexports.bounded=readOwnedCanvasImage;',{
 'server-only':{},'@/lib/object-storage/runtime':{dataUrlToBytes:measured,isManagedImageUrl:url=>url.startsWith('/media/'),privateMedia:true,storageKeyFromManagedUrl:url=>url.slice(7)},
 '@/lib/object-storage/managed-read':{readManagedObject:async()=>{managedReads++;return {bytes:Buffer.from('managed'),contentType:'image/png'};}},
 '@/lib/media-assets':{canReadMedia:async()=>access},'./imagegen/image-limits':load(source('src/lib/imagegen/image-limits.ts')),
});
const frame=load(source('src/lib/imagegen/output-shape.ts'),{'server-only':{}});
const modelText=source('src/lib/mock-data.ts'),modelAst=ts.createSourceFile('model.ts',modelText,ts.ScriptTarget.Latest,true);
const definitions=modelAst.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['MAX_GENERATION_DIMENSION','GENERATION_RESOLUTIONS'].includes(d.name.getText(modelAst))));assert.equal(definitions.length,2);
const resolution=load(definitions.map(n=>n.getText(modelAst)).join('\n')+'\n'+fn('src/lib/mock-data.ts','resolutionLongSide')).resolutionLongSide;
const finish=load(source('src/lib/imagegen/finish-stored-image.ts'),{'server-only':{},'./output-shape':frame,'../mock-data':{resolutionLongSide:resolution},'../media-postprocess':{transformImage:()=>{throw Error('Unexpected configured postprocess')}}}).finishStoredImage;
const records=[];async function check(name,action){await action();records.push({name,pass:true});}
const read=(url,context)=>io.readCanvasOutput(url,'http://fixture.local','owner@fixture.local',context);
(async()=>{
 const bytes=await sharp(crypto.randomBytes(1536*2048*3),{raw:{width:1536,height:2048,channels:3}}).png({compressionLevel:0}).toBuffer();
 const url='data:image/png;base64,'+bytes.toString('base64'),context=()=>make?.(measured);
 await check('actual output reader shares one decode and exact 2K original bytes',async()=>{calls=0;const c=context(),a=await read(url,c),b=await read(url,c);assert.equal(sha(a.buffer),sha(bytes));assert.equal(sha(b.buffer),sha(bytes));assert.equal(calls,baseline?2:1);if(!baseline)assert.equal(a.buffer.buffer,b.buffer.buffer);c?.clear();});
 const small=await sharp({create:{width:80,height:96,channels:4,background:{r:20,g:120,b:40,alpha:.4}}}).png().toBuffer(),smallUrl='data:image/png;base64,'+small.toString('base64');
 await check('explicit frame uses the real shared transform and preserves full frame',async()=>{const c=context(),input=await read(smallUrl,c),result=await finish(input.buffer,{final:false,preset:false,targetWidth:160,targetHeight:160});const meta=await sharp(result).metadata();assert.equal(meta.width,160);assert.equal(meta.height,160);assert.notEqual(sha(result),sha(small));c?.clear();});
 await check('unchanged mapped output retains exact supplier bytes',async()=>{assert.equal(await finish(bytes,{final:false,preset:false,imageParameterPlanVersion:1,resolution:'4K'}),bytes);});
 await check('legacy 2K upscale remains the real frozen transform',async()=>{const result=await finish(small,{final:false,preset:false,resolution:'2K'}),meta=await sharp(result).metadata();assert.equal(Math.max(meta.width,meta.height),2048);});
 await check('final stored output is never reprocessed',async()=>{assert.equal(await finish(small,{final:true,preset:false,resolution:'4K',targetWidth:600,targetHeight:600}),small);});
 await check('EXIF bytes and orientation remain untouched on native output',async()=>{const jpeg=await sharp({create:{width:80,height:96,channels:3,background:'#123456'}}).jpeg().withMetadata({orientation:6}).toBuffer();const c=context(),value=await read('data:image/jpeg;base64,'+jpeg.toString('base64'),c);assert.equal(sha(value.buffer),sha(jpeg));assert.equal((await sharp(value.buffer).metadata()).orientation,6);c?.clear();});
 await check('managed media is re-authorized rather than hidden by inline cache',async()=>{const c=context();access=true;await read('/media/owned.png',c);access=false;await assert.rejects(()=>read('/media/owned.png',c),/无权访问/);assert.equal(managedReads,1);access=true;c?.clear();});
 await check('original input/output size boundary still runs before returning bytes',async()=>{await assert.rejects(()=>io.bounded(smallUrl,'http://fixture.local','owner',16,context()),/读取大小限制/);});
 await check('arbitrary remote image never starts HTTP',async()=>{await assert.rejects(()=>read('https://invalid.example/private.png',context()),/来源不受支持/);});
 if(!baseline){
  await check('changed URL has distinct byte identity and old image retires',async()=>{calls=0;const c=context();c.read(url);c.read(smallUrl);c.retain([smallUrl]);c.read(smallUrl);assert.equal(calls,2);c.read(url);assert.equal(calls,3);c.clear();});
  await check('encoded transform is reused without another base64 decode',async()=>{calls=0;const c=context(),encoded=c.encode(small,'image/png');assert.equal((await read(encoded,c)).buffer.buffer,small.buffer);assert.equal(calls,0);c.clear();});
  await check('attempt isolation, release and finally cleanup permit original-result retry',async()=>{calls=0;const a=context(),b=context();a.read(url);b.read(url);assert.equal(calls,2);a.release(url);a.read(url);assert.equal(calls,3);try{throw Error('storage failure fixture')}catch{}finally{a.clear();b.clear();}a.read(url);assert.equal(calls,4);a.clear();assert.match(source('src/lib/imagegen/complete-image-delivery.ts'),/finally\s*\{\s*deliveryBytes.clear\(\)/);});
 }
 const result={status:'PASS',mode:baseline?'BASELINE':'MODIFIED',cases:records.length,records,sourceRoot:root,actualByteReader:true,actualFrozenTransforms:true,managedAccess:'per read',supplierCalls:0,http:0,storageFailureExecution:'separate verify-image-delivery-continuation PG suite'};
 fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(`IMAGE_DELIVERY_BYTES=${result.mode} CASES=${records.length} PASS=1 OWNER=ACTUAL_BUFFER_DELIVERY DECODE_PER_REPEATED_INLINE=${baseline?2:1} ORIGINAL_BYTES=UNCHANGED MANAGED_AUTH=PER_READ SUPPLIER_CALLS=0`);
})().catch(error=>{fs.writeFileSync(path.join(out,'FAILURE.txt'),String(error.stack));console.error(error);process.exitCode=1;});
