import {defaultNodeSettings,validNodeSettings,type CanvasNodeSettings} from './node-settings';
import type {CanvasDocumentScope} from './document-scope';
import type {CanvasHistoryAction} from './history-model';
import type {CanvasNativeKind} from './native-node-records';

type Settings=Record<string,CanvasNodeSettings>;
export type NodePreferenceChange=CanvasNodeSettings|'toggle-lock'|'front'|'back';
function preferenceTarget(change:NodePreferenceChange,from:CanvasNodeSettings,all:Settings){
  if(typeof change!=='string')return change;
  if(change==='toggle-lock')return{...from,locked:!from.locked};
  const orders=Object.values(all).map(value=>value.order);
  return{...from,order:change==='front'?Math.min(100000,Math.max(0,...orders)+1):Math.max(-100000,Math.min(0,...orders)-1)};
}
type Snapshot={settings:Settings;ready:boolean;error:string;saving:boolean};
export const EMPTY_NODE_PREFERENCES:Snapshot={settings:{},ready:false,error:'',saving:false};
export type NodePreferenceReadPorts={
  read:()=>Promise<{persisted:boolean;settings:unknown}>;
  local:{read:()=>unknown;write:(settings:Settings)=>void};
  failed:string;notice:(message:string)=>void;
};
export type NodePreferenceCommitPorts={
  writable:()=>boolean;kinds:(id:string)=>Record<CanvasNativeKind,boolean>;
  history:{scope:CanvasDocumentScope;historyBusyRef:{current:boolean};setHistorySaving:(value:boolean)=>void;
    submit:(scope:CanvasDocumentScope,prepare:()=>CanvasHistoryAction|null)=>Promise<unknown>};
  notice:(message:string)=>void;failed:string;
};
type Bucket={scope:CanvasDocumentScope;snapshot:Snapshot;listeners:Set<()=>void>;read:number;flight?:Promise<void>;revision:number;changes:Map<string,number>};
const normalize=(raw:unknown):Settings=>Object.fromEntries(Object.entries(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}).map(([id,value])=>[id,validNodeSettings(value)]));
const defaults=defaultNodeSettings();

/** Owns preference reads/projection, not persistence transactions or undo.
 * All writes use the existing shared history, including its unknown receipts. */
export function createCanvasNodePreferences(){
  const buckets=new Map<string,Bucket>();
  return{bind(scope:CanvasDocumentScope,owner:string,ports:NodePreferenceReadPorts){
    const key=JSON.stringify([scope.account,scope.workspace,owner.toLowerCase()]);
    let bucket=buckets.get(key);
    if(!bucket||!bucket.scope.documentCurrent()){
      bucket={scope,snapshot:EMPTY_NODE_PREFERENCES,listeners:new Set(),read:0,revision:0,changes:new Map()};buckets.set(key,bucket);
    }
    const state=bucket,current=()=>scope.documentCurrent()&&state.scope.documentCurrent();
    const publish=(patch:Partial<Snapshot>)=>{state.snapshot={...state.snapshot,...patch};for(const listener of state.listeners)listener();};
    const update=(next:Settings)=>{
      const previous=state.snapshot.settings;if(previous===next)return;
      for(const id of new Set([...Object.keys(previous),...Object.keys(next)]))if(previous[id]!==next[id])state.changes.set(id,++state.revision);
      publish({settings:next});
    };
    const get=(id:string)=>state.snapshot.settings[id]||defaults;
    return{
      identity:state,
      getSnapshot:()=>state.snapshot,subscribe(listener:()=>void){state.listeners.add(listener);return()=>{state.listeners.delete(listener);};},
      get,locked:(id:string)=>get(id).locked,
      apply(change:(settings:Settings)=>Settings,persisted:boolean){
        if(!current())return;const next=change(state.snapshot.settings);update(next);
        if(!persisted&&current())try{ports.local.write(next);}catch{/* original local fallback remains best effort */}
      },
      accept(settings:Settings){if(current())update({...state.snapshot.settings,...normalize(settings)});},
      load(){
        if(!owner||!current())return Promise.resolve();if(state.flight)return state.flight;
        const ticket=++state.read,revision=state.revision;publish({ready:false,error:''});
        const run=async()=>{
          try{
            const result=await ports.read();if(!current()||ticket!==state.read)return;
            const next=normalize(result.persisted?result.settings:ports.local.read());
            // Copy/history receipts acknowledged after this read began remain
            // authoritative locally; a slow initial response cannot undo them.
            for(const [id,changed]of state.changes)if(changed>revision){if(state.snapshot.settings[id])next[id]=state.snapshot.settings[id];else delete next[id];}
            publish({settings:next,ready:true,error:''});
          }catch{if(current()&&ticket===state.read){publish({ready:false,error:ports.failed});ports.notice(ports.failed);}}
        };
        const flight=run().finally(()=>{if(state.flight===flight)state.flight=undefined;});state.flight=flight;return flight;
      },
      async commit(id:string,to:NodePreferenceChange,commit:NodePreferenceCommitPorts){
        const history=commit.history,target=history.scope;
        if(!current()||!scope.viewCurrent()||!target.viewCurrent()||!commit.writable()||!state.snapshot.ready||state.snapshot.saving||history.historyBusyRef.current)return false;
        publish({saving:true});history.historyBusyRef.current=true;history.setHistorySaving(true);
        try{
          await history.submit(target,()=>{
            target.assertView();if(!current()||!commit.writable())return null;
            const from=get(id),next=preferenceTarget(to,from,state.snapshot.settings);
            if(JSON.stringify(from)===JSON.stringify(next))return null;
            return{kind:'node-settings',id,text:id.startsWith('text-'),...commit.kinds(id),from,to:next};
          });
          return true;
        }catch(error){if(current()&&target.viewCurrent())commit.notice(error instanceof Error?error.message:commit.failed);return false;}
        finally{publish({saving:false});history.historyBusyRef.current=false;history.setHistorySaving(false);}
      },
    };
  }};
}
