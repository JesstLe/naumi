import type {CanvasGenerationTask} from './scene-types';
import type {CanvasPoint} from './stable-placement';
import {generationPlaceholderSize,generationPositionForTask} from './generation-feedback';
import {createCanvasGenerationActivity} from './generation-activity';
import {beginCanvasImageAttemptTasks} from './background-generation';

type Size={width:number;height:number};
type Occupied=CanvasPoint&Size;
type TaskDraft=Omit<CanvasGenerationTask,'position'>;
type Activity<T>=Omit<Parameters<typeof createCanvasGenerationActivity<T>>[0],'operations'|'changed'>;
export type CanvasGenerationSnapshot={
  tasks:readonly CanvasGenerationTask[];
  positions:Readonly<Record<string,CanvasPoint>>;
  operations:ReadonlySet<string>;
};
export const EMPTY_GENERATION_PRESENTATION:CanvasGenerationSnapshot={tasks:[],positions:{},operations:new Set()};

/** View-only state, bound to the existing account/workspace/project key. Each
 * asynchronous caller captures its binding, so late progress/cleanup cannot
 * mutate a newly selected view. Execution, receipts, billing and document writes
 * remain in their original controllers. No second task engine lives here. */
export function createCanvasGenerationPresentation(){
  const buckets=new Map<string,ReturnType<typeof bucket>>();
  function bucket(){
    let tasks:CanvasGenerationTask[]=[];
    const positions:Record<string,CanvasPoint>={},sizes:Record<string,Size>={},operations=new Set<string>(),listeners=new Set<()=>void>();
    let snapshot:CanvasGenerationSnapshot={tasks,positions,operations:new Set()};
    const publish=()=>{
      if(snapshot.tasks===tasks&&snapshot.operations.size===operations.size&&[...operations].every(key=>snapshot.operations.has(key)))return;
      snapshot={tasks,positions,operations:new Set(operations)};for(const listener of listeners)listener();
    };
    const forget=(id:string)=>{delete positions[id];delete sizes[id];};
    const update=(id:string,patch:Partial<Omit<CanvasGenerationTask,'id'|'operationKey'|'sourceId'>>)=>{
      if(!tasks.some(task=>task.id===id))return;
      tasks=tasks.map(task=>task.id===id?{...task,...patch}:task);publish();
    };
    return {
      getSnapshot:()=>snapshot,
      subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
      busy:(key:string)=>operations.has(key),
      siblingCount:(sourceId:string)=>tasks.filter(task=>task.sourceId===sourceId).length,
      position:(id:string,fallback:CanvasPoint)=>positions[id]??fallback,
      start(task:TaskDraft,placement:{preferred:CanvasPoint;existing?:CanvasPoint;occupied:Occupied[];reserve?:boolean}){
        const failed=tasks.filter(item=>item.operationKey===task.operationKey&&item.failure),last=failed.at(-1);
        const retry=last?positions[last.id]??last.position:undefined;
        const failedIds=new Set(failed.map(item=>item.id));
        const occupied=[...placement.occupied,...Object.entries(positions).filter(([id])=>!failedIds.has(id)).map(([id,position])=>({...position,...(sizes[id]??generationPlaceholderSize('auto'))}))];
        const size=task.previewSize??generationPlaceholderSize('auto');
        const position=placement.reserve===false?placement.preferred:generationPositionForTask(placement.existing??retry,placement.preferred,size,occupied);
        for(const item of failed)forget(item.id);
        if(placement.reserve!==false){positions[task.id]=position;sizes[task.id]=size;}
        tasks=beginCanvasImageAttemptTasks(tasks,[{...task,position}]);publish();return position;
      },
      /** One operation may expose several destinations; none owns a paid request. */
      startGroup(records:Array<TaskDraft&{position:CanvasPoint}>){
        const operationKeys=new Set(records.map(record=>record.operationKey));
        const replaced=tasks.filter(task=>task.failure&&operationKeys.has(task.operationKey));
        for(const task of replaced)forget(task.id);
        for(const task of records){positions[task.id]={...task.position};sizes[task.id]=task.previewSize??generationPlaceholderSize('auto');}
        tasks=beginCanvasImageAttemptTasks(tasks,records);if(records.length||replaced.length)publish();
      },
      update,
      visibility(records:CanvasGenerationTask[],visible:boolean){
        const ids=new Set(records.map(task=>task.id));
        if(visible){
          for(const task of records){positions[task.id]??=task.position;sizes[task.id]??=task.previewSize??generationPlaceholderSize('auto');}
          tasks=[...tasks,...records.filter(task=>!tasks.some(live=>live.id===task.id))];
        }else{for(const id of ids)forget(id);tasks=tasks.filter(task=>!ids.has(task.id));}
        if(records.length)publish();
      },
      hide(id:string){if(!tasks.some(task=>task.id===id))return;tasks=tasks.filter(task=>task.id!==id);publish();},
      remove(id:string){forget(id);const next=tasks.filter(task=>task.id!==id);if(next.length!==tasks.length){tasks=next;publish();}},
      drag(id:string,position:CanvasPoint,commit=false){
        // ReactFlow owns live drag rendering; do not wake the entire Canvas for
        // every pointer move. Attachments still read the current position.
        if(!tasks.some(task=>task.id===id)&&!positions[id])return;
        positions[id]={...position};if(commit)update(id,{position:{...position}});
      },
      activity<T>(input:Activity<T>){return createCanvasGenerationActivity({...input,operations,changed:publish});},
    };
  }
  return {bind(key:string){let view=buckets.get(key);if(!view){view=bucket();buckets.set(key,view);}return view;}};
}
