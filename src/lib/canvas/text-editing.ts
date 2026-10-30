import type {CanvasDocumentScope} from './document-scope';
import type {CanvasTextNode} from './text-document-model';
import {textPatchOf,type CanvasHistoryAction} from './history-model';
import {canvasTextEditPatch} from './text-edit-history';
import {estimateTextNodeHeight,TEXT_NODE_MIN_W,TEXT_NODE_MIN_H,TEXT_NODE_MAX_W,TEXT_NODE_MAX_H} from './node-geometry';

type Bounds={x:number;y:number;width:number;height:number};
type Ports={writable:()=>boolean;locked:(id:string)=>boolean;
 document:{getSnapshot:()=>{nodes:CanvasTextNode[]};set:(update:(nodes:CanvasTextNode[])=>CanvasTextNode[])=>void;save:(node:CanvasTextNode)=>Promise<unknown>};
 history:{record:(scope:CanvasDocumentScope,action:CanvasHistoryAction)=>void};
};
/** Manual editing owns decisions and ephemeral expansion, not text storage or
 * another save queue. Original document/history keep drafts, conflicts and ACKs. */
export function createCanvasTextEditing(){
 const empty=new Set<string>(),fits=new Map<string,Map<string,string>>();
 let active:CanvasDocumentScope|undefined,expanded=new Set<string>();
 const listeners=new Set<()=>void>();
 return {bind(scope:CanvasDocumentScope,ports:()=>Ports){
  if(active!==scope){active=scope;expanded=new Set();}
  const documentKey=JSON.stringify([scope.account,scope.workspace]);let fitted=fits.get(documentKey);if(!fitted){fitted=new Map();fits.set(documentKey,fitted);}const signatures=fitted;
  const {document,history}=ports();
  const live=()=>active===scope&&scope.viewCurrent()&&ports().writable();
  const current=(id:string)=>live()&&!ports().locked(id)?document.getSnapshot().nodes.find(node=>node.id===id&&(!scope.project||node.projectKey===scope.project)):undefined;
  const replace=(updated:CanvasTextNode)=>document.set(nodes=>nodes.map(node=>node.id===updated.id?updated:node));
  const record=(action:CanvasHistoryAction)=>history.record(scope,action);
  return {
   getSnapshot:()=>active===scope?expanded:empty,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
   change(id:string,content:string){const node=current(id);if(node)replace({...node,content:content.slice(0,12000),updatedAt:new Date().toISOString()});},
   commit(id:string,content:string,initialContent?:string){
    // A blur belongs to its focus session. It may finish in the original
    // document after project navigation, never in another actor/workspace.
    if(!scope.documentCurrent()||!ports().writable()||ports().locked(id))return;
    const node=document.getSnapshot().nodes.find(node=>node.id===id&&(!scope.project||node.projectKey===scope.project));if(!node)return;
    if(initialContent!==undefined&&content===initialContent&&node.content!==content)return;
    const updated={...node,content:content.slice(0,12000),updatedAt:new Date().toISOString()},patch=canvasTextEditPatch(textPatchOf(node),updated.content,initialContent);
    if(patch)record({kind:'text-patch',id,from:patch.from,to:patch.to});replace(updated);void document.save(updated);
   },
   async rename(id:string,title:string){const node=current(id),name=title.trim();if(!node||!name||node.title===name)return;
    const updated={...node,title:name,updatedAt:new Date().toISOString()};record({kind:'text-patch',id,from:textPatchOf(node),to:textPatchOf(updated)});replace(updated);
    // Document owner retains unknown/failed requests and later edits. Do not
    // roll an old full-node snapshot over a newer draft after awaiting I/O.
    await document.save(updated);
   },
   resize(id:string,bounds:Bounds){const node=current(id);if(!node)return;
    const width=Number.isFinite(bounds.width)?bounds.width:node.width,height=Number.isFinite(bounds.height)?bounds.height:node.height;
    const updated={...node,canvasX:Number.isFinite(bounds.x)?bounds.x:node.canvasX,canvasY:Number.isFinite(bounds.y)?bounds.y:node.canvasY,
     width:Math.round(Math.min(TEXT_NODE_MAX_W,Math.max(TEXT_NODE_MIN_W,width))),height:Math.round(Math.min(id.startsWith('text-import-')?100000:TEXT_NODE_MAX_H,Math.max(TEXT_NODE_MIN_H,height))),updatedAt:new Date().toISOString()};
    if(['canvasX','canvasY','width','height'].some(key=>node[key as keyof CanvasTextNode]!==updated[key as keyof CanvasTextNode]))
     record({kind:'text-size',id,from:{x:node.canvasX,y:node.canvasY,fields:textPatchOf(node)},to:{x:updated.canvasX,y:updated.canvasY,fields:textPatchOf(updated)}});
    // The completed manual resize is the new auto-fit baseline until text,
    // references or width next change. Heights are never rewritten on expand.
    signatures.set(id,signature(updated));replace(updated);void document.save(updated);
   },
   toggle(id:string){if(!current(id))return;const next=new Set(expanded);next.has(id)?next.delete(id):next.add(id);expanded=next;for(const fn of listeners)fn();},
   fit(ready:boolean){if(!ready||!live())return;const updates:CanvasTextNode[]=[];
    for(const node of document.getSnapshot().nodes){
     if(node.id.startsWith('text-import-')||ports().locked(node.id))continue;
     const sig=signature(node);if(signatures.get(node.id)===sig)continue;signatures.set(node.id,sig);
     const height=estimateTextNodeHeight(node);if(Math.abs(height-node.height)<28)continue;updates.push({...node,height,updatedAt:new Date().toISOString()});
    }
    if(!updates.length)return;const byId=new Map(updates.map(node=>[node.id,node]));document.set(nodes=>nodes.map(node=>byId.get(node.id)??node));for(const node of updates)void document.save(node);
   },
  };
 }};
}
const signature=(node:CanvasTextNode)=>JSON.stringify([node.content,node.prompt,node.sourceIds?.length??0,node.productIds?.length??0,node.width]);
