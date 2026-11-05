import type {Node} from "@xyflow/react";
import type {CanvasDocumentScope} from "./document-scope";
import type {CanvasHistoryAction} from "./history-model";
import {flowNodeSize} from "./node-geometry";
import {smartLayout,type LayoutEdge} from "./smart-layout";

type MoveAction=Extract<CanvasHistoryAction,{kind:"move-many"}>;
export type CanvasArrangementScene={nodes:Node[];edges:LayoutEdge[];movableIds:string[];locked:(id:string)=>boolean};

/** Pure projection: layout changes positions only. Transient/locked nodes are
 * obstacles, workflow group envelopes are not nodes, and lineage is untouched. */
export function planCanvasArrangement(scene:CanvasArrangementScene){
  const mobileIds=new Set(scene.movableIds);
  const input=scene.nodes.filter(node=>node.type!=="workflowGroup").map(node=>({
    id:node.id,...flowNodeSize(node),x:node.position.x,y:node.position.y,
    fixed:!mobileIds.has(node.id)||scene.locked(node.id),
    group:(node.data as {canvasGroupId?:string|null}).canvasGroupId,
  }));
  const positions=smartLayout(input,scene.edges);
  const moves:MoveAction["moves"]=input.filter(node=>!node.fixed).flatMap(node=>{
    const to=positions.get(node.id)!,from={x:node.x,y:node.y};
    return to.x===from.x&&to.y===from.y?[]:[{id:node.id,from,to}];
  });
  return {moves,mobileIds};
}

type ArrangementPorts={
  available:()=>boolean;closeMenu:()=>void;
  text:{flush:()=>Promise<unknown>;getSnapshot:()=>{unsaved:number}};
  history:{busy:{current:boolean};setBusy:(value:boolean)=>void;apply:(action:MoveAction)=>Promise<unknown>;record:(action:MoveAction)=>void};
  scene:()=>CanvasArrangementScene;
  view:{begin:()=>number;revision:()=>number;nodes:()=>Node[];fit:(ids:string[])=>void;frame:(run:()=>void)=>void};
  notice:(message:string)=>void;messages:{unsaved:string;tooMany:string;failed:string};
};

/** Application orchestration only. The existing history owner retains the
 * transaction, request identity, receipt and single undo entry. A pending fit
 * belongs to the originating document AND navigation intent, not just node IDs. */
export async function arrangeCanvasDocument(scope:CanvasDocumentScope,ports:ArrangementPorts){
  if(!scope.viewCurrent()||!ports.available()||ports.history.busy.current)return;
  ports.closeMenu();
  ports.history.setBusy(true);
  try{
    const navigation=ports.view.begin();
    await ports.text.flush();
    if(!scope.viewCurrent())return;
    if(ports.text.getSnapshot().unsaved)throw new Error(ports.messages.unsaved);
    const {moves,mobileIds}=planCanvasArrangement(ports.scene());
    if(moves.length>400)throw new Error(ports.messages.tooMany);
    if(moves.length){
      const action:MoveAction={kind:"move-many",moves};
      // Persist before presentation; failed/UNKNOWN writes never gain an undo.
      await ports.history.apply(action);
      ports.history.record(action);
    }
    let frames=0;
    const fit=()=>{
      if(!scope.viewCurrent()||ports.view.revision()!==navigation)return;
      const nodes=ports.view.nodes(),positions=new Map(nodes.map(node=>[node.id,node.position]));
      if(nodes.length&&moves.every(move=>{const live=positions.get(move.id);return live?.x===move.to.x&&live?.y===move.to.y;})){
        ports.view.fit(Array.from(mobileIds));
      }else if(++frames<60)ports.view.frame(fit);
    };
    if(scope.viewCurrent()&&ports.view.revision()===navigation)ports.view.frame(fit);
  }catch(error){
    if(scope.viewCurrent())ports.notice(error instanceof Error?error.message:ports.messages.failed);
  }finally{ports.history.setBusy(false);}
}
