"use client";
import {useState} from "react";
import {Loader2,Plus,RefreshCw,Search} from "lucide-react";
import {imageModelDisplayId} from "@/lib/image-model-routing";
import {type ChannelPolicy,CHANNEL_PROTOCOLS} from "@/lib/model-config/channel-policy";
import type {ManagedModelRow} from "@/lib/model-config/management";
import type {State} from "./contracts";
import channelStyles from "./channel-policy-editor.module.css";
import {ChannelPolicyEditor} from "./channel-policy-editor";
import styles from "./model-management.module.css";
import {Dialog} from "./dialog";


export function ChannelsDialog({row,state,initial,refreshing,locked,error,onRefresh,onRegister,onClose,onSave}:{row:ManagedModelRow;state:State;initial:ChannelPolicy|null;refreshing:string[];locked:boolean;error:string;onRefresh:(id:string)=>void;onRegister:(providerId:string,model:string,draft:ChannelPolicy)=>void;onClose:()=>void;onSave:(policy:ChannelPolicy|null)=>void}){
 const [mode,setMode]=useState<ChannelPolicy["mode"]>(initial?.mode||row.supplierRouting?.mode||"balanced");
 const [channels,setChannels]=useState<ChannelPolicy["channels"]>(()=>initial?.channels||row.supplierRouting?.channels||row.routes.slice(0,1).map(r=>({upstreamId:r.upstreamId,enabled:true,priority:1,weight:1})));
 const candidateGroups=new Set<string>();const candidates=state.candidates.filter(c=>c.modality===row.modality&&(c.channelCompatible??CHANNEL_PROTOCOLS.includes(state.providers.find(p=>p.id===c.providerId)?.protocol||""))&&(row.modality!=="text"||row.candidateIds.includes(c.id))).filter(c=>{const key=c.providerId+":"+(row.modality==="image"?imageModelDisplayId(c.model):c.model);if(channels.some(ch=>ch.upstreamId===c.id)){candidateGroups.add(key);return true;}if(candidateGroups.has(key))return false;candidateGroups.add(key);return true;}),available=candidates.filter(c=>!channels.some(ch=>ch.upstreamId===c.id));
 const [adding,setAdding]=useState("");const update=(id:string,patch:Partial<ChannelPolicy["channels"][number]>)=>setChannels(old=>old.map(c=>c.upstreamId===id?{...c,...patch}:c));
 const valid=channels.some(c=>c.enabled)&&channels.every(c=>Number.isInteger(c.priority)&&c.priority>=1&&c.priority<=100&&Number.isInteger(c.weight)&&c.weight>=1&&c.weight<=1000);
 return <Dialog title="供应通道与分流" locked={locked} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(valid)onSave({mode,channels});}}><div className={styles.dialogBody}>
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 <ChannelPolicyEditor row={row} state={state} channels={channels} mode={mode} locked={locked} onMode={setMode} onUpdate={update} onRemove={id=>setChannels(old=>old.filter(v=>v.upstreamId!==id))}/>
 <section className={channelStyles.addSection}><h3>新增通道</h3><div className={channelStyles.addControls}>
 <label className={styles.field}>添加供应通道<select aria-label="添加供应通道" value={adding} disabled={locked||channels.length>=20} onChange={e=>setAdding(e.target.value)}><option value="">选择已接入的实际模型</option>{[...new Set(available.map(c=>c.providerId))].map(id=><optgroup key={id} label={state.providers.find(p=>p.id===id)?.name||id}>{available.filter(c=>c.providerId===id).map(c=><option key={c.id} value={c.id}>{c.model}</option>)}</optgroup>)}</select></label><button type="button" className={styles.secondary} disabled={locked||!adding||channels.length>=20} onClick={()=>{setChannels(old=>[...old,{upstreamId:adding,enabled:true,priority:1,weight:1}]);setAdding("");}}>添加通道</button>
 </div><details className={channelStyles.directory}><summary>从上游目录接入新模型</summary><ChannelDirectory row={row} state={state} refreshing={refreshing} locked={locked||channels.length>=20} onRefresh={onRefresh} onRegister={(providerId,model)=>onRegister(providerId,model,{mode,channels})}/></details></section>
 <details className={channelStyles.help}><summary>调度与失败处理规则</summary><p>{row.modality==="text"?"通道报错、超时、返回空结果，或流式输出开始前失败时，自动尝试其他可用通道；已输出文字后中断不会拼接其他模型回答。":"同步通道失败时可尝试其他通道；异步任务受理后仅查询原任务，受理不明时暂停核查。"}每条通道最多尝试一次，成功后只结算一次积分；全部失败才结束任务。连续失败的通道会暂停并尝试恢复。</p></details>
 </div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="button" className={styles.secondary} disabled={locked||!row.supplierRouting} onClick={()=>onSave(null)}>恢复单通道</button><button className={styles.primary} disabled={locked||!valid}>保存通道并生效</button></footer></form></Dialog>;
}

function ChannelDirectory({row,state,refreshing,locked,onRefresh,onRegister}:{row:ManagedModelRow;state:State;refreshing:string[];locked:boolean;onRefresh:(id:string)=>void;onRegister:(providerId:string,model:string)=>void}){
 const providers=state.providers.filter(p=>p.enabled&&p.configured&&CHANNEL_PROTOCOLS.includes(p.protocol)&&(row.modality==="text"?p.protocol==="openai-chat":p.protocol!=="openai-chat"));
 const [providerId,setProviderId]=useState(""),[query,setQuery]=useState("");
 const catalog=state.catalogs.find(c=>c.providerId===providerId),refreshingNow=refreshing.includes(providerId);
 const matches=(catalog?.models||[]).filter(m=>m.id.toLowerCase().includes(query.toLowerCase())),missing=matches.filter(m=>!state.candidates.some(c=>c.providerId===providerId&&c.model===m.id));
 return <section aria-label="新增通道来源"><h3>从已接入上游新增通道</h3><p className={styles.ruleNote}>先选择上游，再添加并确认实际模型；返回后从“添加供应通道”中选入本模型。{row.modality==="text"&&row.features.some(f=>["canvas.assistant","canvas.ocr"].includes(f.id))&&"当前用途需要图片理解能力。"}</p><label className={styles.field}>已接入上游<select aria-label="新增通道的上游来源" value={providerId} disabled={locked} onChange={e=>{setProviderId(e.target.value);setQuery("");}}><option value="">选择上游来源</option>{providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{providerId&&<><button type="button" className={styles.secondary} disabled={locked||refreshingNow} onClick={()=>onRefresh(providerId)}>{refreshingNow?<Loader2 size={14} className={styles.spin}/>:<RefreshCw size={14}/>}刷新此上游目录</button><label className={styles.search}><Search size={14}/><input aria-label="搜索新增通道模型" placeholder="搜索实际模型 ID" value={query} onChange={e=>setQuery(e.target.value)}/></label><p className={styles.ruleNote}>{catalog?.stale?"目录已过期，请刷新后添加。":catalog?.status==="error"?catalog.error:"目录仅代表模型 ID 可访问，不代表全部能力已验证。"}</p><div className={styles.catalogList}>{missing.slice(0,30).map(m=><div key={m.id}><code>{m.id}</code><button type="button" disabled={locked||refreshingNow||catalog?.stale||catalog?.status!=="ok"} onClick={()=>onRegister(providerId,m.id)}>添加并确认能力 <Plus size={13}/></button></div>)}</div>{!missing.length&&<p className={styles.ruleNote}>{matches.length?"匹配模型已接入，兼容的模型可从上方“添加供应通道”选入；不满足用途能力的模型需先核对能力。":"暂无匹配模型，请刷新目录或调整搜索。"}</p>}{missing.length>30&&<p className={styles.ruleNote}>共 {missing.length} 个待接入模型，请搜索缩小范围。</p>}</>}</section>;
}
