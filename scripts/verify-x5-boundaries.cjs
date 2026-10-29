// Deterministic boundary checks: actual codec/storage/parser/recovery selection;
// I/O seams count reads, not authorization or fencing replacements. No network/PG.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {createHash}=require('node:crypto');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..')),baseline=process.argv[3]==='baseline';
const text=name=>fs.readFileSync(path.join(root,name),'utf8'),sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=Buffer.from('synthetic checkpoint fixture'),job='owner-A-job',other='owner-B-job';
const key=`image-job-results/${sha(job)}/${sha(bytes)}.bin`,url='/media/'+key;
let reads=0;const objects=new Map([[key,bytes]]),cache=new Map();
const load=rel=>{
 if(cache.has(rel))return cache.get(rel);
 const module={exports:{}};cache.set(rel,module.exports);
 const mocks={
  './object-storage/config':{storageConfiguration:()=>({driver:'local',enabled:true,privateMedia:true,mediaDir:'/fixture',accessMode:'proxy'})},
  './object-storage/adapter':{createObjectStorage:()=>({}),safeStorageKey:k=>{if(k.includes('..'))throw Error('key');return k}},
  'fs/promises':{stat:async f=>{reads++;const b=objects.get(f.replaceAll('\\','/').replace(/^.*?\/fixture\//,''));if(!b)throw Object.assign(Error('MISSING'),{code:'ENOENT'});return {isFile:()=>true,size:b.length}},readFile:async f=>objects.get(f.replaceAll('\\','/').replace(/^.*?\/fixture\//,'')),mkdir:async()=>{}},
 };
 const req=s=>s==='server-only'?{}:mocks[s]||(s.startsWith('.')?load(path.posix.normalize(path.posix.join(path.posix.dirname(rel),s))+'.ts'):require(s));
 const code=ts.transpileModule(text(rel),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Buffer,process:{env:{}},URL,console,setTimeout,clearTimeout},{filename:rel})(req,module,module.exports);
 cache.set(rel,module.exports);return module.exports;
};
const codec=load('src/lib/image-job-codec.ts'),delivery=load('src/lib/imagegen/delivery-checkpoint.ts');
const marker={$imageJobBuffer:url,$imageJobStorage:'local',sha256:sha(bytes),size:bytes.length};
const image={$imageJobDataURL:'data:image/png;base64,',bytes:marker};
function actualParse(){
 const file=ts.createSourceFile('route.ts',text('src/app/api/generate-image/route.ts'),ts.ScriptTarget.Latest,true);
 const names=new Set(['parseParams','parseCount','parseDimension','parseIds']);
 const code=file.statements.filter(s=>ts.isFunctionDeclaration(s)&&names.has(s.name?.text)).map(s=>s.getText(file)).join('\n')+'\nmodule.exports=parseParams';
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,Buffer,File,MAX_IMAGES:8,currentImagegenStep:()=>null,provenanceEntry:()=> 'canvas'});return module.exports;
}
async function attempt(fn){try{return {ok:true,value:await fn()}}catch(e){return {ok:false,error:e.message}}}
async function selectedRead(snapshot){
 // Compile the actual selection/decode statements, stopping before DB/art writes.
 const source=text('src/lib/imagegen/stored-delivery.ts');
 const begin=source.indexOf('  const selected=')>=0?source.indexOf('  const selected='):source.indexOf('  const checkpoint=storedDeliveryCheckpoint(');
 const end=source.indexOf('  const plan=',begin);assert.ok(begin>=0&&end>begin);
 const body='async function run(child){'+source.slice(begin,end)+'return checkpoint;} module.exports=run;';
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(body,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,decodeImageJobValue:codec.decodeImageJobValue,...delivery});return module.exports({id:job,snapshot});
}
(async()=>{
 const parse=actualParse();let checks=0;
 const request=style=>new Request('http://fixture.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:'fixture',style})});
 const parsed=await attempt(()=>parse(request(image)));assert.equal(parsed.ok,baseline);checks++;
 reads=0;const payload=await codec.encodeImageJobValue({style:image},other);const injection=await attempt(()=>codec.decodeImageJobValue(payload));assert.equal(injection.ok,baseline);assert.equal(reads,baseline?1:0);checks++;
 console.log(`PAYLOAD_MARKER=${injection.ok?'READ':'REJECTED'} OBJECT_READS=${reads} JSON_STYLE=${parsed.ok?'ACCEPTED':'REJECTED'}`);
 reads=0;const cross=await attempt(()=>codec.decodeImageJobValue(image,other));assert.equal(cross.ok,baseline);assert.equal(reads,baseline?1:0);checks++;
 reads=0;const missing=await attempt(()=>codec.decodeImageJobValue({...marker,sha256:undefined},job));assert.equal(missing.ok,baseline);assert.equal(reads,baseline?1:0);checks++;
 assert.equal(await codec.decodeImageJobValue(image,job),'data:image/png;base64,'+bytes.toString('base64'));checks++;
 const old={$imageJobBuffer:'/media/image-job-inputs/old/original.bin'};objects.set('image-job-inputs/old/original.bin',bytes);
 assert.ok((await codec.decodeImageJobValue(old)).equals(bytes));checks++;
 const bad={$imageJobDataURL:'data:image/png;base64,',bytes:{$imageJobBuffer:'/media/image-job-inputs/missing.bin'}};
 for(const final of [true,false]){
  reads=0;const snapshot={...(final?{images:[{url:'data:image/png;base64,'+bytes.toString('base64')}]}:{}),paidOperations:{root:{state:'done',result:[{url:image}],children:{unused:{state:'done',result:{url:bad}}}}}};
  const result=await attempt(()=>selectedRead(snapshot));assert.equal(result.ok,!baseline);assert.equal(reads,baseline?2:final?0:1);checks++;
  console.log(`SELECTED_${final?'FINAL':'ROOT'}=${result.ok?'PASS':'UNRELATED_MISSING'} READS=${reads}`);
 }
 reads=0;assert.equal((await attempt(()=>selectedRead({paidOperations:{root:{state:'done',result:[{url:bad}]}}}))).ok,false);checks++;
 const ambiguous={paidOperations:{root:{state:'done',result:[{url:image}]},other:{state:'started'}}};reads=0;assert.equal((await attempt(()=>selectedRead(ambiguous))).ok,false);if(!baseline)assert.equal(reads,0);checks++;
 assert.equal((await parse(request('normal style'))).style,'normal style');checks++;
 console.log(`X5_BOUNDARIES_${baseline?'BASELINE':'MODIFIED'}=PASS CHECKS=${checks} NETWORK=0 DB=0 SUPPLIER_CALLS=0`);
})().catch(e=>{console.error(e);process.exitCode=1});
