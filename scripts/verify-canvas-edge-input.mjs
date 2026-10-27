// Execute the actual extracted handlers, not a reimplementation or regex-only test.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';

const root=path.resolve(process.argv[2]||'.'), baseline=process.argv.includes('--baseline');
const code=readFileSync(path.join(root,'src/components/canvas/canvas-client.tsx'),'utf8');
const ast=ts.createSourceFile('canvas-client.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function handler(name){let found;function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n;ts.forEachChild(n,visit);}visit(ast);assert.ok(found,name);return ts.transpileModule(found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}
class Element {tagName='g';closest(){return null;}}
class HTMLElement extends Element {}
const calls=[], orb={};
const context={Element,HTMLElement,document:{activeElement:new Element(),querySelector:selector=>selector.includes(':not(button)')?orb:null},window:{getSelection:()=>null},
  CANVAS_MODAL_SELECTOR:'.fixed.inset-0, [data-canvas-hotkeys-blocked="true"][aria-modal="true"]',
  historyBusyRef:{current:false},cuttingEdgesRef:{current:new Set()},canvasShortcutLayerOpen:false,isEditableClipboardTarget:()=>false,
  selectedId:'stale-node',selectedTextId:null,selectedGenerating:false,selectedEdge:{id:'edge',source:'image',target:'target'},multiSel:[],readOnly:false,browsing:false,canvasTool:'move',
  cutEdge:e=>calls.push(['edge',e.id]),runDelete:ids=>calls.push(['node',ids]),removeTextNode:id=>calls.push(['text',id]),setSelectedEdge:()=>{},};
if(code.includes('from "./use-canvas-keyboard"')){
 const result=await build({stdin:{contents:"export{canvasKeyboardCommand}from'./src/lib/canvas/keyboard-command';export{compileCanvasLink}from'./src/lib/canvas/link-command';",resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',tsconfig:path.join(root,'tsconfig.json')});
 const module={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,Buffer,console,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,crypto:globalThis.crypto});
 const {canvasKeyboardCommand,compileCanvasLink}=module.exports;
 const input={readOnly:false,browsing:false,blocked:false,busy:false,tool:'move',selectedId:'stale-node',selectedTextId:null,selectedEdge:true,selectedGenerating:false,multiSel:[],mediaCopyIntent:false,key:'Delete',code:'Delete',mod:false,alt:false,shift:false,repeat:false,composing:false,defaultPrevented:false,tag:'g',editable:false};
 const decision=overrides=>canvasKeyboardCommand({...input,...overrides});
 for(const key of ['Delete','Backspace'])assert.equal(decision({key}).action.kind,'cut-edge');
 for(const overrides of [{composing:true},{repeat:true},{readOnly:true},{busy:true},{editable:true},{blocked:true}])assert.equal(decision(overrides).action,undefined);
 assert.equal(decision({selectedGenerating:true}).action.kind,'cut-edge');assert.equal(decision({key:'Backspace',selectedEdge:false,selectedId:null}).prevent,true);
 const scope={viewCurrent:()=>true},edge={id:'edge',source:'image',target:'text-target'},node={id:'text-target',projectKey:'tree:fixture',title:'keep',content:'keep',prompt:'',width:300,height:240,sourceIds:['image','other'],productIds:['image'],targetIds:[]};
 const snapshots=[],originals=[node];let text=originals,pending=[],edges=[edge],succeed=true;
 Object.assign(context,{user:{email:'fixture@example.test'},rfEdges:edges,canvasHistory:{scope},edgeHoverHintRef:{current:{clear(){}}},
   setRfEdges:fn=>{edges=fn(edges);context.rfEdges=edges;},setSelectedEdge:()=>{},
   submitCanvasLink:async intent=>{
    if(!succeed)return false;
    const action=compileCanvasLink({project:'tree:fixture',artworks:[],texts:text,videos:[],pending,selected:[],choices:[],locked:()=>false,productTitle:'product',referenceLimit:'limit',cycleMessage:'cycle',productMention:v=>v},intent);
    if(!action)return false;snapshots.push(action);
    if(action.kind==='text-patch')text=text.map(n=>n.id===action.id?{...n,...action.to}:n);
    if(action.kind==='pending-link')pending=pending.map(n=>n.id===action.id?{...n,...action.to}:n);
    return true;
   }});
 vm.createContext(context);vm.runInContext(handler('cutEdge'),context);await context.cutEdge(edge);
 assert.deepEqual(Array.from(text[0].sourceIds),['other']);assert.equal(text[0].productIds.length,0);assert.equal(edges.length,0);assert.equal(snapshots.length,1);
 edges=[edge];context.rfEdges=edges;text=originals;succeed=false;await context.cutEdge(edge);assert.equal(edges.length,1);assert.equal(snapshots.length,1);assert.equal(context.cuttingEdgesRef.current.size,0);
 pending=[{id:'pend-target',inputs:['image','other'],parentId:'image',linked:true}];const pendingEdge={...edge,target:'pend-target'};edges=[pendingEdge];context.rfEdges=edges;succeed=true;await context.cutEdge(pendingEdge);assert.deepEqual(Array.from(pending[0].inputs),['other']);assert.equal(pending[0].parentId,'other');assert.equal(snapshots.at(-1).kind,'pending-link');
 pending[0].generating=true;edges=[pendingEdge];context.rfEdges=edges;const count=snapshots.length;await context.cutEdge(pendingEdge);assert.equal(edges.length,1);assert.equal(snapshots.length,count);
 console.log('EDGE_HANDLER_MODIFIED=PASS DELETE_BACKSPACE=EDGE_ONLY IME_EDITOR_REPEAT_READONLY=PASS PRODUCT_FIELDS=REMOVED FAILURE=RETRYABLE PENDING=LOCAL ACTIVE_JOB=PROTECTED KEYBOARD_MODEL=ACTUAL LINK_COMPILER=ACTUAL HISTORY_PORT=CONTROLLED');process.exit(0);
}
vm.createContext(context);vm.runInContext(handler('onKey'),context);
function key(key,overrides={}) {let prevented=false;const e={key,target:new Element(),defaultPrevented:false,isComposing:false,metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,repeat:false,preventDefault:()=>{prevented=true;},...overrides};context.onKey(e);return prevented;}
key('Delete');
if(baseline){assert.equal(calls.length,0);console.log('EDGE_HANDLER_BASELINE=BUG ORB_BLOCKS_DELETE=TRUE NODE_DELETES=0 EDGE_CUTS=0');process.exit(0);}
assert.deepEqual(calls,[['edge','edge']]);calls.length=0;key('Backspace');assert.deepEqual(calls,[['edge','edge']]);calls.length=0;
key('Delete',{isComposing:true});key('Delete',{repeat:true});context.readOnly=true;key('Delete');context.readOnly=false;assert.equal(calls.length,0);
context.historyBusyRef.current=true;key('Delete');assert.equal(calls.length,0);assert.equal(key('a'),false);context.historyBusyRef.current=false;
context.isEditableClipboardTarget=()=>true;key('Backspace');assert.equal(calls.length,0);context.isEditableClipboardTarget=()=>false;
context.selectedGenerating=true;key('Delete');assert.deepEqual(calls,[['edge','edge']]);
context.selectedEdge=null;context.selectedGenerating=false;context.selectedId=null;calls.length=0;assert.equal(key('Backspace'),true);assert.equal(calls.length,0);
context.canvasShortcutLayerOpen=true;assert.equal(key('Backspace'),true);context.canvasShortcutLayerOpen=false;

const edge={id:'edge',source:'image',target:'text-target'}, sent=[],undos=[];
const node={id:'text-target',updatedAt:'fixture',title:'keep',content:'keep',width:300,height:240,sourceIds:['image','other'],productIds:['image'],targetIds:[]};
Object.assign(context,{readOnly:false,user:{email:'fixture@example.test'},historyBusyRef:{current:false},pendNodesRef:{current:[]},rfEdges:[edge],textSaveQueuesRef:{current:new Map()},textNodesRef:{current:[node]},unsavedTextRef:{current:new Map()},
  textPatchOf:n=>({...n}),browserRandomUUID:()=> 'fixture-operation',AbortSignal,
  setEdgeCut:()=>{},setRfEdges:f=>{context.rfEdges=f(context.rfEdges);},setTextNodes:f=>{context.textNodesRef.current=f(context.textNodesRef.current);},setUnsavedTextCount:()=>{},
  setSelectedEdge:()=>{},pushUndo:a=>undos.push(a),t:k=>k,L:zh=>zh,flashTip:m=>calls.push(['tip',m]),
  privateFetchRaw:async(url,init)=>{sent.push({url,body:JSON.parse(init.body)});return {ok:true};},expectJsonOk:async res=>{if(!res.ok)throw new Error('fixture failure');},});
vm.runInContext(handler('cutEdge'),context);await context.cutEdge(edge);
assert.equal(sent[0].url,'/api/canvas/history');assert.deepEqual(Array.from(sent[0].body.operations[0].fields.sourceIds),['other']);assert.equal(sent[0].body.operations[0].fields.productIds.length,0);assert.equal(context.rfEdges.length,0);assert.equal(undos.length,1);
context.rfEdges=[edge];context.textNodesRef.current=[node];context.privateFetchRaw=async()=>({ok:false});await context.cutEdge(edge);assert.equal(context.rfEdges.length,1);assert.equal(undos.length,1);assert.equal(context.cuttingEdgesRef.current.size,0);
context.pendNodesRef.current=[{id:'pend-target',inputs:['image','other'],parentId:'image',linked:true}];context.setPendNodes=f=>{context.pendNodesRef.current=f(context.pendNodesRef.current);};
const pendingEdge={...edge,target:'pend-target'};context.rfEdges=[pendingEdge];await context.cutEdge(pendingEdge);assert.deepEqual(Array.from(context.pendNodesRef.current[0].inputs),['other']);assert.equal(context.pendNodesRef.current[0].parentId,'other');assert.equal(undos.at(-1).kind,'pending-link');
context.pendNodesRef.current[0].generating=true;context.rfEdges=[pendingEdge];const count=undos.length;await context.cutEdge(pendingEdge);assert.equal(context.rfEdges.length,1);assert.equal(undos.length,count);
console.log('EDGE_HANDLER_MODIFIED=PASS DELETE_BACKSPACE=EDGE_ONLY IME_EDITOR_REPEAT_READONLY=PASS PRODUCT_FIELDS=REMOVED FAILURE=RETRYABLE PENDING=LOCAL ACTIVE_JOB=PROTECTED');
