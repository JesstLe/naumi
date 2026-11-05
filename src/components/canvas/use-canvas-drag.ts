"use client";
import {useLayoutEffect,useRef,type Dispatch,type SetStateAction} from "react";
import type {Node} from "@xyflow/react";
import {createCanvasDragController,rollbackCanvasMoves,type CanvasNodeMove} from "@/lib/canvas/drag-controller";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";
import type {CanvasPoint} from "@/lib/canvas/stable-placement";

type Input={scope:CanvasDocumentScope;selected:string[];nodes:Node[];artworks:Array<{id:string;canvasGroupId?:string|null;canvasX?:number|null;canvasY?:number|null}>;
  locked:(id:string)=>boolean;setNodes:Dispatch<SetStateAction<Node[]>>;local:(id:string,point:CanvasPoint,finished:boolean)=>void;
  hold:(points:Map<string,CanvasPoint>,scope:CanvasDocumentScope)=>()=>void;
  commit:(moves:CanvasNodeMove[],scope:CanvasDocumentScope)=>Promise<unknown>;warning:(message:string)=>void};

/** React adapter owns only live positions; document/undo writes belong to the
 * existing history owner. One gesture produces one persisted move-many command. */
export function useCanvasDrag(input:Input){
  const latest=useRef(input);useLayoutEffect(()=>{latest.current=input;});
  const owner=useRef<ReturnType<typeof createCanvasDragController>|null>(null);
  const commit:Input["commit"]=async(moves,scope)=>{
      const captured=latest.current,release=captured.hold(new Map(moves.map(move=>[move.id,move.to])),scope);
      try{await captured.commit(moves,scope);}
      catch(error){
        if(scope.viewCurrent()){
          captured.setNodes(nodes=>scope.viewCurrent()?rollbackCanvasMoves(nodes,moves):nodes);
          captured.warning(error instanceof Error?error.message:"画布保存失败");
        }
      }finally{release();}
    };
  if(!owner.current)owner.current=createCanvasDragController({
    snapshot:()=>latest.current,locked:id=>latest.current.locked(id),local:(...args)=>latest.current.local(...args),
    positions:(points,scope)=>latest.current.setNodes(nodes=>scope.viewCurrent()?nodes.map(node=>{const point=points.get(node.id);return point?{...node,position:point}:node;}):nodes),
    commit:(moves,scope)=>commit(moves,scope),
  });
  return {...owner.current,commitMoves:(moves:CanvasNodeMove[])=>commit(moves,latest.current.scope)};
}
