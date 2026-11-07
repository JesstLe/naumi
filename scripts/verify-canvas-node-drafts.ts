import assert from 'node:assert/strict';
import { ImageNodeDraftStore, imageDraftKey, imageDraftScope } from '../src/lib/canvas/image-node-drafts';
import { canvasMediaVariant } from '../src/lib/canvas/media-loading';
import { reconcileCanvasNodes } from '../src/lib/canvas/scene-reconciliation';
import { readFileSync } from 'node:fs';
const memory = new Map<string,string>();
const storage = {getItem:(key:string)=>memory.get(key)||null,setItem:(key:string,value:string)=>{memory.set(key,value)}};
const store = new ImageNodeDraftStore(()=>storage);
let checks=0;
const check=(actual:unknown,expected:unknown)=>{assert.deepEqual(actual,expected);checks++};
const scope=imageDraftScope('A@EXAMPLE.test',null,'project-A');
const a=imageDraftKey(scope,'pend-A'), b=imageDraftKey(scope,'pend-B');
check(store.read(a),{}); store.write(a,{ratio:'3:4',prompt:'A unsent'});check(store.read(b),{});
store.write(b,{ratio:'9:16',prompt:'B unsent'});check(store.read(a),{ratio:'3:4',prompt:'A unsent'});
check(store.read(b),{ratio:'9:16',prompt:'B unsent'});
store.write(a,{prompt:''});check(store.read(a),{ratio:'3:4',prompt:''});
const remount=new ImageNodeDraftStore(()=>storage);check(remount.read(a),{ratio:'3:4',prompt:''});
for(const other of [imageDraftScope('B@example.test',null,'project-A'),imageDraftScope('A@example.test','B@example.test','project-A'),imageDraftScope('A@example.test',null,'project-B'),imageDraftScope('A@example.test',null,null)])check(store.read(imageDraftKey(other,'pend-A')),{});
check(imageDraftScope('A@EXAMPLE.test','a@example.TEST','project-A'),scope);
check(imageDraftKey(null,'pend-A'),null);check(imageDraftKey(scope,null),null);store.write(null,{prompt:'no target'});check(store.read(null),{});
const delayed=imageDraftKey(scope,'delayed');store.write(delayed,{ratio:'3:4'});check({...{prompt:'late saved prompt',ratio:'1:1'},...store.read(delayed)},{prompt:'late saved prompt',ratio:'3:4'});
const corrupt=imageDraftKey(scope,'corrupt')!;memory.set(corrupt,'{invalid');check(remount.read(corrupt),{});
const invalid=imageDraftKey(scope,'invalid')!;memory.set(invalid,JSON.stringify({prompt:123,ratio:'0:9',secret:'ignored'}));check(remount.read(invalid),{});
const custom=imageDraftKey(scope,'custom')!;memory.set(custom,JSON.stringify({ratio:'4:9'}));check(remount.read(custom),{ratio:'4:9'});
const broken=new ImageNodeDraftStore(()=>{throw Error('storage disabled')});broken.write(a,{prompt:'in memory',ratio:'3:4'});check(broken.read(a),{prompt:'in memory',ratio:'3:4'});
const full=new ImageNodeDraftStore(()=>({getItem:()=>null,setItem:()=>{throw Error('quota')}}));full.write(a,{prompt:'quota fallback'});check(full.read(a),{prompt:'quota fallback'});
for(const dpr of [1,1.25,1.5,2,3,4])for(const pixels of [512,513,1600,1601])check(canvasMediaVariant(pixels/dpr,dpr),pixels<=512?'thumbnail':pixels<=1600?'preview':'original');
check(canvasMediaVariant(600,3),'original');check(canvasMediaVariant(600,2),'preview');check(canvasMediaVariant(1800,NaN),'original');
const client=readFileSync('src/components/canvas/canvas-client.tsx','utf8');
// Scene equality now belongs to the complete-value reconciliation owner, not
// a handwritten JSON field list in CanvasClient. Both visual fields must still
// invalidate a node, while an unchanged projection preserves its identity.
const projected=[{id:'image-draft-fixture',position:{x:0,y:0},data:{inspectOriginal:false,image:'/media/original.png'}}];
const reconciled=reconcileCanvasNodes([],projected);
check(reconcileCanvasNodes(reconciled,projected)===reconciled,true);
for(const data of [{...projected[0].data,inspectOriginal:true},{...projected[0].data,image:'/media/replacement.png'}]){
  const next=reconcileCanvasNodes(reconciled,[{...projected[0],data}]);
  check(next===reconciled,false);check(next[0]===reconciled[0],false);check(next[0].data,data);
}
const renderer=readFileSync('src/components/canvas/nodes/artwork-node.tsx','utf8');
const projection=readFileSync('src/lib/canvas/scene-projection.ts','utf8');
for(const [owner,token] of [
  [client,'const imageDraft = useImageNodeDraft('],
  [client,'const imageDraftNodeId = selectedPendId || selectedId'],
  [renderer,'forceOriginal={forceOriginal || !!d.inspectOriginal}'],
  [projection,'inspectOriginal: n.id === selectedId && multiSel.length <= 1'],
  [client,'imageDraft.seed(pend.id, { prompt: "" });'],
  [client,'imageDraft.seed(node.id,{prompt:"",ratio:"auto"})'],
]){assert.ok(owner.includes(token),token);checks++;}
assert.ok(!client.includes('setEditPrompt(carried ?? selected?.prompt'));checks++;
// Direct text references remain live inputs, not stale copies of the body.
assert.ok(!client.includes('imageDraft.seed(pend.id, { prompt: textSource'));checks++;
console.log(`PASS CANVAS_NODE_DRAFTS CHECKS=${checks} NODE_ACCOUNT_PROJECT_ISOLATION=YES EMPTY_DRAFT=YES REMOUNT=YES STORAGE_FAILURE=YES REAL_DPR=YES SUPPLIER_CALLS=0`);
