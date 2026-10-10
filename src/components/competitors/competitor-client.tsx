"use client";
import {SelectMenu} from "@/components/ui/select-menu";
import {useFeatureBilling} from "@/lib/billing/preview";
import { useImageQuality } from "@/lib/image-quality-context";
import { ImageQualityControl } from "@/components/image-quality-control";


import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FolderUp, Download, ScanLine, SquareDashedMousePointer, RotateCcw, Plus, Minus, RefreshCw, Trash2, ImagePlus, Layers, Check } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { authHeader } from "@/lib/supabase";
import { currentImage, competitorClientId, REGION_LABELS, type CompetitorItem, type CompetitorRegion } from "@/lib/competitor-types";
import { RegionEditor } from "./region-editor";
import { bytesLabel, prepareImageUpload, uploadFormData } from "@/lib/client-image-upload";
import "./competitors.css";
import { TextModelSelect } from "@/components/ui/text-model-select";
import { createImageDownloadName } from "@/lib/download";

type UploadTask = {
  id: string; batch: string; file: File; path: string;
  status: "waiting"|"optimizing"|"uploading"|"done"|"error";
  error?: string; progress?: number; originalBytes: number; uploadBytes?: number;
};
async function api(url: string, method = "GET", body?: unknown) {
  const form = body instanceof FormData;
  const r = await fetch(url, { method, headers: { ...await authHeader(), ...(!form && body ? { "Content-Type": "application/json" } : {}) }, body: body ? form ? body : JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({ error: `请求失败 (${r.status})` }));
  if (!r.ok) throw new Error(data.error || `请求失败 (${r.status})`);
  return data;
}
function draft(item: CompetitorItem) { return { revision: item.revision, prompt: item.prompt, regions: item.regions, activeVersion: item.activeVersion }; }
export function CompetitorClient() {
  const billing=useFeatureBilling("competitor.action");
  const { user, ready, applyServerUser } = useAuth();
  const costPerImage = billing.cost;
  const { openAuth } = useAuthModal();
  const [items, setItems] = useState<CompetitorItem[]>([]);
  const [activeId, setActiveId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, CompetitorItem>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState<Record<string,string>>({});
  const [queue, setQueue] = useState<UploadTask[]>([]);
  const [uploading, setUploading] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [queuedIds, setQueuedIds] = useState<string[]>([]);
  const [batchResults, setBatchResults] = useState<{ path: string; ok: boolean }[]>([]);
  const batchStop = useRef(false);
  const uploadGuard = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [regionId, setRegionId] = useState("");
  const [zoom, setZoom] = useState(1);
  const [drawing, setDrawing] = useState(false);
  const [compare, setCompare] = useState(false);
  const [degree, setDegree] = useState("layout");
  const [productId, setProductId] = useState("");
  const [folder, setFolder] = useState("all");
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const productInput = useRef<HTMLInputElement>(null);
  const item = drafts[activeId] || items.find(i => i.id === activeId);
  const current = item?.regions.find(r => r.id === regionId);
  const busy = !!item && (!!running[item.id] || item.busy || queuedIds.includes(item.id));
  const email = user?.email;
  const load = useCallback(async () => {
    try {
      const data = await api("/api/competitors"); setItems(data.items);
      setActiveId(id => id || data.items[0]?.id || "");
    } catch(e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    setDrafts({}); setItems([]); setActiveId(""); setSelected([]); setProductId("");
    if (email) void load();
  }, [email, load]);
  useEffect(() => { folderInput.current?.setAttribute("webkitdirectory", ""); }, []);
  useEffect(() => {
    if (!items.some(i => i.busy)) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [items, load]);
  useEffect(() => {
    if (!Object.keys(drafts).length) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [drafts]);
  function accept(next: CompetitorItem) {
    setItems(all => all.some(i => i.id === next.id) ? all.map(i => i.id === next.id ? next : i) : [...all, next]);
    setDrafts(all => { const rest = { ...all }; delete rest[next.id]; return rest; });
  }
  function change(patch: Partial<CompetitorItem>) {
    if (!item || busy) return;
    setDrafts(all => ({ ...all, [item.id]: { ...item, ...patch } })); setNotice("");
  }
  function regionChange(patch: Partial<CompetitorRegion>) {
    if (item && current) change({ regions: item.regions.map(r => r.id === current.id ? { ...r, ...patch } : r) });
  }
  async function save(target = item) {
    if (!target) return;
    setRunning(all => ({ ...all, [target.id]: "save" }));
    try {
      const data = await api(`/api/competitors/${target.id}`, "PATCH", draft(target)); accept(data.item); return data.item as CompetitorItem;
    } finally { setRunning(all => { const rest = { ...all }; delete rest[target.id]; return rest; }); }
  }
  async function action(kind: "analyze"|"replicate"|"edit", target = item) {
    if (!target || running[target.id] || target.busy) return;
    setRunning(all => ({ ...all, [target.id]: kind })); setError(""); setNotice("");
    try {
      const payload={ ...draft(target), action: kind, degree, ...(productId ? { productId } : {}) };
      let data;
      if(kind==="analyze")data=await api(`/api/competitors/${target.id}/action`,"POST",payload);
      else {const response=await billing.submit(`/api/competitors/${target.id}/action`,{method:"POST",headers:{"content-type":"application/json",...await authHeader()},body:JSON.stringify(payload)});data=await response.json();if(!response.ok)throw new Error(data.error||"生成失败");}
      accept(data.item); if (data.user) applyServerUser(data.user);
      setNotice(kind === "analyze" ? "提示词与元素已保存；勾选需要修改的元素后再生成。" : "新版本已保存，原图和历史版本保持不变。");
      return true;
    } catch(e) {
      setError(`${target.path}：${(e as Error).message}`);
      // A failed model job still advances the revision when acquiring its lease.
      const fresh = await api(`/api/competitors/${target.id}`).catch(() => null);
      if (fresh?.item) {
        setItems(all => all.map(i => i.id === target.id ? fresh.item : i));
        setDrafts(all => ({ ...all, [target.id]: { ...fresh.item, prompt: target.prompt, regions: target.regions, activeVersion: target.activeVersion } }));
      }
      return false;
    } finally { setRunning(all => { const rest = { ...all }; delete rest[target.id]; return rest; }); }
  }
  async function runBatch(kind: "analyze" | "replicate") {
    if (batchBusy) return;
    const targets = selected.map(id => drafts[id] || items.find(i => i.id === id)).filter(Boolean) as CompetitorItem[];
    if (kind === "replicate" && targets.some(i => !i.prompt.trim())) { setError("所选图片中有未填写提示词的图片，请先批量反推。"); return; }
    setBatchBusy(true); setBatchResults([]); setQueuedIds(targets.map(i=>i.id)); batchStop.current = false;
    try {
      for (const target of targets) {
        if (batchStop.current) break;
        const ok = !!await action(kind, target);
        setBatchResults(all => [...all, { path: target.path, ok }]);
        setQueuedIds(all => all.filter(id=>id!==target.id));
      }
    } finally { setBatchBusy(false); setQueuedIds([]); }
  }
  function exportPrompts() {
    const data = selected.map(id => drafts[id] || items.find(i => i.id === id)).filter(Boolean).map(i => ({ path: i!.path, prompt: i!.prompt, regions: i!.regions }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "竞品提示词与选区.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function upload(tasks: UploadTask[], asProduct = false) {
    if (uploadGuard.current) return;
    uploadGuard.current = true; setUploading(true); setError("");
    const ids = new Array<string>(tasks.length).fill("");
    let next = 0;
    try {
      const worker = async () => {
        while (next < tasks.length) {
          const index = next++;
          const task = tasks[index];
          setQueue(all => all.map(t => t.id === task.id ? { ...t, status: "optimizing", progress: 0, error: "" } : t));
          try {
            const prepared = await prepareImageUpload(task.file);
            setQueue(all => all.map(t => t.id === task.id ? { ...t, status: "uploading", uploadBytes: prepared.uploadBytes } : t));
            const fd = new FormData(); fd.append("image", prepared.file); fd.append("path", task.path); fd.append("batchId", task.batch);
            const data = await uploadFormData<{ item: CompetitorItem }>("/api/competitors", fd, (loaded, total) => {
              const progress = total ? Math.min(100, Math.round(loaded / total * 100)) : 0;
              setQueue(all => all.map(t => t.id === task.id ? { ...t, progress } : t));
            });
            accept(data.item); ids[index] = data.item.id;
            if (asProduct) setProductId(data.item.id);
            setQueue(all => all.map(t => t.id === task.id ? { ...t, status: "done", progress: 100, uploadBytes: prepared.uploadBytes } : t));
          } catch(e) { setQueue(all => all.map(t => t.id === task.id ? { ...t, status: "error", error: (e as Error).message } : t)); }
        }
      };
      // Folder import uses three workers; product reference remains a single request.
      await Promise.all(Array.from({ length: Math.min(asProduct ? 1 : 3, tasks.length) }, worker));
      const first = ids.find(Boolean) || "";
      if (first && !asProduct) { setActiveId(first); setFolder("all"); }
    } finally { uploadGuard.current = false; setUploading(false); }
  }
  function pick(files: FileList | null, asProduct = false) {
    if (!user) { openAuth("sign-in"); return; }
    if (!files?.length || uploading) return;
    const list = Array.from(files);
    const supported = list.filter(f => /\.(png|jpe?g|webp)$/i.test(f.name));
    if (supported.length > 100) { setError("单次最多导入 100 张图片，请分批选择。"); return; }
    if (!supported.length) { setError("文件夹中没有 JPG、PNG 或 WebP 图片。"); return; }
    const batch = competitorClientId();
    const tasks: UploadTask[] = supported.map(file => ({ id: competitorClientId(), file, batch, path: file.webkitRelativePath || file.name, status: "waiting", originalBytes: file.size }));
    setQueue(tasks); if (list.length !== supported.length) setNotice(`已跳过 ${list.length - supported.length} 个非图片文件。`);
    void upload(tasks, asProduct);
  }
  async function download(region?: string) {
    if (!item) return;
    try {
      const saved = drafts[item.id] ? await save(item) : item;
      if (!saved) return;
      const q = new URLSearchParams({ version: saved.activeVersion }); if (region) q.set("region",region);
      const res = await fetch(`/api/competitors/${saved.id}/image?${q}`, { headers: await authHeader() });
      if (!res.ok) throw new Error("下载失败，请重试");
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a");
      a.href = url; a.download = createImageDownloadName(); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch(e) { setError((e as Error).message); }
  }
  async function remove() {
    if (!item || !confirm(`从竞品工作台移除 ${item.path}？已导出的作品不受影响。`)) return;
    try { await api(`/api/competitors/${item.id}`,"DELETE"); setItems(all => all.filter(i => i.id !== item.id)); setDrafts(all => { const rest={...all}; delete rest[item.id]; return rest; }); setSelected(all => all.filter(id => id !== item.id)); setActiveId(""); }
    catch(e) { setError((e as Error).message); }
  }
  async function toCanvas() {
    if (!item) return;
    try {
      await api("/api/artworks/add", "POST", { entry: "competitor", src: { image: currentImage(item), title: item.path.split("/").pop(), prompt: item.prompt, category: "main" } });
      setNotice("已存入作品库，可在画布中通过历史作品添加。");
    } catch(e) { setError((e as Error).message); }
  }
  const folders = Array.from(new Set(items.map(i => i.path.includes("/") ? i.path.slice(0,i.path.lastIndexOf("/")) : "未分组"))).sort();
  const visible = items.filter(i => folder === "all" || (i.path.includes("/") ? i.path.slice(0,i.path.lastIndexOf("/")) : "未分组") === folder).sort((a,b) => a.path.localeCompare(b.path,"zh-CN",{numeric:true}));
  return <div className="cmp-workspace">
    <header className="cmp-header"><div className="cmp-title"><Layers size={20}/><h1>竞品工作台</h1><span>{items.length} 张</span></div>
      <div className="cmp-actions"><button disabled={uploading || !ready} onClick={() => folderInput.current?.click()}><FolderUp size={16}/>导入文件夹</button><button disabled={uploading || !ready} onClick={() => fileInput.current?.click()}><ImagePlus size={16}/>添加图片</button><button onClick={() => { if (Object.keys(drafts).length && !confirm("重新加载会丢弃未保存的修改，继续？")) return; setDrafts({}); void load(); }} aria-label="刷新素材"><RefreshCw size={16}/></button></div>
    </header>
    <input ref={folderInput} data-testid="folder-input" type="file" multiple hidden onChange={e => { pick(e.target.files); e.target.value=""; }}/>
    <input ref={fileInput} data-testid="image-input" type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { pick(e.target.files); e.target.value=""; }}/>
    <input ref={productInput} data-testid="product-input" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { pick(e.target.files,true); e.target.value=""; }}/>
    {!user && ready && <div className="cmp-notice"><button onClick={() => openAuth("sign-in")}>登录后导入并保存竞品图片</button></div>}
    {error && <div className="cmp-error" role="alert">{error}<button onClick={() => setError("")}>关闭</button></div>}
    {notice && <div className="cmp-notice" role="status">{notice}</div>}
    {(batchBusy || batchResults.length > 0) && <details className="cmp-uploads" open={batchResults.some(r => !r.ok)}><summary>批处理：{batchResults.filter(r => r.ok).length} 成功 / {batchResults.filter(r => !r.ok).length} 失败{batchBusy ? " · 处理中" : " · 已结束"}</summary>{batchResults.map((r,i)=><div key={i}><span>{r.path}</span><span>{r.ok?"完成":"失败，可选中该图重试"}</span></div>)}{batchBusy && <button onClick={()=>{batchStop.current=true;}}>完成当前图片后停止</button>}</details>}
    {queue.length > 0 && <details className="cmp-uploads" open={uploading || queue.some(t => t.status === "error")}><summary>导入进度 {queue.filter(t => t.status === "done").length} / {queue.length}{uploading ? " · 处理中" : ""}</summary>
      {queue.map(t => <div className="cmp-upload-row" key={t.id}>
        <span className="cmp-upload-name" title={t.path}>{t.path}</span>
        <span className="cmp-upload-state">
          <span>{({waiting:"等待",optimizing:"优化中",uploading:`上传中 ${t.progress || 0}%`,done:"完成",error:"失败"})[t.status]}</span>
          {t.uploadBytes ? <small>{t.uploadBytes < t.originalBytes ? `${bytesLabel(t.originalBytes)} → ${bytesLabel(t.uploadBytes)}` : bytesLabel(t.uploadBytes)}</small> : <small>{bytesLabel(t.originalBytes)}</small>}
          {t.status === "uploading" && <span className="cmp-upload-progress" aria-label={`上传进度 ${t.progress || 0}%`}><i style={{ width: `${t.progress || 0}%` }}/></span>}
          {t.error && <small className="cmp-upload-error">{t.error}</small>}
        </span>
        {t.status === "error" && <button disabled={uploading} onClick={() => void upload([t])}>重试</button>}
      </div>)}
    </details>}
    <div className="cmp-layout">
      <aside className="cmp-library"><div className="cmp-panel-heading">参考素材</div>
        <SelectMenu label="文件夹筛选" value={folder} onChange={setFolder} className="w-full" options={[{value:"all",label:"全部文件夹"},...folders.map(value=>({value,label:value}))]} />
        <div className="cmp-library-tools"><button disabled={!visible.length} onClick={() => setSelected(visible.every(i => selected.includes(i.id)) ? [] : visible.map(i => i.id))}>全选 / 清空</button><button disabled={!selected.length || batchBusy} onClick={() => void runBatch("analyze")}>批量反推 ({selected.length})</button><button disabled={!selected.length || batchBusy} onClick={() => void runBatch("replicate")}>批量生成</button><button disabled={!selected.length} onClick={exportPrompts}>导出提示词</button></div>
        <div className="cmp-file-list">{visible.map(i => <div key={i.id} className={`cmp-file ${activeId===i.id ? "active" : ""}`}>
          <input type="checkbox" aria-label={`选择 ${i.path}`} checked={selected.includes(i.id)} onChange={e => setSelected(all => e.target.checked ? [...all,i.id] : all.filter(id=>id!==i.id))}/>
          <button onClick={() => { setActiveId(i.id); setRegionId(""); setCompare(false); setZoom(1); }} title={i.path}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={i.image}/><span><strong>{i.path.split("/").pop()}</strong><small>{i.path}</small><small>{running[i.id] || i.busy ? "处理中…" : `${i.versions.length} 个版本`}{drafts[i.id] ? " · 未保存" : ""}</small></span>
          </button>
        </div>)}</div>
        {!items.length && <p className="cmp-empty-small">支持 JPG / PNG / WebP，保留子目录与文件顺序。</p>}
      </aside>
      <section className="cmp-center">
        <div className="cmp-toolbar"><button className={drawing?"selected":""} disabled={!item||busy||compare} onClick={() => setDrawing(!drawing)}><SquareDashedMousePointer size={15}/>框选元素</button>
          <button onClick={()=>setZoom(z=>Math.max(.25,z-.25))} aria-label="缩小"><Minus size={15}/></button><button onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button onClick={()=>setZoom(z=>Math.min(4,z+.25))} aria-label="放大"><Plus size={15}/></button>
          <label className="cmp-inline"><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/>查看原图</label>
          <button disabled={!item||busy} onClick={()=>void download()}><Download size={15}/>下载</button>
        </div>
        {item ? <RegionEditor image={compare?item.image:currentImage(item)} width={item.width} height={item.height} regions={compare?[]:item.regions} selected={regionId} onSelect={setRegionId} onAdd={r=>{ if(item.regions.length>=20){setError("最多创建 20 个选区");return;} change({regions:[...item.regions,r]});setRegionId(r.id); }} disabled={busy||compare} zoom={zoom} draw={drawing}/> : <div className="cmp-stage cmp-empty"><FolderUp size={34}/><h2>导入竞品图片</h2><p>选择文件夹，或添加图片开始分析。</p><button onClick={()=>folderInput.current?.click()}>选择文件夹</button></div>}
        {item && <div className="cmp-history"><span>版本</span><button className={!item.activeVersion?"selected":""} disabled={busy} onClick={()=>change({activeVersion:"",regions:[],prompt:item.prompt})}>原图</button>
          {item.versions.map((v,i)=><button key={v.id} className={item.activeVersion===v.id?"selected":""} disabled={busy} onClick={()=>change({activeVersion:v.id,prompt:v.prompt,regions:v.regions})} title={v.createdAt}>V{i+1} · {v.kind==="edit"?"局部修改":"参考生成"}</button>)}
        </div>}
      </section>
      <aside className="cmp-properties">
        {item ? <>
<ImageQualityControl disabled={busy || batchBusy} /><p className="text-xs text-c-text3">每张 {costPerImage} 积分；仅成功出图计费</p>
<div className="cmp-panel-heading"><span>提示词</span><button disabled={busy} onClick={()=>void action("analyze")}><ScanLine size={15}/>反推提示词</button></div>
<TextModelSelect compact />
          <textarea aria-label="反推提示词" rows={7} maxLength={8000} value={item.prompt} disabled={busy} placeholder="反推参考图，或直接填写生成要求" onChange={e=>change({prompt:e.target.value})}/>
          <div className="cmp-field"><label htmlFor="cmp-degree">参考方式</label><SelectMenu id="cmp-degree" label="参考方式" value={degree} onChange={setDegree} className="w-full" disabled={busy} options={[{value:"layout",label:"构图与排版"},{value:"style",label:"仅参考风格"}]} /></div>
          <div className="cmp-field"><label htmlFor="cmp-product">替换为我的产品</label><SelectMenu id="cmp-product" label="替换为我的产品" value={productId} onChange={setProductId} className="w-full" disabled={busy} options={[{value:"",label:"不替换产品"},...items.map(i=>({value:i.id,label:i.path}))]} /><button disabled={uploading} onClick={()=>productInput.current?.click()}>上传产品图</button></div>
          <button className="cmp-primary cmp-full" disabled={busy||!item.prompt.trim()} onClick={()=>void action("replicate")}>{running[item.id]==="replicate"?"生成中…":"生成类似图片 / 重做"}</button>
          <div className="cmp-section-title">元素 / 选区 <span>{item.regions.length}/20</span></div>
          <div className="cmp-regions-list">{item.regions.map((r,i)=><div key={r.id} className={r.id===regionId?"selected":""}><input aria-label={`启用 ${r.label}`} type="checkbox" checked={r.enabled} disabled={busy} onChange={e=>change({regions:item.regions.map(a=>a.id===r.id?{...a,enabled:e.target.checked}:a)})}/><button onClick={()=>{setRegionId(r.id);setDrawing(false);}}>{i+1}. {r.label}</button><span>{REGION_LABELS[r.kind]}</span></div>)}</div>
          {!item.regions.length&&<p className="cmp-empty-small">点击“框选元素”，拖动创建选区；或反推提示词获取建议选区。</p>}
          {current && <fieldset className="cmp-region-form" disabled={busy}>
            <label>元素名称<input aria-label="元素名称" value={current.label} onChange={e=>regionChange({label:e.target.value})}/></label>
            <label>修改类型<SelectMenu label="修改类型" value={current.kind} onChange={kind=>regionChange({kind:kind as CompetitorRegion["kind"]})} className="w-full" disabled={busy} options={Object.entries(REGION_LABELS).map(([value,label])=>({value,label}))} /></label>
            {current.kind==="color"&&<label>目标颜色<input type="color" aria-label="目标颜色" value={current.color} onChange={e=>regionChange({color:e.target.value})}/></label>}
            <label>修改要求<textarea aria-label="选区修改要求" rows={3} maxLength={1500} value={current.instruction} onChange={e=>regionChange({instruction:e.target.value})} placeholder="例如：改成米白色，保留纹理与阴影"/></label>
            <div className="cmp-coordinates">{(["x","y","width","height"] as const).map(k=><label key={k}>{({x:"左",y:"上",width:"宽",height:"高"})[k]} %<input type="number" aria-label={`选区${k}`} min={(k === "width" || k === "height") ? 0.2 : 0} max={100} step={.1} value={Number((current[k]*100).toFixed(1))} onChange={e=>{
              const value=Math.max((k === "width" || k === "height") ? 0.002 : 0,Math.min(1,Number(e.target.value)/100));
              const r={...current,[k]:value}; r.x=Math.min(r.x,1-r.width);r.y=Math.min(r.y,1-r.height);regionChange(r);
            }}/></label>)}</div>
            <div className="cmp-actions"><button onClick={()=>void download(current.id)}>导出元素裁片</button><button onClick={()=>{change({regions:item.regions.filter(r=>r.id!==current.id)});setRegionId("");}}><Trash2 size={14}/>移除选区</button></div>
          </fieldset>}
          <button className="cmp-primary cmp-full" disabled={busy||!item.regions.some(r=>r.enabled)} onClick={()=>void action("edit")}>{running[item.id]==="edit"?"修改中…":`仅修改启用选区 (${item.regions.filter(r=>r.enabled).length})`}</button>
          <p className="cmp-empty-small">未勾选的选区不提交；仅启用选区内替换像素，外部保持原图。选区裁片保留框内背景，不等同于自动抠图。</p>
          <div className="cmp-actions cmp-bottom"><button disabled={busy} onClick={()=>void save().then(()=>setNotice("提示词与选区已保存")).catch(e=>setError(e.message))}><Check size={14}/>{drafts[item.id]?"保存修改":"已保存"}</button><button disabled={busy||!drafts[item.id]} onClick={()=>accept(items.find(i=>i.id===item.id)!)}><RotateCcw size={14}/>撤销未保存</button></div>
          <div className="cmp-actions"><button disabled={busy} onClick={()=>void toCanvas()}>存入作品库</button><Link href="/canvas">打开画布</Link><button disabled={busy} onClick={()=>void remove()} aria-label="删除当前素材"><Trash2 size={15}/></button></div>
          {busy&&<p role="status">{running[item.id]==="analyze"?"正在分析图像…":"此图任务处理中，其他图片可继续操作。"}</p>}
        </>:<div className="cmp-empty-small">选择左侧图片后查看提示词、元素和历史版本。</div>}
      </aside>
    </div>
  </div>;
}
