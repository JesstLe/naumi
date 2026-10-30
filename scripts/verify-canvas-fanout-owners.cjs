// R7R: actual Canvas edge, image run/task/presentation/import owners.
// Only browser transport/document ports are fixtures. No supplier or product DB.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),esbuild=require('esbuild');
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=path.resolve(arg('--source-root','.')),out=path.resolve(arg('--output-root',process.env.CANVAS_FANOUT_OWNERS_EVIDENCE||'output/canvas-fanout-owners')),baseline=args.includes('--baseline');
fs.mkdirSync(out,{recursive:true});process.env.CANVAS_IMAGE_SOURCE_ROOT=root;
// R7Q is already a shared-controller baseline, not the pre-controller R3 baseline.
const savedArgv=process.argv;process.argv=process.argv.filter(arg=>arg!=='--baseline');
const fixture=require('./verify-canvas-image-task-refactor.cjs');process.argv=savedArgv;
const checks=[],plain=v=>JSON.parse(JSON.stringify(v));
const eq=(a,b,message)=>assert.deepEqual(plain(a),plain(b),message),gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function test(name,run){await run();checks.push(name);console.log('PASS '+name);}
const artifact=n=>({id:'output-'+n,url:'/fixture/'+n+'.png',width:768,height:1024});
async function generation(built,scenario){
 const f=fixture.setup('derived','done',built),{c,state}=f;let submitted=0,paid=0,reads=0,readInputs=0,savedOnce=false,failPosition=scenario==='position-failure',failMerge=scenario==='merge-failure';
 const images=[artifact('C'),artifact('A'),artifact('B')],snapshots=[];
 c.generationPresentation.subscribe(()=>snapshots.push(plain(c.generationPresentation.getSnapshot().tasks.map(t=>({...t,onRetry:undefined})))));
 c.__ports.read=async()=>{readInputs++;return new Blob(['original reference'],{type:'image/png'});};
 const scope={owner:c.user.email,workspace:'personal',project:'tree:source'},operationId='12345678-1234-4234-a234-123456789012',jobId='imagegen-'+operationId;
 const actionKey='node:node:source',key=c.pendingAttemptKey(scope.owner,scope.workspace,scope.project,actionKey);
 if(scenario==='retained-draft'){
  savedOnce=true;paid=1;
  c.savePendingAttempt(key,{version:1,...scope,actionKey,operationId,quoteId:'frozen-quote',request:{operationId,sourceNodeId:'source',variants:3,parameters:{ratio:'3:4'},inputs:[]},authorizedCredits:18,confirmationRequired:false,accepted:'unknown',context:{workspace:scope.workspace,projectContext:scope.project},placement:c.canvasFanoutSlots('source',3,{x:900,y:200},{width:315,height:420},[])});
 }
 c.privateFetch=async(_url,init)=>{
  submitted++;const form=init.body;state.forms.push([...form].map(([k,v])=>[k,typeof v==='string'?v:{name:v.name}]));
  if(!savedOnce){
   savedOnce=true;paid++;
   c.savePendingAttempt(key,{version:1,...scope,actionKey,operationId,quoteId:'frozen-quote',request:{operationId,sourceNodeId:'source',variants:3,parameters:{ratio:'3:4'},inputs:[]},authorizedCredits:18,confirmationRequired:false,accepted:'accepted',jobId,context:{workspace:scope.workspace,projectContext:scope.project},placement:JSON.parse(form.get('imagegenPlacement'))});
   if(scenario==='unknown')throw Error('lost POST acknowledgement');
  }
  return Response.json({jobId});
 };
 c.fetch=async(url,init)=>{
  if(String(url).includes('/position')){
   state.positions.push(JSON.parse(init.body));
   if(failPosition){failPosition=false;return Response.json({error:'position unavailable'},{status:503});}
   return Response.json({ok:true});
  }
  reads++;
  if(scenario==='stale')c.canvasContextEpochRef.current++;
  if(scenario==='poll-failure'&&reads===1)throw Error('query unavailable');
  const partial=scenario==='partial'&&reads===1;
  return Response.json({status:partial?'error':'done',operationStatus:partial?'partial':'succeeded',images:partial?images.slice(0,2):reads>1?[images[2],images[1],images[0]]:images,error:partial?'one output incomplete':undefined});
 };
 c.mergeWorks=async()=>{if(failMerge){failMerge=false;return [f.src];}return [f.src,...images.map(i=>({...i,image:i.url}))];};
 const original=JSON.stringify(f.src),opts={count:3,fanout:true,replaceNode:false,ratio:'auto',referenceInputs:[]};
 if(scenario==='retained-draft')Object.assign(opts,{count:1,fanout:false,replaceNode:true,extra:[new File(['must not upload'],'other.png',{type:'image/png'})]});
 await c.entry.runGen(f.src,'keep subject',opts);
 const visible=snapshots.find(s=>s.length===3);assert.ok(visible,'three visible destinations before submission');assert.ok(visible.every(t=>t.count===1&&!t.replaceNode));eq(new Set(visible.map(t=>t.position.x)).size,3);eq(new Set(visible.map(t=>t.position.y)).size,1);
 eq(JSON.stringify(f.src),original,'source pixels/version/position unchanged');eq(paid,1,'one frozen paid request');
 if(scenario==='stale'){eq(state.history.length,0);eq(state.positions.length,0);assert.ok(state.storage.has(key));return;}
 if(scenario==='unknown'||scenario==='poll-failure'){
  eq(c.generationTasks.length,3);eq(state.history.length,0);assert.ok(c.generationTasks.every(t=>t.failure));assert.ok(state.storage.has(key));
  await Promise.all([c.generationTasks[0].onRetry(),c.generationTasks[0].onRetry()]);eq(paid,1);eq(state.history.length,1);
 }else if(scenario==='position-failure'||scenario==='merge-failure'){
  eq(state.history.length,0);assert.ok(c.generationTasks.every(t=>t.failure));const submittedBefore=submitted,readsBefore=reads;
  await c.generationTasks[0].onRetry();eq(submitted,submittedBefore,'known output resumes attachment only');eq(reads,readsBefore);eq(state.history.length,1);
 }else if(scenario==='partial'){
  eq(state.history,[['output-C','output-A']]);eq(c.generationTasks.length,1);assert.ok(c.generationTasks[0].failure);assert.ok(state.storage.has(key));
  const id=c.generationTasks[0].id;c.generationPresentation.drag(id,{x:2222,y:333},true);
  c.updateCanvasImagegenPlacement(scope,actionKey,p=>({...p,slots:p.slots.map((s,i)=>i===2?{...s,x:2222,y:333}:s)}));
  const before=submitted;await c.generationTasks[0].onRetry();eq(submitted,before);eq(paid,1);
  eq(state.history,[['output-C','output-A'],['output-B']],'partial/reordered receipt appends only new undo');const last=state.positions.find(p=>p.id==='output-B');eq([last.x,last.y],[2222,333]);
 }else eq(state.history.length,1);
 if(scenario==='retained-draft'){eq(readInputs,0);assert.equal(state.forms[0].find(([k])=>k==='count')[1],'3');assert.ok(!state.forms[0].some(([k])=>k==='canvasTargetNode'||k==='image'));}
 eq(c.generationTasks.length,0);eq(state.storage.size,0);eq(c.generationOperationRef.current.size,0);assert.ok(state.positions.every(p=>p.mode==='initialize'&&p.id!=='source'));
}
async function importBundle(){
 return (await esbuild.build({stdin:{contents:'export {createCanvasImageImports} from "./src/lib/canvas/image-imports";export {createCanvasPendingPresentation} from "./src/lib/canvas/pending-presentation";export {canvasDeletableIds} from "./src/lib/canvas/node-commands";',resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',nodePaths:[path.join(__dirname,'../node_modules')],plugins:[{name:'upload-ports',setup(b){b.onResolve({filter:/client-image-upload$/},()=>({path:'upload',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const prepareImageUploads=(...args)=>__upload.prepare(...args);export const uploadFormData=(...args)=>__upload.send(...args);',loader:'js'}));}}]})).outputFiles[0].text;
}
async function pendingUploads(built,scenario){
 let current=true,allowSync=scenario!=='sync-failure',prepares=0,active=0,peak=0,history=[],revealed=[],posts=[],errors=[],ordinal=0;const hold=gate();
 const upload={prepare:async files=>{prepares++;if(scenario==='decode')await hold.promise;return files.map(file=>({file,width:768,height:1024,originalBytes:file.size,uploadBytes:file.size,optimized:false}));},send:async(_url,form,progress,_timeout,guard)=>{
  guard();const number=++ordinal;active++;peak=Math.max(peak,active);const file=form.get('image');posts.push({number,title:form.get('title'),parent:form.get('parentId'),x:form.get('x'),y:form.get('y'),bytes:Buffer.from(await file.arrayBuffer()).toString('hex')});progress(1,2);
  if(scenario==='queued'&&number<=2)await hold.promise;await new Promise(r=>setImmediate(r));active--;if(scenario==='first-fails'&&number===1)throw Error('first rejected');if(scenario==='switch')current=false;return {id:'saved-'+number};
 }};
 const module={exports:{}},box={module,exports:module.exports,require,console,Buffer,File,Blob,FormData,Date,Math,Map,Set,Promise,structuredClone,__upload:upload};vm.createContext(box);vm.runInContext(built,box);const api=module.exports,owner=api.createCanvasImageImports(),pending=api.createCanvasPendingPresentation().bind('original-view');
 pending.set([{id:'pend-original',inputs:[],parentId:null,x:80,y:90,label:'image',uploading:false,progress:0,linked:false}]);
 const context={owner:'fixture@example.test',account:'A',workspace:'personal',project:'tree:root',documentCurrent:()=>true,viewCurrent:()=>current,rects:()=>[],merge:async ids=>{if(!allowSync)throw Error('read failed');return ids.map(id=>({id,image:'/original/'+id+'.png'}));},history:ids=>history.push([...ids]),reveal:id=>revealed.push(id),t:k=>k,locale:'zh'};
 const files=['one.png','two.png','three.png'].map(name=>new File([Buffer.from([1,2,3])],name,{type:'image/png'}));let seq=0;const ports={pending,newId:()=>`pend-${++seq}`,history:()=>{},attached:()=>{},error:message=>errors.push(message)};
 const running=owner.uploadPendingFiles(files,'pend-original',scenario==='queued'?'existing-root':null,context,ports);assert.ok(pending.get('pend-original').uploading,'decode is owned work');
 if(scenario==='decode'){await owner.uploadPendingFiles(files,'pend-original',null,context,ports);eq(prepares,1);hold.resolve();}
 if(scenario==='queued'){
  for(let i=0;posts.length<2&&i<100;i++)await new Promise(r=>setImmediate(r));eq(posts.length,2);assert.ok(pending.getSnapshot().every(n=>n.uploading));
  const third=pending.getSnapshot()[2];await owner.uploadPendingFiles([files[2]],third.id,null,context,ports);eq(prepares,1);eq(api.canvasDeletableIds([third.id],{textNodes:[],pendingNodes:pending.getSnapshot(),generationTasks:[]}),[]);hold.resolve();
 }
 await running;eq(posts.length,scenario==='switch'?1:3);eq(prepares,1,'one batch decode, no repeated per-file decoding');eq(posts[0].bytes,'010203');eq(posts[0].title,'one.png');eq([posts[0].x,posts[0].y],['80','90']);
 if(scenario==='switch'){eq(revealed,[]);return;}
 eq(posts.map(p=>p.parent),scenario==='queued'?['existing-root','existing-root','existing-root']:scenario==='first-fails'?[null,null,'saved-2']:[null,'saved-1','saved-1']);eq(new Set(posts.map(p=>p.x)).size,3);assert.ok(peak<=2);
 if(scenario==='sync-failure'){
  eq(pending.getSnapshot().length,3);eq(history.length,0);allowSync=true;for(const batch of owner.getSnapshot())await owner.synchronize(batch.id,context);eq(posts.length,3);eq(pending.getSnapshot().length,0);eq(history.length,3);
  for(const batch of owner.getSnapshot())await owner.synchronize(batch.id,context);eq(history.length,3,'repeated read does not duplicate history');
 }else eq(pending.getSnapshot().length,scenario==='first-fails'?1:0);
}
async function main(){
 const built=await fixture.bundle();
 if(baseline){
  const module={exports:{}},box={module,exports:module.exports,require,console,Map,Set,Buffer,Date,Math,TextEncoder,crypto:crypto.webcrypto};vm.createContext(box);vm.runInContext(built,box);let options;
  await module.exports.executeCanvasImageCreation({source:{id:'source',image:'/source'},prompt:'keep',mode:'standard',parameters:{count:3,ratio:'3:4',style:'',resolution:'1K'},references:[],files:[],referenceInputs:[]},{isCurrent:()=>true,generate:async(_s,_p,o)=>{options=o;return[];}});
  assert.equal(options.replaceNode,true);assert.equal(options.fanout,undefined);assert.equal(options.count,3);checks.push('BASELINE_MULTI_REQUEST_REPLACES_SOURCE');assert.match(fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),/const file=files\?\.length\?files\[0\]:null/);checks.push('BASELINE_PENDING_UPLOAD_FIRST_FILE_ONLY');
 }else{
  for(const name of ['full','partial','unknown','poll-failure','position-failure','merge-failure','retained-draft','stale'])await test('actual Canvas fanout '+name,()=>generation(built,name));
  const imports=await importBundle();for(const name of ['full','decode','queued','first-fails','sync-failure','switch'])await test('actual pending importer '+name,()=>pendingUploads(imports,name));
  const edge=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');assert.equal((edge.match(/function doUploadPend\(/g)||[]).length,1);assert.match(edge,/uploadPendingFiles\(/);assert.doesNotMatch(edge,/generationOperationRef|pendUploadReceiptsRef|uploadPendingFile\(/);assert.match(edge,/ref=\{pendUploadRef\}[\s\S]{0,130}\bmultiple\b/);checks.push('ONE_THIN_CANVAS_ENTRY_EXISTING_MODULE_OWNERS');
 }
 const exit=baseline?1:0,stdout=`CANVAS_FANOUT_UPLOAD=${baseline?'REPRODUCED':'PASS'} CHECKS=${checks.length} FAILED=0 ACTUAL_OWNERS=1 SUPPLIER_CALLS=0 EXIT=${exit}`;
 fs.writeFileSync(path.join(out,baseline?'BASELINE.json':'MODIFIED.json'),JSON.stringify({status:baseline?'REPRODUCED':'PASS',source:root,checks,exit,evidence:'Actual component functions and application owners; browser/document I/O fixture',stdout},null,2));console.log(stdout);process.exitCode=exit;
}
main().catch(error=>{fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({status:'FAIL',checks,error:error.stack,exit:1},null,2));console.error(error);process.exitCode=1;});
