import type {CanvasPendingNode} from './scene-types';
import type {CanvasPoint} from './stable-placement';
import {placeGenerationPreview} from './generation-feedback';

type Change=CanvasPendingNode[]|((nodes:CanvasPendingNode[])=>CanvasPendingNode[]);
type Occupied=CanvasPoint&{width:number;height:number};
export const EMPTY_PENDING_PRESENTATION:CanvasPendingNode[]=[];

/** Session-local placeholders, not task execution or persistent documents.
 * One bucket owns both the visible projection and retained edit/detail cards.
 * Callers capture a binding before awaiting; late updates stay in that original
 * account/workspace/project, even when another view reuses a placeholder ID. */
export function createCanvasPendingPresentation(){
  const buckets=new Map<string,ReturnType<typeof bucket>>();
  function bucket(){
    const records=new Map<string,CanvasPendingNode>(),retained=new Set<string>(),listeners=new Set<()=>void>();
    let order:string[]=[],snapshot:CanvasPendingNode[]=[];
    const current=()=>order.map(id=>records.get(id)!);
    const publish=()=>{snapshot=current();for(const listener of listeners)listener();};
    const set=(change:Change)=>{
      const next=typeof change==='function'?change(current()):change;
      if(next===snapshot)return;
      const ids=new Set(next.map(node=>node.id));
      for(const id of records.keys())if(!ids.has(id)&&!retained.has(id))records.delete(id);
      for(const node of next)records.set(node.id,node);
      order=next.map(node=>node.id);publish();
    };
    const retain=(node:CanvasPendingNode)=>{
      retained.add(node.id);records.set(node.id,node);
      if(!order.includes(node.id))order=[...order,node.id];publish();
    };
    return {
      getSnapshot:()=>snapshot,
      subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
      set,get:(id:string)=>records.get(id),
      retained:(id:string)=>retained.has(id),
      retain,
      beginEdit(node:Omit<CanvasPendingNode,'x'|'y'>,placement:{preferred:CanvasPoint;occupied:Occupied[]}){
        const occupied=[...placement.occupied],size=node.generationSize??{width:320,height:320};
        for(const id of retained){
          const saved=records.get(id)!;
          if(saved.operationKey===node.operationKey&&saved.generationFailure){retained.delete(id);records.delete(id);order=order.filter(key=>key!==id);}
          else occupied.push({x:saved.x,y:saved.y,...(saved.generationSize??size)});
        }
        order=order.filter(id=>{const saved=records.get(id)!;if(saved.operationKey!==node.operationKey||!saved.generationFailure)return true;records.delete(id);return false;});
        const next={...node,...placeGenerationPreview(placement.preferred,size,occupied)};
        retain(next);return next;
      },
      update(id:string,patch:Partial<CanvasPendingNode>){
        const saved=records.get(id);if(saved&&retained.has(id))retain({...saved,...patch,id:saved.id});
      },
      release(id:string){retained.delete(id);if(!order.includes(id))records.delete(id);},
      restore(visible=true){order=[...order.filter(id=>!retained.has(id)),...(visible?[...retained]:[])];publish();},
      clearTransient(){
        for(const id of records.keys())if(!retained.has(id))records.delete(id);
        order=[...retained];publish();
      },
      remove(id:string):'busy'|'removed'{
        if(retained.has(id)&&records.get(id)?.generating)return 'busy';
        retained.delete(id);records.delete(id);order=order.filter(key=>key!==id);publish();return 'removed';
      },
      drag(id:string,position:CanvasPoint,commit=false){
        const node=records.get(id);if(!node)return;
        records.set(id,{...node,...position});
        // ReactFlow renders pointer movement. Attachment reads the live record;
        // only the committed move publishes a new React snapshot.
        if(commit)publish();
      },
    };
  }
  return {bind(key:string){let view=buckets.get(key);if(!view){view=bucket();buckets.set(key,view);}return view;}};
}
