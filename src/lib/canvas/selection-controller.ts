import type {CanvasDocumentScope} from './document-scope';
import {EMPTY_CANVAS_SELECTION,patchCanvasSelection,canvasNodeClick,canvasFlowSelection,canvasSelectionIds,type CanvasSelection,type CanvasSelectedEdge} from './selection';

type Kind='art'|'text'|'video'|'director'|'character'|'scene'|'audio'|'timeline';
type Native={id:string;projectKey:string;deletedAt?:string|null};
export type CanvasSelectionCatalogue={project:string|null;artworks:readonly {id:string;canvasGroupId?:string|null}[];text:readonly Native[];video:readonly Native[];director:readonly Native[];character:readonly Native[];scene:readonly Native[];audio:readonly Native[];timeline:readonly Native[]};
export type CanvasSelectionPorts={
  catalogue:()=>CanvasSelectionCatalogue;tool:()=>string;taskFailed:(id:string)=>boolean;
  nodes:()=>readonly {id:string}[];
  nodesSelection:(select:(id:string,selected:boolean)=>boolean)=>void;
  edgesSelection:(select:(id:string,selected:boolean)=>boolean)=>void;
  leaveBox:()=>void;timer:{set:(run:()=>void,delay:number)=>unknown;clear:(token:unknown)=>void};
};
type Change<T>=T|((previous:T)=>T);
type Navigation={source:CanvasDocumentScope;project:string|null;patch:Partial<CanvasSelection>;copied?:string[]};

/** Selection is ephemeral view state, not another document/history/task store.
 * One binding owns focus, Flow selection and copied-node projection. A retired
 * view cannot publish even through a deferred React Flow state updater. */
export function createCanvasSelectionController(ports:()=>CanvasSelectionPorts){
  let active:ReturnType<typeof binding>|undefined,navigation:Navigation|undefined,mounted=true;
  function binding(scope:CanvasDocumentScope,initial:Partial<CanvasSelection>={},copied?:string[]){
    let snapshot=patchCanvasSelection(EMPTY_CANVAS_SELECTION,initial),pending=copied,timer:unknown;
    const listeners=new Set<()=>void>(),live=()=>mounted&&active===view&&scope.viewCurrent();
    const publish=(next:CanvasSelection)=>{if(next!==snapshot){snapshot=next;for(const listener of listeners)listener();}};
    const patch=(value:Partial<CanvasSelection>)=>{if(live())publish(patchCanvasSelection(snapshot,value));};
    const cancelProjection=()=>{pending=undefined;if(timer!==undefined){ports().timer.clear(timer);timer=undefined;}};
    const nodes=(select:(id:string)=>boolean)=>{if(live())ports().nodesSelection((id,selected)=>live()?select(id):selected);};
    const edges=(select:(id:string)=>boolean)=>{if(live())ports().edgesSelection((id,selected)=>live()?select(id):selected);};
    const kinds=()=>{
      const catalogue=ports().catalogue(),result=new Map<string,Kind>(catalogue.artworks.map(node=>[node.id,'art']));
      for(const kind of ['video','director','character','scene','audio','timeline','text'] as const)
        for(const node of catalogue[kind])if(node.projectKey===catalogue.project)result.set(node.id,kind);
      return result;
    };
    const field=<K extends keyof CanvasSelection>(key:K)=>(change:Change<CanvasSelection[K]>)=>{
      if(live())patch({[key]:typeof change==='function'?(change as (previous:CanvasSelection[K])=>CanvasSelection[K])(snapshot[key]):change});
    };
    const startProjection=()=>{
      if(live()&&pending&&timer===undefined){
        const intended=pending,token=ports().timer.set(()=>{if(timer===token)timer=undefined;if(live()&&pending===intended)pending=undefined;},1500);timer=token;
      }
    };
    const selectProject=(project:string|null,value:Partial<CanvasSelection>,copiedIds?:string[])=>{
      if(!live())return;
      cancelProjection();
      if(project===scope.project){patch(value);pending=copiedIds;startProjection();}
      else navigation={source:scope,project,patch:value,copied:copiedIds};
    };
    const selectIds=(ids:string[])=>{
      if(!live())return;cancelProjection();
      const value=canvasSelectionIds(ids,kinds()),valid=new Set(value.multiSel);patch(value);edges(()=>false);nodes(id=>valid.has(id));
    };
    const view={scope,getSnapshot:()=>snapshot,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
      patch,update(change:(previous:CanvasSelection)=>CanvasSelection){if(live())publish(change(snapshot));},
      setSelectedId:field('selectedId'),setSelectedTextId:field('selectedTextId'),setSelectedPendId:field('selectedPendId'),setSelectedEdge:field('selectedEdge'),setMultiSel:field('multiSel'),
      clear(exitBox=false){if(!live())return;cancelProjection();patch({multiSel:[],selectedEdge:null});edges(()=>false);nodes(()=>false);if(exitBox)ports().leaveBox();},
      reset(){if(!live())return;cancelProjection();patch(EMPTY_CANVAS_SELECTION);edges(()=>false);nodes(()=>false);},
      clearFocus(){if(!live())return;cancelProjection();patch({selectedId:null,selectedTextId:null,selectedPendId:null});},
      selectIds,toggle(id:string,base=snapshot.multiSel){const ids=new Set(base);if(ids.has(id))ids.delete(id);else ids.add(id);selectIds([...ids]);},
      group(ids:string[]){if(!live())return;cancelProjection();patch({selectedId:null,selectedTextId:null,selectedPendId:null,multiSel:ids});const selected=new Set(ids);nodes(id=>selected.has(id));},
      nodeClick(event:{ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean},node:{id:string}){
        if(!live()||ports().tool()==='hand'||node.id.startsWith('task-')&&!ports().taskFailed(node.id))return;
        cancelProjection();const catalogue=ports().catalogue(),art=catalogue.artworks.find(item=>item.id===node.id),group=art?.canvasGroupId?catalogue.artworks.filter(item=>item.canvasGroupId===art.canvasGroupId).map(item=>item.id):[];
        const value=canvasNodeClick(node.id,!!(event.ctrlKey||event.metaKey||event.shiftKey),group);patch(value);edges(()=>false);
        if(value.multiSel){const selected=new Set(value.multiSel);nodes(id=>selected.has(id));}
      },
      context(id:string,modified:boolean):string[]|null{
        if(!live()||id.startsWith('task-')&&!ports().taskFailed(id))return null;
        cancelProjection();patch({selectedEdge:null});edges(()=>false);
        const base=snapshot.multiSel;
        if(base.length>1&&base.includes(id))return base;
        if(id.startsWith('text-')||id.startsWith('pend-')||id.startsWith('task-')){
          patch({selectedId:id.startsWith('task-')?id:null,selectedTextId:id.startsWith('text-')?id:null,selectedPendId:id.startsWith('pend-')?id:null,multiSel:[]});nodes(()=>false);
        }else if(modified)view.toggle(id);else selectIds([id]);
        return base;
      },
      edgeClick(edge:CanvasSelectedEdge&{selectable?:boolean}){if(!live()||ports().tool()==='hand'||edge.selectable===false)return;cancelProjection();patch({selectedId:null,selectedTextId:null,selectedPendId:null,multiSel:[],selectedEdge:{id:edge.id,source:edge.source,target:edge.target}});nodes(()=>false);edges(id=>id===edge.id);},
      flowSelection(nodes:Array<{id:string;type?:string}>,edges:CanvasSelectedEdge[]){if(live()&&!pending)publish(canvasFlowSelection(snapshot,nodes,edges));},
      selectInProject:(project:string|null,value:Partial<CanvasSelection>)=>selectProject(project,value),
      copied(project:string,ids:string[],focusSingle=false){selectProject(project,{selectedId:focusSingle&&ids.length===1?ids[0]:null,selectedTextId:null,selectedPendId:null,selectedEdge:null,multiSel:ids},ids);},
      project(){
        if(!live()||!pending)return;startProjection();const available=new Set(ports().nodes().map(node=>node.id));if(!pending.every(id=>available.has(id)))return;
        const selected=new Set(pending);cancelProjection();nodes(id=>selected.has(id));
      },
      dispose:cancelProjection,
    };
    return view;
  }
  return {
    bind(scope:CanvasDocumentScope){
      if(active?.scope===scope)return active;
      active?.dispose();const intent=navigation;navigation=undefined;
      const adopt=intent?.source.documentCurrent()&&intent.source.account===scope.account&&intent.source.workspace===scope.workspace&&intent.project===scope.project?intent:undefined;
      active=binding(scope,adopt?.patch,adopt?.copied);return active;
    },
    mount(value:boolean){mounted=value;if(!value){active?.dispose();navigation=undefined;}},
  };
}
