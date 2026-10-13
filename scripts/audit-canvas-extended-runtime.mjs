import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const out=path.resolve('output/canvas-win-mac-audit-20261013/runtime');await mkdir(out,{recursive:true});
const source=await readFile('src/components/canvas/canvas-client.tsx','utf8');
function extract(name){const ast=ts.createSourceFile('canvas.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let found;
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(found,name);
 return ts.transpileModule(found,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;}
const findings=[],controls=[];
let requests=[],tips=[],busy=[];
const localEdit={user:{email:'fixture@audit.test'},readOnly:false,nodeSettingsReady:true,isNodeLocked:()=>false,localEditBusyRef:{current:false},localEditAttempt:{current:null},
 MAX_UPLOAD:12*1024*1024,setLocalEditBusy:x=>busy.push(x),flashTip:x=>tips.push(x),L:zh=>zh,t:x=>x,browserRandomUUID:()=> 'fixture-operation-id',
 FormData,AbortSignal,JSON,Error,privateFetchRaw:async(url,init)=>{requests.push({url,body:init.body});return {ok:false,status:500};},expectJsonOk:async()=>{throw new Error('HTTP500');},replaceInputRef:{current:null}};
const edit=vm.createContext(localEdit);vm.runInContext(extract('saveLocalImageEdit'),edit);
const png=await readFile('public/demos/suite-demo/suppl-src.png');
edit.art={id:'sample',source:'upload'};edit.file=new File([png],'商品.PNG',{type:''});
await vm.runInContext('saveLocalImageEdit(art,undefined,file)',edit);
assert.equal(requests.length,0);assert.match(tips[0],/PNG/);
findings.push({id:'replace-missing-mime-rejected',source:'saveLocalImageEdit',input:{name:edit.file.name,type:edit.file.type,size:edit.file.size},observed:{requests:0,notice:tips[0]}});
requests=[];tips=[];busy=[];edit.file=new File([png],'商品.PNG',{type:'image/png'});
await vm.runInContext('saveLocalImageEdit(art,undefined,file)',edit);
assert.equal(requests.length,1);assert.equal(tips.at(-1),'HTTP500');assert.equal(localEdit.localEditBusyRef.current,false);
controls.push({id:'replace-valid-mime-error-visible',result:'PASS',requestCount:1,notice:tips[0],busyReleased:true});
requests=[];tips=[];busy=[];let refreshed=0,pushes=0,closed=0;
edit.privateFetchRaw=async(url,init)=>{requests.push({url,body:init.body});return {ok:true,status:200};};edit.expectJsonOk=async()=>({id:'new-version'});
edit.mergeWorks=async()=>{refreshed++;return [{id:'new-version'}];};edit.pushAddUndo=()=>pushes++;edit.pendingNodeRef={current:null};edit.setSelectedId=()=>{};edit.setSelectedTextId=()=>{};edit.setCropArtwork=()=>closed++;
await vm.runInContext('saveLocalImageEdit(art,{x:0,y:0,width:1,height:1})',edit);
assert.equal(refreshed,1);assert.equal(pushes,1);assert.equal(closed,1);
controls.push({id:'local-crop-success-version-keeps-original',result:'PASS',refreshes:refreshed,addUndo:pushes,cropClosed:closed});
let nodeStates=[],undo=[],pending=[],notices=[],queueResults=[];
const failure={user:{email:'fixture@audit.test'},readOnly:false,unsavedTextRef:{current:new Map()},textSaveQueuesRef:{current:new Map()},
 setUnsavedTextCount:x=>pending.push(x),setTextNodes:f=>nodeStates.push(f),privateFetchRaw:async(url,init)=>{queueResults.push(JSON.parse(init.body));return {ok:false,status:500};},
 expectJsonOk:async()=>{throw new Error('HTTP500');},flashTip:x=>notices.push(x),t:x=>x,AbortSignal,Map,JSON,Promise,Error};
const text=vm.createContext(failure);vm.runInContext(extract('persistTextNode'),text);text.node={id:'text-fixture',content:'未保存',updatedAt:'v1'};
assert.equal(await vm.runInContext('persistTextNode(node)',text),null);assert.equal(failure.unsavedTextRef.current.size,1);assert.equal(notices.length,1);
controls.push({id:'text-http-failure-retains-unsaved',result:'PASS',unsavedCount:1,notice:notices[0]});
text.privateFetchRaw=async()=>({ok:true,status:200});text.expectJsonOk=async()=>({node:{id:'text-fixture',content:'未保存',updatedAt:'v1'}});
await vm.runInContext('persistTextNode(node)',text);assert.equal(failure.unsavedTextRef.current.size,0);
controls.push({id:'text-retry-clears-unsaved',result:'PASS',unsavedCount:0});
const settings={locked:false,order:0,text:{fontSize:12,fontWeight:'400',color:null,align:'left',lineHeight:1.65}};
let settingsState={},settingsUndo=[],settingsNotices=[];
const props=vm.createContext({user:{email:'fixture@audit.test'},readOnly:false,nodeSettingsReady:true,historyBusyRef:{current:false},settingsFor:()=>settings,
 textSaveQueuesRef:{current:new Map()},setHistorySaving:()=>{},privateFetchRaw:async()=>({ok:false,status:500}),expectJsonOk:async()=>{throw new Error('HTTP500');},
 L:zh=>zh,t:x=>x,browserRandomUUID:()=> 'fixture-id',nodeSettingsRef:{current:{}},setNodeSettings:s=>settingsState=s,pushUndo:u=>settingsUndo.push(u),flashTip:x=>settingsNotices.push(x),AbortSignal,Promise,Array,JSON,Error});
vm.runInContext(extract('commitNodeSettings'),props);props.next={...settings,locked:true};
assert.equal(await vm.runInContext("commitNodeSettings('sample',next)",props),false);assert.equal(settingsUndo.length,0);assert.equal(Object.keys(settingsState).length,0);assert.equal(settingsNotices.length,1);
controls.push({id:'properties-http-failure-no-local-commit',result:'PASS',undo:0,settingsChanged:false,notice:settingsNotices[0]});
props.privateFetchRaw=async()=>({ok:true,status:200});props.expectJsonOk=async()=>({persisted:true});
assert.equal(await vm.runInContext("commitNodeSettings('sample',next)",props),true);assert.equal(settingsUndo.length,1);assert.equal(settingsState.sample.locked,true);
controls.push({id:'properties-success-single-history',result:'PASS',undo:1,locked:true});
class ElementFixture{constructor(editable=false){this.editable=editable;}closest(){return null;}}
let uploads=0,workflow=0,prevented=0;
const paste=vm.createContext({Element:ElementFixture,ready:true,user:{email:'fixture@audit.test'},readOnly:false,browsing:false,loading:false,canvasShortcutLayerOpen:false,
 document:{querySelector:()=>null},CANVAS_MODAL_SELECTOR:'fixture',isEditableClipboardTarget:e=>e?.editable===true,
 canvasAreaRef:{current:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})}},rfRef:{current:{screenToFlowPosition:()=>({x:400,y:300})}},
 workflowPaste:{paste:()=>{workflow++;return true;}},clipboardImageFiles:()=>[new File(['sentinel'],'截图.png',{type:'image/png'})],
 uploadCtxRef:{current:null},activeRootId:()=> 'root',NODE_W:260,NODE_H:280,DataTransfer:class{constructor(){this.files=[];this.items={add:f=>this.files.push(f)};}},uploadRoot:()=>uploads++,nodeClipRef:{current:null}});
vm.runInContext(extract('handleCanvasPaste'),paste);paste.e={target:new ElementFixture(),clipboardData:{getData:type=>type==='text/html'?'<div data-app="editor-next">fixture workflow</div>':''},preventDefault:()=>prevented++};
vm.runInContext('handleCanvasPaste(e)',paste);assert.equal(workflow,1);assert.equal(uploads,0);assert.equal(prevented,1);
findings.push({id:'paste-workflow-preempts-image-files',source:'handleCanvasPaste',input:'Noneditable target, recognized workflow HTML and image file coexist',observed:{workflow:1,imageUploads:0,preventDefault:1},classification:'Product-contract conflict: comment says image files always take priority; intentional workflow-thumbnail precedence needs confirmation.'});
uploads=0;workflow=0;paste.workflowPaste={paste:()=>false};vm.runInContext('handleCanvasPaste(e)',paste);assert.equal(uploads,1);
controls.push({id:'clipboard-image-only-import',result:'PASS',imageUploads:1});
await writeFile(path.join(out,'results.json'),JSON.stringify({baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSha256:createHash('sha256').update(source).digest('hex'),
 source:'Actual AST-extracted function bodies, unchanged; dependencies and API responses controlled',providerCalls:0,findings,controls},null,2)+'\n');
console.log(`CANVAS_EXTENDED_RUNTIME=PASS FINDINGS=${findings.length} POSITIVE_CONTROLS=${controls.length} PRODUCT=UNCHANGED PROVIDER_CALLS=0`);
