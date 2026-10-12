import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const root=path.resolve(process.argv[2]||'.'),baseline=process.argv.includes('--baseline'),code=fs.readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8'),sf=ts.createSourceFile('canvas.tsx',code,99,true,4),functions=new Map();
function walk(n){if(ts.isFunctionDeclaration(n)&&['duplicateArt','downloadOne','downloadZip','addFromHistory'].includes(n.name?.text))functions.set(n.name.text,n.getText(sf));ts.forEachChild(n,walk);}walk(sf);
let calls=0,tips=[],selected=[],undos=[],resolve;
const deferred=new Promise(r=>resolve=r),art={id:'local',image:'/media/fixture.png',canvasX:10,canvasY:20,title:'local'},busy=new Set();
const ctx=vm.createContext({readOnly:false,user:{email:'fixture@example.test'},locale:'zh',zipping:false,duplicateBusyRef:{current:busy},canvasContextEpochRef:{current:0},activeProjectRef:{current:{key:'project'}},active:{key:'project'},rfNodes:[],activeRootId:()=>art.id,artworkNodeSize:()=>({height:320}),pendingNodeRef:{current:null},hasRenderableImage:s=>s.startsWith('/media/'),privateFetchRaw:()=>{calls++;return deferred;},fetch:async()=>({ok:false}),readJsonSafe:async r=>r.json(),mergeWorks:async()=>[{id:'copied'}],pushAddUndo:(...args)=>undos.push(args),setSelectedId:id=>selected.push(id),setZipping:()=>{},createImageDownloadName:()=>"fixture.png",flashTip:message=>tips.push(message),t:key=>key});
vm.runInContext(ts.transpileModule([...functions.values()].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
const first=ctx.duplicateArt(art),second=ctx.duplicateArt(art);
if(baseline){assert.equal(calls,2);resolve({ok:false,json:async()=>({error:'fixture failure'})});await Promise.all([first,second]);await ctx.downloadOne(art.image);await ctx.downloadZip([art],'fixture');assert.equal(tips.length,0);console.log('BASELINE_ACTIONS=CONFIRMED COPY_DUPLICATES=ALLOWED DOWNLOAD_COPY_ERRORS=SILENT');process.exit(0);}
assert.equal(calls,1);resolve({ok:false,json:async()=>({error:'fixture failure'})});await Promise.all([first,second]);assert.equal(busy.size,0);assert.ok(tips.includes('复制节点失败，请重试'));
await ctx.downloadOne(art.image);await ctx.downloadZip([art],'fixture');assert.ok(tips.includes('下载失败，请重试'));assert.ok(tips.includes('打包下载失败，请重试'));
vm.runInContext('privateFetchRaw=async()=>({ok:true,json:async()=>({id:"copied"})});',ctx);await ctx.duplicateArt(art);assert.deepEqual(selected,['copied']);assert.equal(undos.length,1);assert.equal(busy.size,0);
console.log('CANVAS_ACTIONS=PASS COPY_DUPLICATE=BLOCKED COPY_FAILURE=RETRYABLE DOWNLOAD_ERRORS=VISIBLE RESULT_SELECTED=CURRENT_PROJECT');
for(const action of ['duplicateArt','addFromHistory']){
 for(const scenario of ['blank','switch','missing','readonly']){
  const picked=[],undo=[],messages=[],pending={current:null},project={current:null},epoch={current:0};let requests=0,updates=0,adding;
  const context=vm.createContext({readOnly:scenario==='readonly',user:{email:'fixture@example.test'},locale:'zh',duplicateBusyRef:{current:new Set()},historyAddingRef:{current:false},historyPicker:{x:310,y:410},setHistoryAddingId:id=>adding=id,setHistoryPickerError:m=>messages.push(m),setHistoryPicker:()=>{},active:null,activeProjectRef:project,canvasContextEpochRef:epoch,rfNodes:[],activeRootId:()=>null,artworkNodeSize:()=>({height:320}),pendingNodeRef:pending,setWorks:()=>updates++,setSelectedId:id=>picked.push(id),pushAddUndo:id=>undo.push(id),flashTip:m=>messages.push(m),t:key=>key,readJsonSafe:r=>r.json(),privateFetchRaw:async()=>{requests++;if(scenario==='switch'){project.current={key:'other'};epoch.current++;}return {ok:true,json:async()=>({id:'copied'})};},mergeWorks:async()=>scenario==='missing'?[]:[{id:'copied'}]});
  vm.runInContext(ts.transpileModule(functions.get(action),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);await context[action](art);
  if(scenario==='blank'){assert.equal(pending.current,'copied');assert.equal(updates,1);assert.deepEqual(undo,['copied']);}
  if(scenario==='switch'){assert.equal(pending.current,null);assert.equal(updates,0);assert.deepEqual(picked,[]);assert.deepEqual(undo,[]);}
  if(scenario==='missing'){assert.equal(requests,1);assert.equal(pending.current,null);assert.ok(messages.some(m=>m?.includes('刷新画布')));assert.ok(messages.every(m=>!m?.includes('请重试')));}
  if(scenario==='readonly')assert.equal(requests,0);
  assert.equal(context.historyAddingRef.current,false);assert.equal(context.duplicateBusyRef.current.size,0);
 }
}
console.log('CANVAS_CONTEXT=PASS BLANK_PROJECT=OPENED PROJECT_SWITCH=NO_FOCUS_STEAL REFRESH_FAILURE=NO_RECREATE READ_ONLY=UNCHANGED');
