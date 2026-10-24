import { browserRandomUUID } from "../browser-crypto";
import type { CanvasVideoNode } from "./video-node-schema";
import type { CanvasHistoryOperation } from "./history-contract";
import { canvasHistoryProject, canvasHistoryScope, compileCanvasHistory, type CanvasHistoryAction } from "./history-model";
import { postCanvasHistory, type CanvasHistoryScope } from "./history-scope";

type Attempt = { undo: boolean; operationId: string; operations: CanvasHistoryOperation[] };
export type HistoryCommit = {action: CanvasHistoryAction; undo: boolean; operations: CanvasHistoryOperation[]; persisted: boolean};
type Services = {
  changed: () => void; readOnly: () => boolean;
  flush: (action: CanvasHistoryAction) => Promise<unknown>; video: (id: string) => CanvasVideoNode | undefined;
  transaction: <T>(scope:CanvasHistoryScope,work:()=>Promise<T>)=>Promise<T>;
  commit: (scope: CanvasHistoryScope, value: HistoryCommit) => void;
  pending: (scope: CanvasHistoryScope, action: Extract<CanvasHistoryAction,{kind:"pending-link"}>, undo: boolean) => void;
  refresh: () => Promise<unknown>; warning: (message: string) => void;
};

/** Owns history identity, retry bodies, commit/refresh ordering and scoped stacks.
 * No React setters, project navigation, supplier calls or parallel persistence API. */
export function createCanvasHistoryController(services: Services) {
  let undo: CanvasHistoryAction[] = [], redo: CanvasHistoryAction[] = [];
  const scopes = new WeakMap<CanvasHistoryAction,string>(), attempts = new WeakMap<CanvasHistoryAction,Attempt>();
  const flights = new WeakMap<CanvasHistoryAction,{undo:boolean;promise:Promise<HistoryCommit>}>();
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
  const apply = (scope: CanvasHistoryScope, action: CanvasHistoryAction, reverse: boolean, initialRevision?: number): Promise<HistoryCommit> => {
    const running = flights.get(action);
    if (running) return running.undo === reverse ? running.promise : Promise.reject(new Error("原画布操作仍在保存"));
    const execute = async () => {
      scope.assertView(); if (services.readOnly()) throw new Error("当前画布为只读");
      if (action.kind === "pending-link") {
        services.pending(scope,action,reverse); return {action,undo:reverse,operations:[],persisted:false};
      }
      const value = await services.transaction(scope,async()=>{
        await services.flush(action); scope.assertView();
        // Replay before inspecting current nodes: a successful response may have
        // been lost, while the server revision/result has already advanced.
        let attempt = attempts.get(action);
        if (attempt && attempt.undo !== reverse) throw new Error("请先核实原画布操作");
        if (!attempt) {
          attempt = {undo:reverse,operationId:browserRandomUUID(),operations:structuredClone(compileCanvasHistory(action,reverse,services.video,initialRevision))};
          attempts.set(action,attempt);
        }
        const response = await postCanvasHistory(scope,{operationId:attempt.operationId,operations:attempt.operations});
        const value = {action,undo:reverse,operations:attempt.operations,persisted:response.persisted};
        attempts.delete(action);
        // A scoped document owner can acknowledge its own durable drafts after
        // navigation. UI adapters still guard all current-view React writes.
        try { services.commit(scope,value); }
        catch { if (scope.viewCurrent()) services.warning("修改已保存，画布显示待同步"); }
        return value;
      });
      if (scope.documentCurrent()) {
        if (value.operations.some(op => op.type.startsWith("video-"))) {
          try { await services.refresh(); }
          catch { if (scope.viewCurrent()) services.warning("修改已保存，视频显示待同步"); }
        }
      }
      return value;
    };
    const promise = execute().finally(() => flights.delete(action));
    flights.set(action,{undo:reverse,promise}); return promise;
  };
  const step = async (scope: CanvasHistoryScope, reverse: boolean) => {
    if (!scope.viewCurrent() || services.readOnly() || busy.current) return;
    const actions = list(scope)[reverse?"undo":"redo"], action = actions.at(-1); if (!action) return;
    setBusy(true);
    try {
      await apply(scope,action,reverse);
      if (reverse) { undo = undo.filter(a => a !== action); redo = [...redo,action]; }
      else { redo = redo.filter(a => a !== action); undo = [...undo,action]; }
    } catch (error) { if (scope.viewCurrent()) services.warning(error instanceof Error ? error.message : "画布保存失败"); }
    finally { setBusy(false); }
  };
  return {list,push,apply,step,busy,setBusy};
}
