import type {ManagedModelRow} from "@/lib/model-config/management";
import type {ChannelPolicy} from "@/lib/model-config/channel-policy";
import type {State} from "./contracts";

type SwitchEditor = {kind:"switch"; row:ManagedModelRow; initialProvider:string};
type ChannelsEditor = {kind:"channels"; row:ManagedModelRow; draft:ChannelPolicy|null};
type ReturnEditor = SwitchEditor | ChannelsEditor;
export type EditorState = ReturnEditor
  | {kind:"rename"|"mapping"|"advanced"|"resolution"|"parameters"|"video"|"scope"|"price"; row:ManagedModelRow}
  | {kind:"order"|"connect"|"video-upgrade"}
  | {kind:"register";providerId:string;model:string;returnTo?:ReturnEditor};

/** One active editor, with only routing drafts carried across registration. */
export function dispatchedEditor(editor:EditorState|null):EditorState|null {
  return editor && ["switch","rename","connect","register","advanced","video-upgrade"].includes(editor.kind) ? null : editor;
}

export function registeredEditor(editor:EditorState|null,state:State):ReturnEditor|null {
  if(editor?.kind!=="register" || !editor.returnTo) return null;
  const row=state.rows.find(row=>row.id===editor.returnTo!.row.id);
  return row ? {...editor.returnTo,row} : null;
}
