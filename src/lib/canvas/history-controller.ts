import {isCanvasNativeOperation,type CanvasNativeRecords} from "./native-node-records";
import type {CanvasTimelineNode} from "./timeline-node-schema";
import type {CanvasAudioNode} from "./audio-node-schema";
import type {Artwork} from "../mock-data";
import type {CanvasSceneNode} from "./scene-node-schema";
import type {CanvasCharacterNode} from "./character-node-schema";
import { browserRandomUUID } from "../browser-crypto";
import type {CanvasDirectorNode} from "./director-node-schema";
import type { CanvasVideoNode } from "./video-node-schema";
import type { CanvasHistoryOperation } from "./history-contract";
import { canvasHistoryProject, canvasHistoryScope, compileCanvasHistory, type CanvasHistoryAction } from "./history-model";
import { canvasHistoryFailureMessage,CanvasHistoryRequestError, postCanvasHistory, type CanvasHistoryScope } from "./history-scope";
import type {CanvasLocalHistoryAction} from "./node-commands";

type Attempt = { undo: boolean; operationId: string; operations: CanvasHistoryOperation[] };
export type HistoryCommit = {nativeNodes?:CanvasNativeRecords;artworkNodes?:import("./artwork-write").CanvasArtworkReceipt[];artworkIds?:string[];action: CanvasHistoryAction; undo: boolean; operations: CanvasHistoryOperation[]; persisted: boolean; initial?:boolean;textNodes?:import("./text-document-model").CanvasTextNode[]};
type Services = {
  changed: () => void; readOnly: () => boolean;
  flush: () => Promise<unknown>; video: (id: string) => CanvasVideoNode | undefined;director?:(id:string)=>CanvasDirectorNode|undefined;character?:(id:string)=>CanvasCharacterNode|undefined;scene?:(id:string)=>CanvasSceneNode|undefined;artwork?:(id:string)=>Artwork|undefined;audio?:(id:string)=>CanvasAudioNode|undefined;timeline?:(id:string)=>CanvasTimelineNode|undefined;
  transaction: <T>(scope:CanvasHistoryScope,work:()=>Promise<T>)=>Promise<T>;
  commit: (scope: CanvasHistoryScope, value: HistoryCommit) => void;
  pending: (scope: CanvasHistoryScope, action: CanvasLocalHistoryAction, undo: boolean,checkOnly?:boolean) => void;
  conflict?:(scope:CanvasHistoryScope,value:NonNullable<CanvasHistoryRequestError["conflict"]>)=>void;
  artworkConflict?:(scope:CanvasHistoryScope,value:NonNullable<CanvasHistoryRequestError["artworkConflict"]>,action:CanvasHistoryAction,undo:boolean)=>void;
  refresh: () => Promise<unknown>; warning: (message: string) => void;
};

/** Owns history identity, retry bodies, commit/refresh ordering and scoped stacks.
 * No React setters, project navigation, supplier calls or parallel persistence API. */
export function createCanvasHistoryController(services: Services) {
  let undo: CanvasHistoryAction[] = [], redo: CanvasHistoryAction[] = [];
  const scopes = new WeakMap<CanvasHistoryAction,string>(), attempts = new WeakMap<CanvasHistoryAction,Attempt>();
  const flights = new WeakMap<CanvasHistoryAction,{undo:boolean;promise:Promise<HistoryCommit>}>();
  const queuedFlights = new WeakMap<CanvasHistoryAction,{undo:boolean;promise:Promise<HistoryCommit>}>();
  const commands = new Map<string,{action:CanvasHistoryAction;scope:CanvasHistoryScope;record?:boolean}>(), queues = new Map<string,Promise<unknown>>();
  const busy = {current:false};
  const list = (scope: CanvasHistoryScope) => ({undo:undo.filter(a => scopes.get(a) === scope.key),redo:redo.filter(a => scopes.get(a) === scope.key)});
  const push = (scope: CanvasHistoryScope, action: CanvasHistoryAction) => {
    if (undo.includes(action)) return;
    const key = scope.project ? scope.key : canvasHistoryScope(scope.account,scope.workspace,canvasHistoryProject(action) || null);
    scopes.set(action,key);
    undo = [...undo.filter(a => scopes.get(a) !== key).slice(-450),...undo.filter(a => scopes.get(a) === key).slice(-49),action];
    redo = redo.filter(a => scopes.get(a) !== key); services.changed();
  };
  const setBusy = (value: boolean) => { busy.current = value; services.changed(); };
  const applyRaw = (scope: CanvasHistoryScope, action: CanvasHistoryAction, reverse: boolean, initialRevision?: number): Promise<HistoryCommit> => {
    const running = flights.get(action);
    if (running) return running.undo === reverse ? running.promise : Promise.reject(new Error("原画布操作仍在保存"));
    const execute = async () => {
      scope.assertView(); if (services.readOnly()) throw new Error("当前画布为只读");
      if (action.kind === "pending-link"||action.kind==="pending-add"||action.kind==="local-delete") {
        services.pending(scope,action,reverse);const value={action,undo:reverse,operations:[],persisted:false};services.commit(scope,value);return value;
      }
      const value = await services.transaction(scope,async()=>{
        await services.flush(); scope.assertView();
        if(action.kind==="mixed-delete"&&!attempts.has(action))services.pending(scope,action,reverse,true);
        // Replay before inspecting current nodes: a successful response may have
        // been lost, while the server revision/result has already advanced.
        let attempt = attempts.get(action);
        if (attempt && attempt.undo !== reverse) throw new Error("请先核实原画布操作");
        if (!attempt) {
          attempt = {undo:reverse,operationId:browserRandomUUID(),operations:structuredClone(compileCanvasHistory(action,reverse,services.video,initialRevision,services.director,services.character,services.scene,services.artwork,services.audio,services.timeline))};
          attempts.set(action,attempt);
        }
        let response;
        try{response=await postCanvasHistory(scope,{operationId:attempt.operationId,operations:attempt.operations});}
        catch(error){if(error instanceof CanvasHistoryRequestError&&error.conflict){attempts.delete(action);services.conflict?.(scope,error.conflict);}if(error instanceof CanvasHistoryRequestError&&error.artworkConflict){attempts.delete(action);services.artworkConflict?.(scope,error.artworkConflict,action,reverse);}throw error;}
        const value = {action,undo:reverse,operations:attempt.operations,nativeNodes:response.nativeNodes,artworkNodes:response.artworkNodes,artworkIds:response.artworkIds,persisted:response.persisted,textNodes:response.textNodes};
        attempts.delete(action);delete action.artworkBases;
        // A scoped document owner can acknowledge its own durable drafts after
        // navigation. UI adapters still guard all current-view React writes.
        try { services.commit(scope,value); }
        catch { if (scope.viewCurrent()) services.warning("修改已保存，画布显示待同步"); }
        return value;
      });
      if (scope.documentCurrent()) {
        if (!value.nativeNodes && value.operations.some(isCanvasNativeOperation)) {
          try { await services.refresh(); }
          catch { if (scope.viewCurrent()) services.warning("修改已保存，视频显示待同步"); }
        }
      }
      return value;
    };
    const promise = execute().finally(() => flights.delete(action));
    flights.set(action,{undo:reverse,promise}); return promise;
  };
  // Interactive edits share the existing history attempt, not another HTTP
  // writer. An unknown response is resumed before the next edit/undo; a known
  // rejection never becomes an undo entry. The original action/body is retained.
  const resume = async (scope:CanvasHistoryScope) => {
    const pending=commands.get(scope.key);if(!pending)return;
    if(!pending.scope.documentCurrent()){commands.delete(scope.key);return;}
    const {action}=pending;
    try { await applyRaw(scope,action,false);if(pending.record!==false)push(scope,action);commands.delete(scope.key); }
    catch(error){
      if(!attempts.has(action)||error instanceof CanvasHistoryRequestError&&error.status>=400&&error.status<500)commands.delete(scope.key);
      throw error;
    }
  };
  const serialize = <T>(scope:CanvasHistoryScope,work:()=>Promise<T>):Promise<T> => {
    const previous=queues.get(scope.key)||Promise.resolve();
    const run=previous.catch(()=>{}).then(work);queues.set(scope.key,run);
    return run.finally(()=>{if(queues.get(scope.key)===run)queues.delete(scope.key);});
  };
  const submit = (scope:CanvasHistoryScope,prepare:()=>CanvasHistoryAction|null,record=true) => serialize(scope,async()=>{
    scope.assertView();await resume(scope);scope.assertView();
    const action=prepare();if(!action)return false;
    commands.set(scope.key,{action,scope,record});await resume(scope);return true;
  });
  const transaction=<T>(scope:CanvasHistoryScope,work:()=>Promise<T>):Promise<T>=>serialize(scope,async()=>{
    scope.assertView();await resume(scope);
    return services.transaction(scope,async()=>{await services.flush();scope.assertView();if(services.readOnly())throw new Error("当前画布为只读");return work();});
  });
  const acknowledge=(scope:CanvasHistoryScope,action:CanvasHistoryAction,persisted:boolean,receipt?:Pick<HistoryCommit,"artworkNodes"|"artworkIds">)=>{
    const operations=compileCanvasHistory(action,false,services.video);
    services.commit(scope,{action,undo:false,operations,persisted,initial:true,...receipt});
  };
  // Existing properties/layout callers also drain earlier gestures. Otherwise a
  // later successful layout could be overwritten locally by an older receipt.
  const apply = (scope:CanvasHistoryScope,action:CanvasHistoryAction,reverse:boolean,revision?:number):Promise<HistoryCommit>=>{
    const running=queuedFlights.get(action);
    if(running)return running.undo===reverse?running.promise:Promise.reject(new Error("原画布操作仍在保存"));
    const promise=serialize(scope,async()=>{scope.assertView();await resume(scope);return applyRaw(scope,action,reverse,revision);}).finally(()=>queuedFlights.delete(action));
    queuedFlights.set(action,{undo:reverse,promise});return promise;
  };
  const step = async (scope: CanvasHistoryScope, reverse: boolean) => {
    if (!scope.viewCurrent() || services.readOnly() || busy.current) return;
    setBusy(true);
    try {
      await serialize(scope,async()=>{
        await resume(scope);scope.assertView();
        const actions = list(scope)[reverse?"undo":"redo"], action = actions.at(-1); if (!action) return;
        await applyRaw(scope,action,reverse);
        if (reverse) { undo = undo.filter(a => a !== action); redo = [...redo,action]; }
        else { redo = redo.filter(a => a !== action); undo = [...undo,action]; }
      });
    } catch (error) { if (scope.viewCurrent()) services.warning(canvasHistoryFailureMessage(error)); }
    finally { setBusy(false); }
  };
  const discard=(action:CanvasHistoryAction)=>{undo=undo.filter(a=>a!==action);redo=redo.filter(a=>a!==action);attempts.delete(action);services.changed();};
  const consumePending=(scope:CanvasHistoryScope,id:string)=>{
    const prune=(stack:CanvasHistoryAction[])=>stack.flatMap(action=>{
      if(scopes.get(action)!==scope.key)return [action];
      if(action.kind==="pending-link"&&action.id===id)return [];
      if(action.kind!=="pending-add"||!action.records.some(node=>node.id===id))return [action];
      const records=action.records.filter(node=>node.id!==id);if(!records.length)return [];
      const next={...action,records};scopes.set(next,scope.key);return [next];
    });
    undo=prune(undo);redo=prune(redo);services.changed();
  };
  return {consumePending,discard,list,push,apply,submit,transaction,acknowledge,step,busy,setBusy};
}
