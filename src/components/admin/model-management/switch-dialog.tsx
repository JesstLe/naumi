"use client";
import {useState} from "react";
import Link from "next/link";
import {ArrowRight,Check,Loader2,Plus,RefreshCw,Search} from "lucide-react";
import type {ManagedModelRow} from "@/lib/model-config/management";
import type {State} from "./contracts";
import styles from "./model-management.module.css";
import {Dialog} from "./dialog";


export function SwitchDialog({ row, state, initialProvider, refreshing, locked, busy, onRefresh, onRegister, onClose, onSave }: { row: ManagedModelRow; state: State; initialProvider:string; refreshing:string[]; locked: boolean; busy: boolean; onRefresh:(providerId:string)=>void; onRegister:(providerId:string,model:string)=>void; onClose: () => void; onSave: (id: string) => void }) {
  const [selected, setSelected] = useState(""), [search, setSearch] = useState("");
  const protocol=row.modality==="text"?"openai-chat":row.modality==="video"?"openai-videos":null;
  const providers=state.providers.filter(p=>p.enabled&&p.configured&&(!protocol||p.protocol===protocol)&& (protocol||state.candidates.some(c=>c.providerId===p.id&&row.candidateIds.includes(c.id))));
  const [providerId,setProviderId]=useState(()=>providers.some(p=>p.id===initialProvider)?initialProvider:row.routes[0]?.providerId||"");
  const candidates = state.candidates.filter(c => row.candidateIds.includes(c.id) && (!providerId||c.providerId===providerId) && `${c.model} ${c.provider}`.toLowerCase().includes(search.toLowerCase()));
  const catalog=state.catalogs.find(c=>c.providerId===providerId),refreshingNow=refreshing.includes(providerId),provider=providers.find(p=>p.id===providerId);
  const registered=state.candidates.filter(c=>c.providerId===providerId);
  const discovered=protocol?(catalog?.models||[]).filter(m=>!registered.some(c=>c.model===m.id)&&`${m.id} ${m.label}`.toLowerCase().includes(search.toLowerCase())):[];
  const incompatible=registered.filter(c=>!row.candidateIds.includes(c.id)&&`${c.model} ${c.label}`.toLowerCase().includes(search.toLowerCase()));
  return <Dialog title={row.modality==="text"?"更换文字通道与模型":"更换实际模型"} onClose={onClose} locked={locked}><div className={styles.dialogBody}><div className={styles.currentConnection}><span>前端名称<b>{row.label}</b></span><ArrowRight size={18} /><span>当前实际模型<b>{Array.from(new Set(row.routes.map(r => r.model))).join(" / ")}</b><small>{Array.from(new Set(row.routes.map(r=>r.provider))).join(" / ")}</small></span></div><p className={styles.ruleNote}>名称保持不变。影响：{row.features.map(f => f.label).join("、")}。{row.publicIds.length > 1 && "该家族的所有比例分支会一起切换。"}{(row.conditional || row.supplierRouting) && "更换后将改为固定调用，原条件路由和失败回退会关闭。"}</p>
    {row.preset && <div className={styles.notice}>此模型使用专用能力与定价预设。更换到不同实际模型前，需要在<Link href="/admin/bi/models">完整配置中心</Link>核验新模型的参数和采购价格。</div>}
    <label className={styles.field}>供应通道<select aria-label="选择供应通道" value={providerId} disabled={locked} onChange={e=>{setProviderId(e.target.value);setSelected("");setSearch("");}}><option value="">全部可用通道</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{provider&&<small>{provider.baseUrl}</small>}</label>
    <label className={styles.search}><Search size={16} /><input aria-label="搜索可切换模型" placeholder="搜索模型 ID 或上游来源" value={search} onChange={e => setSearch(e.target.value)} /></label>
    <fieldset className={styles.candidateList} disabled={locked}><legend>选择兼容的实际模型</legend>{candidates.map(c => <label key={c.id} className={styles.candidate} data-selected={selected === c.id}><input type="radio" name="actual-model" value={c.id} checked={selected === c.id} onChange={() => setSelected(c.id)} /><span><code>{c.model}</code><small>{c.provider}{row.routes.some(r => r.upstreamId === c.id) ? " · 当前路径" : c.verified ? " · 能力已确认" : " · 已接入，能力未核验"}</small></span>{selected === c.id && <Check size={17} />}</label>)}</fieldset>
    {!candidates.length && <p className={styles.ruleNote}>此通道暂无已接入且兼容的模型。可从下面的目录添加并确认能力，或选择其他通道。{row.modality==="text"&&row.features.some(f=>["canvas.assistant","canvas.ocr"].includes(f.id))&&"当前用途包含图片理解，需要支持文字及图片输入。"}</p>}
    {!!incompatible.length&&<p className={styles.ruleNote}>此通道另有 {incompatible.length} 个已接入模型不满足当前用途的能力要求，请在完整配置中心核对能力。</p>}
    {protocol&&provider&&<section aria-label="通道模型目录"><div className={styles.scopeHeading}><b>从此通道添加实际模型</b><button type="button" className={styles.secondary} disabled={locked||refreshingNow} onClick={()=>onRefresh(providerId)}>{refreshingNow?<Loader2 size={14} className={styles.spin}/>:<RefreshCw size={14}/>}刷新目录</button></div><p className={styles.ruleNote}>目录仅表示供应商提供该 ID，确认能力后才会进入可切换列表。{catalog?.stale&&"目录已过期，请刷新后添加。"}{catalog?.status==="error"&&catalog.error}</p><div className={styles.catalogList}>{discovered.slice(0,30).map(m=><div key={m.id}><code>{m.id}</code><button type="button" disabled={locked||refreshingNow||catalog?.stale||catalog?.status!=="ok"} onClick={()=>onRegister(providerId,m.id)}>添加并确认能力 <Plus size={13}/></button></div>)}</div>{discovered.length>30&&<p className={styles.ruleNote}>共 {discovered.length} 个待接入模型，输入模型 ID 可缩小范围。</p>}{!discovered.length&&<p className={styles.ruleNote}>没有匹配的待接入模型，可刷新目录或调整搜索。</p>}</section>}
    <p className={styles.ruleNote}>兼容筛选使用现有能力记录；旧接入能力未核验时会明确标注。此处不会自动发送付费生成请求。</p>
  </div><footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.primary} disabled={!selected || locked} onClick={() => onSave(selected)}>{busy && <Loader2 size={16} className={styles.spin} />}切换并生效</button></footer></Dialog>;
}
