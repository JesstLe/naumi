"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {Loader2,Plus,RefreshCw,Search} from "lucide-react";
import type {Operation} from "./contracts";
import {ModelMappingCard,ModelMappingHeader} from "./model-mapping-card";
import {useModelManagement} from "./use-model-management";
import {ModelEditor} from "./model-editor";
import {dispatchedEditor,registeredEditor,type EditorState} from "./editor-state";
import {WORKSPACE_VIEWS,workspaceLocation,workspaceView,type WorkspaceView} from "./workspace-navigation";
import {modelActions} from "./model-actions";
import {ModelDetail} from "./model-detail";
import {PricingWorkspace,RuntimeWorkspace,SupplierWorkspace} from "./workspace-panels";
import styles from "./workspace.module.css";

export function ModelManagement({initialView="models",initialModel=null}:{initialView?:WorkspaceView;initialModel?:string|null}={}) {
  const {state,error,setError,notice,loading,busy,pending,refreshing,refreshProvider,load,publish,operation,locked}=useModelManagement();
  const [tab,setTab]=useState<WorkspaceView>(initialView),[selectedId,setSelectedId]=useState<string|null>(initialModel);
  const [filter,setFilter]=useState("all"),[search,setSearch]=useState("");
  const [editor,setEditor]=useState<EditorState|null>(null);
  useEffect(()=>{const read=()=>{const query=new URLSearchParams(window.location.search);setTab(workspaceView(query.get("view")));setSelectedId(query.get("model"));};read();window.addEventListener("popstate",read);return()=>window.removeEventListener("popstate",read);},[]);
  function navigate(view:WorkspaceView,model?:string){setTab(view);setSelectedId(model||null);window.history.pushState(null,"",workspaceLocation(view,model));}
  function open(next:EditorState){if(locked)return;setError("");setEditor(next);}
  async function run(operation: Operation) {
    const refreshed=await publish(operation,{
      onDispatch:()=>{if(operation.action!=="identity")setEditor(dispatchedEditor);},
      onSettled:()=>setEditor(null),
    });
    if(operation.action==="register" && refreshed)setEditor(registeredEditor(editor,refreshed));
  }
  const rows=state?.rows.filter(row=>(filter==="all"||row.modality===filter)&&`${row.label} ${row.alias} ${row.routes.map(route=>`${route.model} ${route.provider}`).join(" ")} ${row.features.map(feature=>feature.label).join(" ")}`.toLowerCase().includes(search.toLowerCase()))||[];
  const selected=state?.rows.find(row=>row.id===selectedId);
  return <main className={styles.workspace}>
    <header className={styles.header}><h1>模型与供应商</h1><div className={styles.headerActions}><Link className={styles.button} href="/admin/bi/models?tab=history">变更记录</Link><button className={styles.primary} disabled={locked||!state?.managed} onClick={()=>open({kind:"create"})}><Plus size={16}/>新增前端模型</button></div></header>
    <div className={styles.tabs}><nav role="tablist" aria-label="模型与供应商工作区">{WORKSPACE_VIEWS.map(view=><button type="button" id={`workspace-${view.id}-tab`} key={view.id} role="tab" aria-selected={tab===view.id} aria-controls={`workspace-${view.id}-panel`} onClick={()=>navigate(view.id)}>{view.label}</button>)}</nav><div className={styles.versions}>{state&&<><span>模型 v{state.version}</span><span>计费 v{state.billingVersion??"未记录"}</span></>}<button aria-label="刷新生效配置" disabled={loading||locked} onClick={()=>{setError("");void load(true);}}><RefreshCw size={14}/></button></div></div>
    {error&&<div className={`${styles.alert} ${styles.error}`} role="alert">{error}</div>}{notice&&<div className={styles.alert} role="status">{notice}</div>}
    {pending&&<div className={styles.alert}><span>有一项发布结果待核对，原操作编号已保留。</span> <button className={styles.button} disabled={busy} onClick={()=>void run(pending)}>{busy&&<Loader2 size={14}/>}核对并继续</button></div>}
    {state&&!state.managed&&<div className={styles.alert}>统一配置尚未启用，用户仍使用兼容配置。<Link className={styles.link} href="/admin/bi/models">前往高级配置</Link></div>}
    {!state?<div className={styles.empty} role={loading?"status":undefined}>{loading?"正在读取模型与供应商…":<><p>配置读取失败</p><button className={styles.button} onClick={()=>void load(true)}>重新读取</button></>}</div>:<section id={`workspace-${tab}-panel`} role="tabpanel" aria-labelledby={`workspace-${tab}-tab`}>
      {tab==="models"&&(selected?<ModelDetail key={selected.id} row={selected} state={state} actions={modelActions(selected,state.managed,locked,open)} locked={locked} onBack={()=>navigate("models")} onOpen={open}/>:<>
        {selectedId&&<div className={styles.alert}>该模型已隐藏、停用或不在当前目录中。<Link className={styles.link} href="/admin/bi/models?tab=publicModels">查看完整配置</Link></div>}
        <div className={styles.toolbar}><div className={styles.filters} aria-label="模型类型">{[["all","全部"],["image","图片"],["text","文字"],["video","视频"],["audio","声音"]].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div><div className={styles.actions}><button className={styles.link} disabled={locked||!state.managed} onClick={()=>open({kind:"order"})}>调整排序</button>{state.managed&&state.rows.some(row=>row.modality==="video")&&<button className={styles.link} disabled={locked} onClick={()=>open({kind:"video-upgrade"})}>更新视频能力</button>}<label className={styles.search}><Search size={15}/><input aria-label="搜索模型" placeholder="搜索名称、模型 ID 或功能" value={search} onChange={event=>setSearch(event.target.value)}/></label></div></div>
        <ModelMappingHeader/>{rows.map(r=><ModelMappingCard key={r.id} row={r} actions={modelActions(r,state.managed,locked,open)} scopeDisabled={locked||!state.managed} onScope={()=>open({kind:"scope",row:r})} onManage={()=>navigate("models",r.id)} onPrice={()=>open({kind:"price",row:r})}/>)}
        {!rows.length&&<div className={styles.empty}>没有匹配的模型。</div>}
        {!!state.onboarding?.incomplete.length&&<details className={styles.advanced}><summary>待配置 / 隐藏模型 · {state.onboarding.incomplete.length}</summary>{state.onboarding.incomplete.map(model=><p key={model.id}>{model.label} · {model.reason}</p>)}<Link className={styles.link} href="/admin/bi/models?tab=publicModels">配置与启用 →</Link></details>}
        <footer className={styles.footer}><span>显示 {rows.length} / {state.rows.length} 个模型</span><Link className={styles.link} href="/admin/bi/models">高级配置 →</Link></footer>
      </>)}
      {tab==="suppliers"&&<SupplierWorkspace state={state} locked={locked} refreshing={refreshing} onRefresh={id=>void refreshProvider(id)} onOpen={open}/>}
      {tab==="pricing"&&<PricingWorkspace state={state} locked={locked} onOpen={open}/>}
      {tab==="runtime"&&<RuntimeWorkspace state={state}/>}
    </section>}
    <details className={styles.advanced}><summary>高级配置与其他入口</summary><nav><Link className={styles.link} href="/admin/bi/models?tab=batch">模型批量配置</Link><Link className={styles.link} href="/admin/bi/models?tab=business">功能计费与路由</Link><Link className={styles.link} href="/admin/bi/models?tab=imagePreset">默认图片预设</Link><Link className={styles.link} href="/admin/bi/models?tab=bindings">默认用途</Link><Link className={styles.link} href="/admin/bi/models?tab=pools">混合路由</Link><Link className={styles.link} href="/admin/model-management/library">元数据与成本库</Link><Link className={styles.link} href="/admin/supplier-balances">供应商余额</Link><Link className={styles.link} href="/admin/model-health">健康巡检</Link><Link className={styles.link} href="/admin/center?section=models">质量审计</Link><Link className={styles.link} href="/admin/billing/supplier-cost">采购与对账</Link></nav></details>
    {state&&<ModelEditor editor={editor} state={state} locked={locked} busy={busy} error={error} refreshing={refreshing} onRefresh={id=>void refreshProvider(id)} onChange={setEditor} operation={operation} onPublish={run}/>}
  </main>;
}
