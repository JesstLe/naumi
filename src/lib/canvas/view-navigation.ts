import type {CanvasDocumentScope} from './document-scope';
import {canvasEditableAreaTarget,type CanvasEditableArea} from './view-controls';

type Binding={scope?:CanvasDocumentScope;contextKey:string;browsing:boolean};
type Cancel=()=>void;
type Flow={
 getViewport:()=>{x:number;y:number;zoom:number};
 setCenter:(x:number,y:number,options:{zoom:number;duration:number})=>unknown;
 fitView:(options:{nodes:{id:string}[];padding:number;duration:number;maxZoom:number})=>unknown;
};
type Ports={frame:(run:()=>void)=>Cancel;timer:(run:()=>void)=>Cancel;flow:()=>Flow|null;
 area:()=>{clientWidth:number;clientHeight:number}|null;onIntent:()=>void};
type Pending={valid:()=>boolean;current:()=>boolean;cancel:()=>void};

/** The existing view's one navigation revision now fences every queued viewport
 * intent. It owns only scheduling/identity,never nodes,history,jobs or billing.
 * A captured intent may adopt exactly its immediately following target project;
 * manual navigation,other views,ABA or a new actor cannot inherit it. */
export function createCanvasViewNavigation(ports:Ports){
 const navigationRevision={current:0};let binding:Binding|undefined,pending:Pending|undefined,mounted=true;
 const retire=()=>{pending?.cancel();pending=undefined;};
 const cancel=()=>{navigationRevision.current++;retire();};
 const sameDocument=(origin:CanvasDocumentScope,target:CanvasDocumentScope)=>origin.documentCurrent()&&origin.account===target.account&&origin.workspace===target.workspace;
 function capture(origin:CanvasDocumentScope){
  const initial=binding,revision=navigationRevision.current;
  const accepted=mounted&&initial?.scope===origin&&origin.viewCurrent()&&!initial.browsing;
  function canSchedule(project:string|null){
   if(!accepted||!mounted||!origin.documentCurrent()||!binding?.scope||binding.browsing)return false;
   if(navigationRevision.current===revision&&binding.scope===origin)return true;
   return navigationRevision.current===revision+1&&binding.scope!==origin&&binding.scope.project===project&&sameDocument(origin,binding.scope);
  }
  function schedule(project:string|null,frames:number,timer:boolean,perform:()=>void){
   if(!canSchedule(project))return false;
   cancel();const start=binding!,ticket=navigationRevision.current;
   const transition=start.scope!.project===project?0:1;
   let cancelFrame:Cancel|undefined,cancelTimer:Cancel|undefined;
   const targetCurrent=()=>mounted&&!!binding?.scope&&!binding.browsing&&sameDocument(origin,binding.scope)&&binding.scope.viewCurrent()&&
    navigationRevision.current===ticket+transition&&binding.scope.project===project&&(transition?binding.scope!==start.scope:binding.scope===start.scope);
   const waiting=()=>transition===1&&mounted&&origin.documentCurrent()&&!!binding&&binding.scope===start.scope&&!binding.browsing&&navigationRevision.current===ticket;
   const request:Pending={current:()=>pending===request&&targetCurrent(),valid:()=>pending===request&&(targetCurrent()||waiting()),cancel(){cancelFrame?.();cancelTimer?.();}};
   pending=request;ports.onIntent();
   const finish=()=>{if(request.current())perform();if(pending===request)pending=undefined;};
   const frame=()=>{cancelFrame=ports.frame(()=>{cancelFrame=undefined;if(!request.valid()){if(pending===request)pending=undefined;return;}if(--frames>0)frame();else if(timer)cancelTimer=ports.timer(()=>{cancelTimer=undefined;finish();});else finish();});};
   frame();return true;
  }
  return {
   area(area:CanvasEditableArea,project:string|null=origin.project){
    const frozen={...area};return schedule(project,1,true,()=>{const flow=ports.flow(),canvas=ports.area();if(!flow||!canvas)return;
     const target=canvasEditableAreaTarget(frozen,flow.getViewport(),canvas);if(target)void flow.setCenter(target.x,target.y,{zoom:target.zoom,duration:320});
    });
   },
   fitNodes(ids:readonly string[],project:string|null=origin.project){const frozen=[...ids];return schedule(project,2,false,()=>{void ports.flow()?.fitView({nodes:frozen.map(id=>({id})),padding:.2,duration:240,maxZoom:1});});},
  };
 }
 return {navigationRevision,capture,cancel,
  bind(next:Binding){if(!binding){binding=next;return;}if(binding.scope===next.scope&&binding.contextKey===next.contextKey&&binding.browsing===next.browsing)return;
   binding=next;navigationRevision.current++;if(pending&&!pending.valid())retire();
  },
  mount(){mounted=true;},dispose(){mounted=false;cancel();},
 };
}
