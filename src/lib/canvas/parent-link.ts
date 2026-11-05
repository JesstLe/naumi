import type {Artwork} from "../mock-data";

/** Canvas-add primary is project membership, while parentIds are explicit inputs.
 * Direct edits, history replay and local projection must use identical semantics. */
export function changeCanvasParent(row:Pick<Artwork,"parentId"|"parentIds"|"source">,parentId:string,add:boolean){
  const parents=new Set(row.parentIds||[]);let primary=row.parentId||null;
  if(add){parents.add(parentId);primary??=parentId;}
  else{parents.delete(parentId);if(row.source!=="canvas-add"&&primary===parentId)primary=null;}
  return {parentId:primary,parentIds:Array.from(parents)};
}

export function canvasParentCycle(nodes:Array<Pick<Artwork,"id"|"parentId"|"parentIds"|"source">>,targetId:string,sourceId:string){
  const byId=new Map(nodes.map(node=>[node.id,node])),seen=new Set<string>(),todo=[sourceId];
  while(todo.length){
    const id=todo.pop()!;if(id===targetId)return true;if(seen.has(id))continue;seen.add(id);
    const node=byId.get(id);if(!node)continue;
    if(node.parentId&&(node.source!=="canvas-add"||node.parentIds?.includes(node.parentId)))todo.push(node.parentId);
    todo.push(...(node.parentIds||[]));
  }
  return false;
}
