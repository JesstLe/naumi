import type {CanvasDocumentScope} from './document-scope';
import type {CanvasNativeKind} from './native-node-records';

// The five existing full-screen native editors. Video keeps its selected-node dock.
export type CanvasNativeEditorKind=Exclude<CanvasNativeKind,'video'|'comfy'>;
export type CanvasNativeEditorHandle={
  id:string;kind:CanvasNativeEditorKind;key:string;scope:CanvasDocumentScope;
  current:()=>boolean;assertCurrent:()=>void;close:()=>boolean;
};
export type CanvasNativeEditorSnapshot=Readonly<Partial<Record<CanvasNativeEditorKind,CanvasNativeEditorHandle>>>;
export type CanvasNativeEditorCatalogue=Record<CanvasNativeEditorKind,{
  ready:boolean;nodes:readonly {id:string;projectKey:string;deletedAt?:string|null}[];
}>;
export const EMPTY_NATIVE_EDITORS:CanvasNativeEditorSnapshot={};
type Intent={source:CanvasDocumentScope;kind:CanvasNativeEditorKind;id:string;project:string|null};
type Ports={focus:(project:string|null,id:string)=>void};

/** Owns view sessions only: no node copies, draft persistence, saves or jobs.
 * Each existing panel remains independent. Its close/action callbacks belong
 * to that exact open session, not to whichever panel happens to be open later.
 * New-node navigation may hand an intent to its immediately following view;
 * account/workspace epochs and intervening navigation never inherit it. */
export function createCanvasNativeEditorSession(ports:()=>Ports){
  let active:ReturnType<typeof binding>|undefined,mounted=true,sequence=0;
  let intents:Intent[]=[];
  function binding(scope:CanvasDocumentScope){
    let snapshot:CanvasNativeEditorSnapshot=EMPTY_NATIVE_EDITORS;
    const listeners=new Set<()=>void>(),live=()=>mounted&&active?.view===view&&scope.viewCurrent();
    const publish=(next:CanvasNativeEditorSnapshot)=>{snapshot=next;for(const listener of listeners)listener();};
    const attach=(kind:CanvasNativeEditorKind,id:string)=>{
      if(snapshot[kind]?.id===id)return;
      const current=()=>live()&&snapshot[kind]===handle;
      const handle:CanvasNativeEditorHandle={id,kind,scope,key:`${scope.key}:${++sequence}`,
        current,assertCurrent(){scope.assertView();if(!current())throw new Error('编辑器已关闭，请重新打开');},
        close(){if(!current())return false;const next={...snapshot};delete next[kind];publish(next);return true;},
      };
      publish({...snapshot,[kind]:handle});
    };
    const view={scope,getSnapshot:()=>snapshot,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
      open(kind:CanvasNativeEditorKind,id:string,project:string|null=scope.project){
        if(!live())return false;
        intents=intents.filter(intent=>intent.kind!==kind);
        if(project===scope.project)attach(kind,id);
        else intents.push({source:scope,kind,id,project});
        ports().focus(project,id);return true;
      },
      reconcile(catalogue:CanvasNativeEditorCatalogue){
        if(!live())return;
        for(const kind of Object.keys(snapshot) as CanvasNativeEditorKind[]){
          const handle=snapshot[kind]!,store=catalogue[kind];
          // A failed/incomplete read is not authoritative evidence of deletion.
          if(store.ready&&!store.nodes.some(node=>node.id===handle.id&&node.projectKey===scope.project&&!node.deletedAt))handle.close();
        }
      },
    };
    return {view,attach};
  }
  return {
    bind(scope:CanvasDocumentScope){
      if(active?.view.scope===scope)return active.view;
      const pending=intents;intents=[];active=binding(scope);
      for(const intent of pending)if(intent.source.documentCurrent()&&intent.source.account===scope.account&&intent.source.workspace===scope.workspace&&intent.project===scope.project)active.attach(intent.kind,intent.id);
      return active.view;
    },
    mount(value:boolean){mounted=value;if(!value)intents=[];},
  };
}
export type CanvasNativeEditorBinding=ReturnType<ReturnType<typeof createCanvasNativeEditorSession>['bind']>;
