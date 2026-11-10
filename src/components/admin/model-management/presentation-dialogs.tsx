"use client";
import {useState} from "react";
import {ArrowUp,ArrowDown,Search} from "lucide-react";
import type {ManagedModelRow} from "@/lib/model-config/management";
import {types} from "./contracts";
import styles from "./model-management.module.css";
import {Dialog} from "./dialog";


export function OrderDialog({rows,locked,error,onClose,onSave}:{rows:ManagedModelRow[];locked:boolean;error:string;onClose:()=>void;onSave:(ids:string[])=>void}){
  const [ids,setIds]=useState(()=>rows.map(row=>row.id));
  const move=(index:number,delta:number)=>setIds(old=>{const next=[...old];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;});
  const changed=ids.some((id,i)=>id!==rows[i].id);
  return <Dialog title="调整模型排序" locked={locked} onClose={onClose}><div className={styles.dialogBody}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p className={styles.ruleNote}>上移、下移调整前端展示顺序。各工具只显示其已开放模型，沿用此顺序；同一家族的比例分支一起移动。默认模型和积分价格保持原配置。</p>
    <ol className={styles.orderList}>{ids.map((id,i)=>{const row=rows.find(r=>r.id===id)!;return <li key={id} data-testid={`model-order-${id}`}><span className={styles.orderNumber}>{i+1}</span><span className={styles.orderName}><b>{row.label}</b><small>{types[row.modality]} · {row.id}</small></span><button aria-label={`上移 ${row.label}`} disabled={locked || i===0} onClick={()=>move(i,-1)}><ArrowUp size={16}/></button><button aria-label={`下移 ${row.label}`} disabled={locked || i===ids.length-1} onClick={()=>move(i,1)}><ArrowDown size={16}/></button></li>;})}</ol>
  </div><footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.secondary} disabled={locked} onClick={()=>setIds(rows.map(row=>row.id))}>恢复当前顺序</button><button className={styles.primary} disabled={locked || !changed} onClick={()=>onSave(ids)}>保存排序并生效</button></footer></Dialog>;
}

export function ScopeDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(features:string[],canvas?:boolean)=>void}){
  const [selected,setSelected]=useState(()=>row.features.map(f=>f.id));
  const [search,setSearch]=useState("");
  const [canvas,setCanvas]=useState<boolean|undefined>(row.canvasUnified?true:undefined);
  const canvasOptions=row.scopeOptions.filter(o=>o.id.startsWith("canvas.")),canvasIds=canvasOptions.filter(o=>o.available).map(o=>o.id);
  const canvasChecked=Boolean(canvas || canvasIds.length&&canvasIds.every(id=>selected.includes(id)));
  const canvasPartial=!canvasChecked&&canvasIds.some(id=>selected.includes(id));
  const setCanvasScope=(value:boolean)=>{setCanvas(value);setSelected(old=>[...old.filter(id=>!id.startsWith("canvas.")),...(value?canvasIds:[])]);};
  const available=row.scopeOptions.filter(o=>o.available),shown=row.scopeOptions.filter(o=>o.label.includes(search.trim()));
  const toggle=(ids:string[])=>setSelected(old=>ids.every(id=>old.includes(id)) ? old.filter(id=>!ids.includes(id)) : [...new Set([...old,...ids])]);
  const effectiveCanvas=canvas===undefined&&canvasChecked?true:canvas;
  const changed=effectiveCanvas!==(row.canvasUnified?true:undefined) || selected.length!==row.features.length || selected.some(id=>!row.features.some(f=>f.id===id));
  const groups=[{id:"image",label:"生图与内容",test:(id:string)=>id.startsWith("image.") || id.startsWith("competitor.") || id.startsWith("video.")},{id:"tool",label:"编辑工具",test:(id:string)=>id.startsWith("tool.")}];
  return <Dialog title="选择应用工具" locked={locked} onClose={onClose}><div className={styles.dialogBody}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.scopeHeading}><b>{row.label}</b><span>已选 {selected.length} / {available.length} 项</span></div>
    <p className={styles.ruleNote}>{row.publicIds.length>1 ? "整个模型家族统一应用，包含所有比例分支。" : "勾选此模型可应用的工具。"}勾选“画布”一次，自动覆盖能力符合的画布模块。图片与文字模型分别选择，不会互相替代。</p>
    <div className={styles.scopeControls}><button className={styles.secondary} disabled={locked} onClick={()=>{setSelected(available.map(o=>o.id));if(canvasIds.length)setCanvas(true);}}>全选可用工具</button><button disabled={locked} onClick={()=>{setSelected([]);setCanvas(false);}}>清空选择</button><button disabled={locked} onClick={()=>{setSelected(row.features.map(f=>f.id));setCanvas(row.canvasUnified?true:undefined);}}>恢复当前范围</button></div>
    <label className={styles.search}><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="查找工具" aria-label="查找应用工具" /></label>
    <div className={styles.scopeGroups}>{groups.map(group=>{const options=shown.filter(o=>group.test(o.id)),ids=options.filter(o=>o.available).map(o=>o.id);if(!options.length)return null;return <fieldset key={group.id} disabled={locked}><legend><b>{group.label}</b><button disabled={locked || !ids.length} onClick={()=>toggle(ids)}>{ids.length && ids.every(id=>selected.includes(id)) ? "取消本组" : "选择本组"}</button></legend><div className={styles.scopeGrid}>{options.map(o=><label key={o.id} className={styles.scopeOption} data-selected={selected.includes(o.id)} data-disabled={!o.available}><input type="checkbox" aria-label={o.label} disabled={!o.available || locked} checked={selected.includes(o.id)} onChange={()=>toggle([o.id])}/><span><b>{o.label}</b>{o.adminDefault && o.available && <small>设为工具默认</small>}{o.reason && <small>{o.reason}</small>}</span></label>)}</div></fieldset>;})}</div>
    {canvasOptions.length>0 && <fieldset disabled={locked} className={styles.parameterRoute}><legend>画布系统</legend><label className={styles.scopeOption}><input type="checkbox" aria-label="画布" checked={canvasChecked} ref={input=>{if(input)input.indeterminate=canvasPartial;}} disabled={locked || !canvasIds.length} onChange={e=>setCanvasScope(e.target.checked)}/><span><b>应用到画布</b><small>统一开放符合能力的{row.modality==="image"?"图片生成／编辑":"文字／图片理解"}模块</small>{canvasPartial && <small>旧配置仅开放部分模块，勾选后统一管理</small>}</span></label><details><summary>查看具体模块（{canvasIds.length} 类用途可用）</summary><ul className={styles.canvasModules}>{canvasOptions.map(o=><li key={o.id}><b>{o.id==="canvas.image"?"生图、换背景、换视角、文案图、Agent 出图":o.label}</b><span>{o.available?(selected.includes(o.id)?"已开放":"可开放"):o.reason}</span></li>)}{row.modality==="image" && <li><b>A+ 内容图</b><span>随画布图片池，保留 A+ 原售价与生成能力校验</span></li>}</ul></details></fieldset>}
    {!shown.length && <p className={styles.ruleNote}>没有匹配的工具。</p>}
    <p className={styles.scopeNote}>移出范围后，用户不能再在该工具选择此模型。默认模型会使用现有可用替代项；没有替代项时将提示先配置。供应商路由和售价保持原配置。</p>
    </div><footer className={styles.dialogFooter}><button className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button className={styles.primary} disabled={locked || !changed} onClick={()=>onSave(selected,effectiveCanvas)}>保存范围并生效</button></footer></Dialog>;
}

export function RenameDialog({ row, locked, error, onClose, onSave }: { row: ManagedModelRow; locked: boolean; error: string; onClose: () => void; onSave: (publicId: string, label: string) => void }) {
  const [label, setLabel] = useState(row.label), [publicId, setPublicId] = useState(row.id);
  const validId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(publicId.trim());
  const changed = publicId.trim() !== row.id || label.trim() !== row.label;
  return <Dialog title="名称与公开 ID" onClose={onClose} locked={locked}><form onSubmit={e => { e.preventDefault(); if (!locked && changed && validId && label.trim()) onSave(publicId.trim(),label.trim()); }}><div className={styles.dialogBody}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <label className={styles.field}>显示名称<input aria-label="显示名称" autoFocus required maxLength={100} value={label} onChange={e => setLabel(e.target.value)} disabled={locked}/></label>
    <label className={styles.field}>公开 ID<input aria-label="公开 ID" required maxLength={100} value={publicId} onChange={e => setPublicId(e.target.value)} disabled={locked} spellCheck={false}/><small>前端提交使用；字母、数字及 . _ : -</small></label>
    <button type="button" className={styles.secondary} disabled={locked || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(label.trim())} onClick={()=>setPublicId(label.trim())}>使用显示名称作为 ID</button>
    <p className={styles.ruleNote}>旧 ID 自动兼容已保存的选择。实际调用型号在供应通道中设置，售价保持原配置。{row.publicIds.length > 1 && "家族比例分支一起更新。"}</p>
    </div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="submit" className={styles.primary} disabled={locked || !validId || !label.trim() || !changed}>保存并生效</button></footer></form></Dialog>;
}
