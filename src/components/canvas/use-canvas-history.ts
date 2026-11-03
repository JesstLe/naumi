"use client";
import type {CanvasTimelineNode} from "@/lib/canvas/timeline-node-schema";
import type {CanvasAudioNode} from "@/lib/canvas/audio-node-schema";
import type {CanvasSceneNode} from "@/lib/canvas/scene-node-schema";
import type {CanvasCharacterNode} from "@/lib/canvas/character-node-schema";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { Artwork } from "@/lib/mock-data";
import type { CanvasNodeSettings } from "@/lib/canvas/node-settings";
import type {CanvasDirectorNode} from "@/lib/canvas/director-node-schema";
import type { CanvasVideoNode } from "@/lib/canvas/video-node-schema";
import { currentWorkspaceRevision, WORKSPACE_SELECTION } from "@/lib/saas/workspace-client";
import { createCanvasDocumentContext } from "@/lib/canvas/document-scope";
import type { CanvasTextHistoryPort } from "@/lib/canvas/text-document";
import { createCanvasHistoryController, type HistoryCommit } from "@/lib/canvas/history-controller";
import { reduceHistoryArtworks, reduceHistorySettings, type CanvasHistoryAction } from "@/lib/canvas/history-model";
import type {CanvasLocalHistoryAction} from "@/lib/canvas/node-commands";

type Input = {
  native?:{accept:(receipt:import("@/lib/canvas/native-node-records").CanvasNativeRecords,current:()=>boolean)=>void};
  account: string; project: string | null; readOnly: boolean;
  validateOperations?:(operations:import("@/lib/canvas/history-contract").CanvasHistoryOperation[])=>void;
  artworkDocument?:import("@/lib/canvas/artwork-document").CanvasArtworkHistoryPort;
  works: Dispatch<SetStateAction<Artwork[] | null>>; textDocument: CanvasTextHistoryPort;
  settings: (update: (current: Record<string,CanvasNodeSettings>) => Record<string,CanvasNodeSettings>, persisted: boolean) => void;
  selectedText: Dispatch<SetStateAction<string | null>>;
  flush: () => Promise<unknown>; video: (id: string) => CanvasVideoNode | undefined;director?:(id:string)=>CanvasDirectorNode|undefined;character?:(id:string)=>CanvasCharacterNode|undefined;scene?:(id:string)=>CanvasSceneNode|undefined;artwork?:(id:string)=>Artwork|undefined;audio?:(id:string)=>CanvasAudioNode|undefined;timeline?:(id:string)=>CanvasTimelineNode|undefined; refresh: () => Promise<unknown>;
  pending: (action:CanvasLocalHistoryAction,undo:boolean,checkOnly?:boolean,scope?:import("@/lib/canvas/document-scope").CanvasDocumentScope)=>void;
  applied: (value: HistoryCommit) => void; warning: (message: string) => void;
};
const subscribeWorkspace = (notify: () => void) => { window.addEventListener(WORKSPACE_SELECTION,notify); return () => window.removeEventListener(WORKSPACE_SELECTION,notify); };

/** Thin React adapter: controllers own persistence/history; reducers own node
 * changes. React owns presentation/navigation only, not request compilation. */
export function useCanvasHistory(input: Input) {
  const latest = useRef(input); latest.current = input;
  const [,render] = useState(0), mounted = useRef(true);
  const context = useRef<ReturnType<typeof createCanvasDocumentContext> | null>(null);
  if (!context.current) context.current = createCanvasDocumentContext();
  useSyncExternalStore(subscribeWorkspace,currentWorkspaceRevision,() => 0);
  const scope = context.current.render(input.account,input.project);
  const controller = useRef<ReturnType<typeof createCanvasHistoryController> | null>(null);
  if (!controller.current) controller.current = createCanvasHistoryController({
    changed: () => { if (mounted.current) render(n => n + 1); },
    readOnly: () => latest.current.readOnly,
    validateOperations:operations=>latest.current.validateOperations?.(operations),
    flush: () => latest.current.flush(), transaction: (scope,work) => latest.current.textDocument.transaction(scope,()=>latest.current.artworkDocument?latest.current.artworkDocument.transaction(scope,work):work()),
    video: id => latest.current.video(id),director:id=>latest.current.director?.(id),character:id=>latest.current.character?.(id),scene:id=>latest.current.scene?.(id),artwork:id=>latest.current.artwork?.(id),audio:id=>latest.current.audio?.(id),timeline:id=>latest.current.timeline?.(id), refresh: () => latest.current.refresh(),
    warning: message => latest.current.warning(message),
    conflict:(scope,value)=>latest.current.textDocument.conflict?.(scope,value),
    artworkConflict:(scope,value,action,undo)=>latest.current.artworkDocument?.conflict(scope,value,action,undo),
    pending: (scope,action,undo,checkOnly) => { scope.assertView(); latest.current.pending(action,undo,checkOnly,scope); },
    commit: (scope,value) => {
      const {action,undo,operations,persisted} = value;
      if(scope.documentCurrent()&&(action.kind==="mixed-delete"||value.initial&&(action.kind==="pending-add"||action.kind==="local-delete")))latest.current.pending(action,undo,false,scope);
      if(value.nativeNodes)latest.current.native?.accept(value.nativeNodes,scope.documentCurrent);
      latest.current.textDocument.applyHistory(scope,operations,value.textNodes);
      // Check in deferred React updater bodies too, not just before enqueueing.
      if(latest.current.artworkDocument)latest.current.artworkDocument.applyHistory(scope,value);else latest.current.works(nodes => scope.documentCurrent() ? reduceHistoryArtworks(nodes,operations,action,undo) : nodes);
      if (scope.documentCurrent() && operations.some(op => op.type === "node-settings")) latest.current.settings(nodes => scope.documentCurrent() ? reduceHistorySettings(nodes,operations) : nodes,persisted);
      const deleted = new Set(operations.flatMap(op => op.type === "text-delete" ? [op.id] : []));
      if (deleted.size) latest.current.selectedText(id => scope.viewCurrent() && id && deleted.has(id) ? null : id);
      if (scope.viewCurrent()&&!value.initial) latest.current.applied(value);
    },
  });
  useEffect(() => { mounted.current = true; context.current!.mount(true); return () => { mounted.current = false; context.current!.mount(false); }; },[]);
  const owner = controller.current;
  // Keep originating callbacks across awaited work; each render-bound scope
  // retains its epoch even if the user navigates A -> B -> A.
  const pushUndo = useCallback((action: CanvasHistoryAction) => owner.push(scope,action),[owner,scope]);
  const lists = owner.list(scope);
  return {scope,artworkConflict:(target:typeof scope,value:import("@/lib/canvas/artwork-write").CanvasArtworkConflict,action:CanvasHistoryAction)=>latest.current.artworkDocument?.conflict(target,value,action,false),conflict:(target:typeof scope,value:import("@/lib/canvas/text-document").TextDocumentConflict)=>latest.current.textDocument.conflict?.(target,value),record:(target:typeof scope,action:CanvasHistoryAction)=>owner.push(target,action),transaction:owner.transaction,acknowledge:owner.acknowledge,
    consumePending:(id:string)=>owner.consumePending(scope,id),
    discard:owner.discard,submit:(target:typeof scope,prepare:()=>CanvasHistoryAction|null,record=true)=>owner.submit(target,prepare,record),undoStack:lists.undo,redoStack:lists.redo,pushUndo,historySaving:owner.busy.current,historyBusyRef:owner.busy,
    setHistorySaving:owner.setBusy,applyHistory:(action: CanvasHistoryAction,undo: boolean,revision?:number) => owner.apply(scope,action,undo,revision),
    doUndo:() => owner.step(scope,true),doRedo:() => owner.step(scope,false),historyCurrent:scope.viewCurrent};
}
