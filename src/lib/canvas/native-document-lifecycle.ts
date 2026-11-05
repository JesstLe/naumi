import {CANVAS_NATIVE_NODE_KINDS,filterCanvasNativeRecords,type CanvasNativeNodeSet,type CanvasNativeRecords} from "./native-node-records";
type NodeStore<N>={allNodes:N[];getNode:(id:string)=>N|undefined;flush:()=>Promise<unknown>;refresh:()=>Promise<unknown>;accept:(nodes:N[],current:()=>boolean)=>void};
export type CanvasNativeDocuments={
  [K in keyof CanvasNativeNodeSet]:NodeStore<CanvasNativeNodeSet[K][number]>;
};
/** One document lifecycle adapter for the existing stores. It owns no nodes,
 * retries, React state or tasks; repository receipts are the only revisions
 * accepted for committed deletion/restore, never local revision+1 guesses. */
export function canvasNativeDocuments(stores:CanvasNativeDocuments){
  return {
    settingsKinds:(id:string)=>Object.fromEntries(CANVAS_NATIVE_NODE_KINDS.map(({kind,records})=>[kind,!!stores[records].getNode(id)])) as Record<typeof CANVAS_NATIVE_NODE_KINDS[number]['kind'],boolean>,
    snapshot:():CanvasNativeRecords=>Object.fromEntries(CANVAS_NATIVE_NODE_KINDS.map(({records})=>[records,stores[records].allNodes.filter(node=>!node.deletedAt).map(node=>stores[records].getNode(node.id)||node)])) as CanvasNativeRecords,
    flush:()=>Promise.all(CANVAS_NATIVE_NODE_KINDS.map(({records})=>stores[records].flush())),
    refresh:()=>Promise.all(CANVAS_NATIVE_NODE_KINDS.map(({records})=>stores[records].refresh())),
    accept:(receipt:CanvasNativeRecords,current:()=>boolean)=>{
      if(!current())return;
      // Keep the kind->store type correlation at this one concrete boundary.
      for(const {records} of CANVAS_NATIVE_NODE_KINDS){const incoming=receipt[records];if(incoming)(stores[records].accept as (nodes:typeof incoming,current:()=>boolean)=>void)(incoming,current);}
    },
    project:(projectKey:string)=>filterCanvasNativeRecords(Object.fromEntries(CANVAS_NATIVE_NODE_KINDS.map(({records})=>[records,stores[records].allNodes])) as CanvasNativeRecords,node=>node.projectKey===projectKey),
  };
}
