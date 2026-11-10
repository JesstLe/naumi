"use client";
import {ImageMappingEditor} from "./image-mapping-editor";
import type {Operation,State} from "./contracts";
import {registeredEditor,type EditorState} from "./editor-state";
import {Dialog} from "./dialog";
import styles from "./model-management.module.css";
import {PriceDialog} from "./pricing-dialog";
import {OrderDialog,ScopeDialog,RenameDialog} from "./presentation-dialogs";
import {ParametersDialog,ResolutionsDialog} from "./image-parameter-dialogs";
import {SwitchDialog} from "./switch-dialog";
import {ConnectDialog,RegisterDialog} from "./source-dialogs";
import {ChannelsDialog} from "./channels-dialog";
import {VideoParametersDialog} from "./video-parameters-dialog";
import {VideoCapabilityUpgrade} from "./video-capability-upgrade";
import {ImagegenRoutesEditor} from "./imagegen-routes-editor";

/** Composition only: each editor owns and validates its existing local draft. */
export function ModelEditor({editor,state,locked,busy,error,refreshing,onRefresh,onChange,operation,onPublish}:{
  editor:EditorState|null;state:State;locked:boolean;busy:boolean;error:string;refreshing:string[];
  onRefresh:(id:string)=>void;onChange:(editor:EditorState|null)=>void;
  operation:(action:string,fields:Record<string,unknown>)=>Operation;onPublish:(operation:Operation)=>Promise<void>;
}) {
  if(!editor) return null;
  const close=()=>onChange(null);
  switch(editor.kind){
    case "video-upgrade":return <VideoCapabilityUpgrade locked={locked} error={error} onClose={close} onApply={review=>void onPublish({...operation("video-capability-upgrade",{reviewDigest:review.reviewDigest,publicIds:review.publicIds}),expectedVersion:review.version})}/>;
    case "switch":return <SwitchDialog row={state.rows.find(row=>row.id===editor.row.id)||editor.row} state={state} initialProvider={editor.initialProvider} refreshing={refreshing} locked={locked} busy={busy} onRefresh={onRefresh} onRegister={(providerId,model)=>onChange({kind:"register",providerId,model,returnTo:{...editor,initialProvider:providerId}})} onClose={close} onSave={upstreamId=>void onPublish(operation("switch",{rowId:editor.row.id,upstreamId}))}/>;
    case "rename":return <RenameDialog row={editor.row} locked={locked} error={error} onClose={close} onSave={(publicId,label)=>void onPublish(operation("identity",{rowId:editor.row.id,publicId,label}))}/>;
    case "advanced":return <Dialog title="图像高级参数" locked={locked} onClose={close}><label className={styles.field}>前端模型<select value={editor.row.id} disabled={locked} onChange={e=>{const row=state.rows.find(row=>row.id===e.target.value);onChange(row?{kind:"advanced",row}:null);}}>{state.rows.filter(row=>row.modality==="image").map(row=><option key={row.id} value={row.id}>{row.label}</option>)}</select></label><ImagegenRoutesEditor key={editor.row.id} row={editor.row} locked={locked} onSave={routes=>void onPublish(operation("imagegen-parameters",{rowId:editor.row.id,routes}))}/></Dialog>;
    case "channels":return <ChannelsDialog row={state.rows.find(row=>row.id===editor.row.id)||editor.row} state={state} initial={editor.draft} refreshing={refreshing} locked={locked} error={error} onRefresh={onRefresh} onRegister={(providerId,model,draft)=>onChange({kind:"register",providerId,model,returnTo:{...editor,draft}})} onClose={close} onSave={policy=>void onPublish(operation("channels",{rowId:editor.row.id,policy}))}/>;
    case "mapping":return <Dialog title="统一参数映射" locked={locked} onClose={close}><ImageMappingEditor row={state.rows.find(row=>row.id===editor.row.id)||editor.row} locked={locked} error={error} onClose={close} onSave={mapping=>void onPublish(operation("image-mapping",{rowId:editor.row.id,mapping}))}/></Dialog>;
    case "resolution":return <ResolutionsDialog row={editor.row} locked={locked} error={error} onClose={close} onSave={(resolutions,parameters)=>void onPublish(operation("resolutions",{rowId:editor.row.id,resolutions,...(parameters!==undefined?{parameters}:{})}))}/>;
    case "parameters":return <ParametersDialog row={state.rows.find(row=>row.id===editor.row.id)||editor.row} locked={locked} error={error} onClose={close} onSave={parameters=>void onPublish(operation("parameters",{rowId:editor.row.id,parameters}))}/>;
    case "video":return <VideoParametersDialog row={editor.row} locked={locked} error={error} onClose={close} onSave={routes=>void onPublish(operation("video-parameters",{rowId:editor.row.id,routes}))}/>;
    case "order":return <OrderDialog rows={state.rows} locked={locked} error={error} onClose={close} onSave={rowIds=>void onPublish(operation("order",{rowIds}))}/>;
    case "scope":return <ScopeDialog row={editor.row} locked={locked} error={error} onClose={close} onSave={(features,canvas)=>void onPublish(operation("scope",{rowId:editor.row.id,features,...(canvas!==undefined?{canvas}:{})}))}/>;
    case "price":return <PriceDialog row={editor.row} locked={locked} error={error} onClose={close} onSave={(features,pricing)=>void onPublish(operation("pricing",{rowId:editor.row.id,features,pricing}))}/>;
    case "connect":return <ConnectDialog locked={locked} onClose={close} onSave={(fields,id)=>onPublish({...operation("connect",fields),id})}/>;
    case "register":return <RegisterDialog model={editor.model} protocol={state.providers.find(provider=>provider.id===editor.providerId)!.protocol} locked={locked} onClose={()=>onChange(registeredEditor(editor,state))} onSave={fields=>void onPublish(operation("register",{providerId:editor.providerId,model:editor.model,...fields}))}/>;
  }
}
