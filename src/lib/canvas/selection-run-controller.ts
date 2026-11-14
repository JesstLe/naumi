import type {CanvasDocumentScope} from "./document-scope";
import {runSelectionBatch,type SelectionRunNode} from "./selection-run";

type Progress={busy:boolean;completed:number;total:number};
const idle:Progress={busy:false,completed:0,total:0};
type Run={scope:CanvasDocumentScope;snapshot:Progress};
type Services={targets:(ids:string[])=>SelectionRunNode[];canRun:(node:SelectionRunNode)=>boolean;run:(node:SelectionRunNode,current:()=>boolean)=>Promise<boolean>};
/** Selection orchestration only. Submits all selected nodes through existing
 * image/text/pending task owners; never submits providers or owns receipts. */
export function createCanvasSelectionRun(){
  const runs=new Map<string,Run>(),listeners=new Set<()=>void>(),notify=()=>listeners.forEach(fn=>fn());
  return {
    subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
    snapshot:(scope:CanvasDocumentScope)=>{const run=runs.get(scope.key);return run?.scope.documentCurrent()?run.snapshot:idle;},
    async start(scope:CanvasDocumentScope,ids:string[],services:Services){
      scope.assertView();const previous=runs.get(scope.key);if(previous?.scope.documentCurrent()&&previous.snapshot.busy)return;
      const targets=services.targets(ids);if(!targets.length)return;
      const run:Run={scope,snapshot:{busy:true,completed:0,total:targets.length}};runs.set(scope.key,run);notify();
      try{
        const result=await runSelectionBatch(targets,{isCurrent:scope.viewCurrent,canRun:services.canRun,run:target=>services.run(target,scope.viewCurrent),
          onProgress:(completed,total)=>{run.snapshot={busy:true,completed,total};notify();}});
        return {...result,skipped:result.skipped+new Set(ids).size-targets.length};
      }finally{if(runs.get(scope.key)===run){run.snapshot={...run.snapshot,busy:false};notify();}}
    },
  };
}
