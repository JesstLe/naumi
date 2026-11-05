"use client";
import Link from "next/link";
import {useState} from "react";
import {ChevronRight,Database,Loader2,Plus,RefreshCw,Search,Unplug} from "lucide-react";
import type {Operation} from "./contracts";
import styles from "./model-management.module.css";
import clarity from "./model-management-clarity.module.css";
import {ModelMappingCard,ModelMappingHeader,type MappingAction} from "./model-mapping-card";
import {useModelManagement} from "./use-model-management";
import {ModelEditor} from "./model-editor";
import {dispatchedEditor,registeredEditor,type EditorState} from "./editor-state";
import {Source} from "./source-card";

function CreateFrontendModelLink({ locked }: { locked: boolean }) {
  return <Link href="/admin/bi/models?tab=batch" className={`${styles.primary} inline-flex items-center justify-center gap-2 no-underline`} aria-disabled={locked} onClick={event => { if (locked) event.preventDefault(); }}><Plus size={17} />新增前端模型</Link>;
}

export function ModelManagement() {
  const {state,error,setError,notice,loading,busy,pending,refreshing,refreshProvider,load,publish,operation,locked}=useModelManagement();
  const [tab, setTab] = useState("models"), [filter, setFilter] = useState("all"), [search, setSearch] = useState("");
  const [editor,setEditor]=useState<EditorState|null>(null);
  async function run(operation: Operation) {
    const refreshed=await publish(operation,{
      onDispatch:()=>setEditor(dispatchedEditor),
      onSettled:()=>setEditor(null)
    });
    if(operation.action==="register" && refreshed) setEditor(registeredEditor(editor,refreshed));
  }
  const rows = state?.rows.filter(r => (filter === "all" || r.modality === filter) && `${r.label} ${r.alias} ${r.routes.map(x => `${x.model} ${x.provider}`).join(" ")} ${r.features.map(f => f.label).join(" ")}`.toLowerCase().includes(search.toLowerCase())) || [];
  return <main className={`${styles.page} ${clarity.page}`}>
    <div className={styles.topline}><span className={styles.miniBrand}><span className={styles.brandMark}>N</span>Naumi <span>模型工作台</span></span><div className={styles.libraryLinks}><Link href="/admin/supplier-balances">供应商余额</Link><Link href="/admin/model-management/library">元数据与成本库 <Database size={14}/></Link><Link href="/admin/bi/models">完整配置中心 <ChevronRight size={14} /></Link></div></div>
    <header className={`${styles.hero} ${clarity.header}`}><h1>模型管理</h1><div className="flex flex-wrap items-center gap-2"><CreateFrontendModelLink locked={locked} /><button className={styles.secondary} onClick={() => { setTab("sources"); setEditor({kind:"connect"}); }} disabled={!state || locked}><Plus size={17} />接入上游</button></div></header>
    <div className={styles.tabs}><div role="tablist" aria-label="模型管理"><button role="tab" id="models-tab" aria-selected={tab === "models"} aria-controls="models-panel" onClick={() => setTab("models")}>模型映射 <span>{state?.rows.length ?? "—"}</span></button><button role="tab" id="sources-tab" aria-selected={tab === "sources"} aria-controls="sources-panel" onClick={() => setTab("sources")}>上游来源 <span>{state?.providers.length ?? "—"}</span></button></div><span className={styles.version}>{state ? `模型配置 v${state.version}` : "正在读取生效配置"}<button aria-label="刷新生效配置" disabled={loading || locked} onClick={() => { setError(""); void load(true); }}><RefreshCw size={15} className={loading ? styles.spin : ""} /></button></span></div>
    {error && <div role="alert" className={styles.error}>{error}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    {pending && <div className={styles.pending}><span>有一项发布结果需要核对，已保留操作编号。</span><button className={styles.primary} disabled={busy} onClick={() => void run(pending)}>{busy && <Loader2 size={16} className={styles.spin} />}核对并继续</button></div>}
    {state && !state.managed && <div className={styles.error}>当前实例未启用统一模型配置，下面是注册表中的模型。用户侧仍使用旧配置；请先在完整配置中心完成接入。</div>}
    {!state && loading ? <div className={styles.empty}><Loader2 className={styles.spin} />正在读取前端模型与真实路由…</div> : !state ? <div className={styles.empty}><Unplug /><h2>模型配置暂时无法读取</h2><p>检查数据库和 Router 管理连接后重试。</p><button className={styles.secondary} onClick={() => void load(true)}>重新读取</button></div> : tab === "models" ? <section id="models-panel" role="tabpanel" aria-labelledby="models-tab">
      <div className={`${styles.toolbar} ${clarity.toolbar}`}><div className={styles.filters} aria-label="模型类型">{[["all", "全部"], ["image", "图片"], ["text", "文字"], ["video", "视频"]].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><button className={styles.secondary} disabled={locked} onClick={()=>setEditor({kind:"order"})}>调整排序</button>{state.managed&&state.rows.some(row=>row.modality==="video")&&<button className={styles.secondary} disabled={locked} onClick={()=>{setError("");setEditor({kind:"video-upgrade"});}}>更新视频能力</button>}<label className={styles.search}><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索名称、模型 ID 或功能" aria-label="搜索模型" /></label></div>
      <div className={`${styles.mapping} ${clarity.mapping}`}><ModelMappingHeader />{rows.map(r => {
        const actions: MappingAction[] = [
          { label: "修改显示名称", group: "display", disabled: locked || !state.managed, onClick: () => setEditor({kind:"rename",row:r}) },
          { label: "设置积分", group: "display", disabled: locked || !state.managed || !r.features.length, onClick: () => { setError(""); setEditor({kind:"price",row:r}); } },
          { label: r.modality === "image" ? "更换模型" : "更换通道 / 模型", group: "routing", disabled: locked || !state.managed, onClick: () => { setEditor({kind:"switch",row:r,initialProvider:r.routes[0]?.providerId || ""}); } },
        ];
        if (r.channelsEditable) actions.push({ label: "供应通道", group: "routing", disabled: locked || !state.managed, onClick: () => { setError(""); setEditor({kind:"channels",row:r,draft:null}); } });
        if (r.modality === "video") actions.push({ label: "视频能力", group: "parameters", disabled: locked || !state.managed || !r.videoConfig?.routes.length, onClick: () => { setError(""); setEditor({kind:"video",row:r}); } });
        if (r.modality === "image") actions.push(
          { label: "统一参数映射", group: "parameters", disabled: locked || !state.managed || r.preset || !r.parameterSources?.length || !r.resolutionConfig?.routes.every(route=>route.editable) || !r.qualityConfig?.routes.every(route=>route.editable), onClick: () => { setError(""); setEditor({kind:"mapping",row:r}); } },
          { label: "参数设置", group: "parameters", disabled: locked || r.preset || !r.qualityConfig?.routes.every(v => v.editable), title: r.preset || !r.qualityConfig?.routes.every(v => v.editable) ? "此路径由外部路由或成本预设管理参数" : "配置显示档位与实际传参", onClick: () => { setError(""); setEditor({kind:"parameters",row:r}); } },
          { label: "分辨率设置", group: "parameters", disabled: locked || !state.managed, onClick: () => { setError(""); setEditor({kind:"resolution",row:r}); } },
        );
        if (r.modality === "image" && state.managed) actions.push({ label: "图像高级参数", group: "parameters", disabled: locked, onClick: () => setEditor({kind:"advanced",row:r}) });
        return <ModelMappingCard key={r.id} row={r} actions={actions} scopeDisabled={locked || !state.managed} onScope={() => setEditor({kind:"scope",row:r})} />;
      })}</div>
      <p className={clarity.listFooter}>显示 {rows.length} / {state.rows.length} 个前端模型</p>
      {!rows.length && <div className={styles.empty}><Search /><h2>{state.rows.length ? "没有匹配的模型" : "前端暂无可见模型"}</h2><p>{state.rows.length ? "尝试其他名称、功能或类型。" : "这里只显示前端当前已启用、可展示的模型。"}</p>{!state.rows.length && <CreateFrontendModelLink locked={locked} />}</div>}

    </section> : <section id="sources-panel" role="tabpanel" aria-labelledby="sources-tab"><div className={styles.sourceIntro}><div><h2>上游来源</h2><p>接入上游 URL 和凭据，自动读取模型目录。再将已确认能力的模型加入可切换列表。</p></div><button className={styles.secondary} disabled={locked} onClick={() => setEditor({kind:"connect"})}><Plus size={16} />新增来源</button></div><div className={styles.sources}>{state.providers.map(p => {
      const catalog = state.catalogs.find(c => c.providerId === p.id), refreshingNow = refreshing.includes(p.id);
      return <Source key={p.id} provider={p} catalog={catalog} refreshing={refreshingNow} locked={locked} candidates={state.candidates} onRefresh={() => void refreshProvider(p.id)} onRegister={model => setEditor({kind:"register",providerId:p.id,model})} />;
    })}</div>{!state.providers.length && <div className={styles.empty}><Unplug /><h2>接入第一个上游来源</h2><p>输入接口地址与 API Key，系统会自动发现模型 ID。</p></div>}</section>}
    {state && <ModelEditor editor={editor} state={state} locked={locked} busy={busy} error={error} refreshing={refreshing} onRefresh={id=>void refreshProvider(id)} onChange={setEditor} operation={operation} onPublish={run}/>}
  </main>;
}
