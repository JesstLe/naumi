import type {CanvasProject} from './project-catalog';

export type CanvasProjectView={activeKey:string|null;browsing:boolean;creatingNew:boolean;pinnedNode:string|null;pendingNode:string|null};
type Pending={id:string;select:boolean;focus:boolean};
type Ports={
 current:()=>boolean;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;
 push:()=>void;back:()=>void;select:(project:string,id:string|null)=>void;focus:(id:string,project:string)=>void;missing:()=>void;
 schedule:(run:()=>void)=>()=>void;
};
const legacy='nv:canvas:last',claim='nv:canvas:last:scope:v1';

/** View navigation only. Catalogue, selection, document/history and generation
 * keep their existing owners. No HTTP, task identity or paid replay capability. */
export function createCanvasProjectNavigation(identity:string,ports:Ports){
 const storedKey=`nv:canvas:last:v2:${encodeURIComponent(identity)}`;
 let state:CanvasProjectView={activeKey:null,browsing:true,creatingNew:false,pinnedNode:null,pendingNode:null};
 let pending:Pending|undefined,restored=false,lastSaved:string|null|undefined,desktop:string|undefined,pushed=false,epoch=0,cancel:(()=>void)|undefined;
 const listeners=new Set<()=>void>();
 const publish=(patch:Partial<CanvasProjectView>)=>{if(!ports.current())return;const next={...state,...patch};if((Object.keys(next) as Array<keyof CanvasProjectView>).every(key=>next[key]===state[key]))return;state=next;for(const fn of listeners)fn();};
 const invalidate=()=>{epoch++;cancel?.();cancel=undefined;};
 const save=(project:string|null)=>{if(lastSaved===project)return;try{
  if(project){ports.storage.setItem(storedKey,project);ports.storage.setItem(legacy,project);ports.storage.setItem(claim,identity);}
  else{ports.storage.removeItem(storedKey);if(ports.storage.getItem(claim)===identity)ports.storage.removeItem(legacy);}
  lastSaved=project;
 }catch{/* View persistence must not block navigation. */}};
 const remember=()=>{if(restored&&!state.browsing&&state.activeKey)save(state.activeKey);};
 const history=()=>{if(!state.browsing&&!pushed){pushed=true;ports.push();}else if(state.browsing)pushed=false;};
 const open=(project:string|null)=>{if(!ports.current())return;invalidate();pending=undefined;publish({activeKey:project,browsing:false,creatingNew:false,pendingNode:null});remember();history();};
 const browse=(clearProject=false)=>{if(!ports.current())return;invalidate();pending=undefined;publish({browsing:true,creatingNew:false,pendingNode:null,...(clearProject?{activeKey:null}:{})});save(null);history();};
 return {
  getSnapshot:()=>state,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
  initialize(node:string|null){
   if(restored||!ports.current())return;restored=true;
   if(node){pending={id:node,select:true,focus:true};publish({pinnedNode:node,pendingNode:node,browsing:false});history();return;}
   let last:string|null=null;
   try{last=ports.storage.getItem(storedKey);if(!last&&(!ports.storage.getItem(claim)||ports.storage.getItem(claim)===identity)){last=ports.storage.getItem(legacy);if(last)save(last);}}catch{/* Ignore unavailable view storage. */}
   if(last)open(last);
  },
  open,browse,
  start(){if(!ports.current())return;invalidate();pending=undefined;publish({activeKey:null,creatingNew:true,browsing:false,pendingNode:null});history();},
  empty(){if(ports.current())publish({creatingNew:true});},
  requestNode(id:string|null,select=true){if(!ports.current())return;invalidate();pending=id?{id,select,focus:false}:undefined;publish({pendingNode:id});},
  reconcile(projects:readonly CanvasProject[],loaded:boolean,initialProject?:string){
   if(!restored||!ports.current())return;
   if(!pending&&!state.creatingNew&&!state.browsing&&loaded&&state.activeKey&&!projects.some(p=>p.key===state.activeKey)){browse(true);ports.missing();}
   if(pending){
    const intent=pending,project=projects.find(p=>p.members.some(n=>n.id===intent.id)||p.textNodes.some(n=>n.id===intent.id)||[p.videoNodes,p.directorNodes,p.characterNodes,p.sceneNodes,p.audioNodes,p.timelineNodes].some(nodes=>nodes?.some(n=>n.id===intent.id)));
    if(project){ports.select(project.key,intent.select?intent.id:null);if(intent.focus)ports.focus(intent.id,project.key);open(project.key);}
    else if(loaded){pending=undefined;publish({pendingNode:null});}
   }
   if(initialProject&&desktop!==initialProject&&projects.some(p=>p.key===initialProject)){desktop=initialProject;open(initialProject);}
   if(state.creatingNew&&state.activeKey&&projects.some(p=>p.key===state.activeKey))publish({creatingNew:false});
   remember();
  },
  back(){if(!ports.current())return;if(pushed)ports.back();else browse();},
  pop(){if(!ports.current()||state.browsing)return false;pushed=false;browse();return true;},
  deferStarter(run:()=>void){if(!ports.current())return;cancel?.();const captured=epoch;cancel=ports.schedule(()=>{cancel=undefined;if(ports.current()&&captured===epoch&&state.creatingNew)run();});},
  dispose(){invalidate();},
 };
}
