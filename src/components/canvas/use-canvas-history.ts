"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { Artwork } from "@/lib/mock-data";
import type { CanvasNodeSettings } from "@/lib/canvas/node-settings";
import type { CanvasVideoNode } from "@/lib/canvas/video-node-schema";
import { currentWorkspaceRevision, WORKSPACE_SELECTION } from "@/lib/saas/workspace-client";
import { createCanvasHistoryContext } from "@/lib/canvas/history-scope";
import { createCanvasHistoryController, type HistoryCommit } from "@/lib/canvas/history-controller";
import { reduceHistoryArtworks, reduceHistorySettings, reduceHistoryTexts, type CanvasHistoryAction, type CanvasTextNode } from "@/lib/canvas/history-model";

type Input = {
  account: string; project: string | null; readOnly: boolean;
  works: Dispatch<SetStateAction<Artwork[] | null>>; texts: Dispatch<SetStateAction<CanvasTextNode[]>>;
  settings: (update: (current: Record<string,CanvasNodeSettings>) => Record<string,CanvasNodeSettings>, persisted: boolean) => void;
  selectedText: Dispatch<SetStateAction<string | null>>;
  flush: () => Promise<unknown>; video: (id: string) => CanvasVideoNode | undefined; refresh: () => Promise<unknown>;
  pending: (action: Extract<CanvasHistoryAction,{kind:"pending-link"}>, undo: boolean) => void;
  applied: (value: HistoryCommit) => void; warning: (message: string) => void;
  drafts: Map<string,CanvasTextNode>; draftsChanged: () => void;
};
const subscribeWorkspace = (notify: () => void) => { window.addEventListener(WORKSPACE_SELECTION,notify); return () => window.removeEventListener(WORKSPACE_SELECTION,notify); };

/** Thin React adapter: controllers own persistence/history; reducers own node
 * changes. React owns presentation/navigation only, not request compilation. */
export function useCanvasHistory(input: Input) {
  const latest = useRef(input); latest.current = input;
  const [,render] = useState(0), mounted = useRef(true);
  const draftBaselines = useRef(new WeakMap<CanvasHistoryAction,Map<string,CanvasTextNode>>());
  const context = useRef<ReturnType<typeof createCanvasHistoryContext> | null>(null);
  if (!context.current) context.current = createCanvasHistoryContext();
  useSyncExternalStore(subscribeWorkspace,currentWorkspaceRevision,() => 0);
  const scope = context.current.render(input.account,input.project);
  const controller = useRef<ReturnType<typeof createCanvasHistoryController> | null>(null);
  if (!controller.current) controller.current = createCanvasHistoryController({
    changed: () => { if (mounted.current) render(n => n + 1); },
    readOnly: () => latest.current.readOnly,
    flush: async action => {
      await latest.current.flush();
      if (!draftBaselines.current.has(action)) draftBaselines.current.set(action,new Map(latest.current.drafts));
    }, video: id => latest.current.video(id), refresh: () => latest.current.refresh(),
    warning: message => latest.current.warning(message),
    pending: (scope,action,undo) => { scope.assertView(); latest.current.pending(action,undo); },
    commit: (scope,value) => {
      const {action,undo,operations,persisted} = value;
      const baseline = draftBaselines.current.get(action);
      const newerDraft = (id: string) => latest.current.drafts.has(id) && latest.current.drafts.get(id) !== baseline?.get(id);
      const protectedTexts = new Set(Array.from(latest.current.drafts.keys()).filter(newerDraft));
      // Check in deferred React updater bodies too, not just before enqueueing.
      latest.current.works(nodes => scope.documentCurrent() ? reduceHistoryArtworks(nodes,operations,action,undo) : nodes);
      latest.current.texts(nodes => scope.documentCurrent() ? reduceHistoryTexts(nodes,operations.filter(op =>
        !(op.type === "text-patch" || op.type === "position" && op.text) || !protectedTexts.has(op.id) && !newerDraft(op.id))) : nodes);
      if (operations.some(op => op.type === "node-settings")) latest.current.settings(nodes => scope.documentCurrent() ? reduceHistorySettings(nodes,operations) : nodes,persisted);
      const deleted = new Set(operations.flatMap(op => op.type === "text-delete" ? [op.id] : []));
      if (deleted.size) latest.current.selectedText(id => scope.viewCurrent() && id && deleted.has(id) ? null : id);
      for (const op of operations) {
        const id = op.type === "text-restore" ? op.node.id : op.id;
        if (!newerDraft(id)) latest.current.drafts.delete(id);
      }
      draftBaselines.current.delete(action); latest.current.draftsChanged();
      if (scope.viewCurrent()) latest.current.applied(value);
    },
  });
  useEffect(() => { mounted.current = true; context.current!.mount(true); return () => { mounted.current = false; context.current!.mount(false); }; },[]);
  const owner = controller.current;
  // Keep originating callbacks across awaited work; each render-bound scope
  // retains its epoch even if the user navigates A -> B -> A.
  const pushUndo = useCallback((action: CanvasHistoryAction) => owner.push(scope,action),[owner,scope]);
  const lists = owner.list(scope);
  return {undoStack:lists.undo,redoStack:lists.redo,pushUndo,historySaving:owner.busy.current,historyBusyRef:owner.busy,
    setHistorySaving:owner.setBusy,applyHistory:(action: CanvasHistoryAction,undo: boolean,revision?:number) => owner.apply(scope,action,undo,revision),
    doUndo:() => owner.step(scope,true),doRedo:() => owner.step(scope,false),historyCurrent:scope.viewCurrent};
}
