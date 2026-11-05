import type {CanvasPoint} from "./stable-placement";
import type {CanvasDocumentScope} from "./document-scope";
import type {CanvasHistoryAction} from "./history-model";

export type CanvasNodeMove={id:string;from:CanvasPoint;to:CanvasPoint};
type Node={id:string;position:CanvasPoint};
type Snapshot={scope:CanvasDocumentScope;selected:string[];nodes:Node[];artworks:Array<{id:string;canvasGroupId?:string|null;canvasX?:number|null;canvasY?:number|null}>};
type Services={snapshot:()=>Snapshot;locked:(id:string)=>boolean;positions:(points:Map<string,CanvasPoint>,scope:CanvasDocumentScope)=>void;
  local:(id:string,point:CanvasPoint,finished:boolean)=>void;commit:(moves:CanvasNodeMove[],scope:CanvasDocumentScope)=>Promise<unknown>};
const changed=(a:CanvasPoint,b:CanvasPoint)=>Math.round(a.x)!==Math.round(b.x)||Math.round(a.y)!==Math.round(b.y);

export function compileCanvasMove(moves:CanvasNodeMove[],position:(id:string)=>CanvasPoint|undefined):CanvasHistoryAction|null{
  const current=moves.map(move=>({...move,from:position(move.id)||move.from})).filter(move=>changed(move.from,move.to));
  return current.length?{kind:"move-many",moves:current}:null;
}
export function rollbackCanvasMoves<T extends Node&{dragging?:boolean}>(nodes:T[],moves:CanvasNodeMove[]):T[]{
  const byId=new Map(moves.map(move=>[move.id,move]));
  return nodes.map(node=>{const move=byId.get(node.id);return move&&!node.dragging&&node.position.x===move.to.x&&node.position.y===move.to.y?{...node,position:move.from}:node;});
}

/** One gesture owner for node, multi-select and named-group drags. No requests,
 * document state or undo stack here; it emits a single committed move command. */
export function createCanvasDragController(input:Services){
  let gesture:{scope:CanvasDocumentScope;anchor?:string;starts:Map<string,CanvasPoint>;group:boolean}|undefined;
  const begin=(nodes:Node[],anchor?:Node)=>{
    const s=input.snapshot(),art=s.artworks.find(art=>art.id===anchor?.id),members=art?.canvasGroupId?s.artworks.filter(item=>item.canvasGroupId===art.canvasGroupId):[];
    const group=members.length>1;
    const current=new Map(s.nodes.map(node=>[node.id,node.position]));
    const chosen=group?members.map(art=>({id:art.id,position:current.get(art.id)||{x:art.canvasX||0,y:art.canvasY||0}})):nodes.length?nodes:anchor?[anchor]:[];
    gesture={scope:s.scope,anchor:anchor?.id,group,starts:new Map(chosen.filter(node=>!input.locked(node.id)).map(node=>[node.id,{...node.position}]))};
  };
  const move=(node:Node)=>{
    const g=gesture;if(!g?.scope.viewCurrent()||!g.starts.has(node.id))return;
    input.local(node.id,node.position,false);if(!g.group||g.anchor!==node.id)return;
    const start=g.starts.get(node.id);if(!start)return;
    const dx=node.position.x-start.x,dy=node.position.y-start.y;
    input.positions(new Map(Array.from(g.starts,([id,p])=>[id,{x:p.x+dx,y:p.y+dy}])),g.scope);
  };
  const finish=async(nodes:Node[],anchor?:Node)=>{
    const g=gesture;gesture=undefined;if(!g?.scope.viewCurrent())return;
    const actual=new Map(nodes.map(node=>[node.id,node.position]));if(anchor)actual.set(anchor.id,anchor.position);
    if(g.group&&anchor&&g.starts.has(anchor.id)){const start=g.starts.get(anchor.id)!;for(const [id,p]of g.starts)actual.set(id,{x:p.x+anchor.position.x-start.x,y:p.y+anchor.position.y-start.y});}
    const moves:CanvasNodeMove[]=[];
    for(const [id,from]of g.starts){const to=actual.get(id);if(!to||input.locked(id))continue;
      if(id.startsWith("pend-")||id.startsWith("task-")){input.local(id,to,true);continue;}
      if(changed(from,to))moves.push({id,from,to:{...to}});
    }
    if(moves.length){input.positions(new Map(moves.map(move=>[move.id,move.to])),g.scope);await input.commit(moves,g.scope);}
  };
  return {start:(node:Node,nodes:Node[])=>begin(nodes,node),startMany:(nodes:Node[])=>begin(nodes),move,
    finish:(node:Node,nodes:Node[])=>finish(nodes,node),finishMany:(nodes:Node[])=>finish(nodes)};
}
