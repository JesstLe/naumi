"use client";
import {useEffect,useState} from "react";
import type {ManagedModelRow} from "@/lib/model-config/management";
import type {ManagedModelCreditPricing} from "@/lib/model-config/credit-overrides";
import {authHeader} from "@/lib/supabase";
import {endpoint} from "./contracts";
import styles from "./model-management.module.css";
import {Dialog} from "./dialog";


const priceQualities=["low","medium","high","xhigh","max","auto"],priceResolutions=["1K","2K","4K","5K"];

const priceQualityNames:Record<string,string>={low:"低",medium:"标准",high:"高",xhigh:"超高",max:"最高",auto:"自动"};

export function PriceDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(features:string[],pricing:ManagedModelCreditPricing|null)=>void}){
  const views=row.pricing || [],first=views[0];
  const [selected,setSelected]=useState<string[]>(first?[first.feature]:[]),[active,setActive]=useState(first?.feature || ""),[mode,setMode]=useState(row.modality==="image"?"matrix":"fixed");
  const [amount,setAmount]=useState(first?.credits ?? NaN),[bulk,setBulk]=useState(first?.credits ?? NaN);
  type Draft={cells:import("@/lib/model-config/management").ManagedModelCreditGrid;prices:Record<string,Record<string,number|null>>};
  const [drafts,setDrafts]=useState<Record<string,Draft>>({}),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState("");
  useEffect(()=>{
    if(!active || drafts[active])return;let cancelled=false;setLoading(true);setLoadError("");
    void(async()=>{try{
      const res=await fetch(`${endpoint}?rowId=${encodeURIComponent(row.id)}&feature=${encodeURIComponent(active)}`,{cache:"no-store",headers:await authHeader()}),data=await res.json();
      if(!res.ok)throw Error(data.error || "价格表读取失败");if(cancelled)return;
      const cells=data.grid as Draft["cells"],prices=Object.fromEntries(priceQualities.map(q=>[q,Object.fromEntries(priceResolutions.map(r=>[r,null]))])) as Draft["prices"];
      for(const cell of cells)if(cell.available && cell.effectiveQuality===cell.quality)prices[cell.quality][cell.resolution]=cell.credits ?? NaN;
      setDrafts(old=>({...old,[active]:{cells,prices}}));
    }catch(e){if(!cancelled)setLoadError(e instanceof Error?e.message:"读取失败");}finally{if(!cancelled)setLoading(false);}})();
    return()=>{cancelled=true;};
  },[active,drafts,row.id]);
  const activeSource=views.find(v=>v.feature===active)?.source;
  const draft=drafts[active],validNumber=(n:unknown)=>typeof n==="number" && Number.isInteger(n)&&n>=0&&n<=2147483647;
  const valid=mode==="fixed"?validNumber(amount):!!draft && draft.cells.filter(c=>c.available).every(c=>validNumber(draft.prices[c.effectiveQuality]?.[c.resolution]));
  const editCell=(q:string,r:string,n:number)=>setDrafts(old=>({...old,[active]:{...old[active],prices:{...old[active].prices,[q]:{...old[active].prices[q],[r]:n}}}}));
  const fillAll=()=>{if(!draft || !validNumber(bulk))return;const prices=structuredClone(draft.prices);for(const c of draft.cells)if(c.available)prices[c.effectiveQuality][c.resolution]=bulk;setDrafts(old=>({...old,[active]:{...draft,prices}}));};
  const numberField=(label:string,value:number,set:(n:number)=>void)=><label className={styles.field}>{label}<input aria-label={label} type="number" min={0} max={2147483647} step={1} disabled={locked} value={Number.isNaN(value)?"":value} onChange={e=>set(e.target.value===""?NaN:Number(e.target.value))}/></label>;
  return <Dialog title="设置模型积分" locked={locked} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(valid && selected.length)onSave(selected,mode==="fixed"?{mode:"fixed",credits:amount}:{mode:"matrix",prices:draft.prices});}}><div className={styles.dialogBody}>
    {(error || loadError) && <p role="alert" className={styles.error}>{error || loadError}</p>}<div className={styles.scopeHeading}><b>{row.label}</b><span>{row.publicIds.length>1?"模型家族价格表":"模型价格表"}</span></div>
    <p className={styles.ruleNote}>每格是所选质量与分辨率的单价，按工具原单位（张/项/次）计费。比例沿用同一档价格，按张计费时再乘以张数。已开始的任务保留原报价。</p>
    {activeSource && <p role="status" className={styles.ruleNote} data-source={activeSource.kind}>当前生效来源：<b>{activeSource.label}</b>{activeSource.kind!=="model-rule"?"。在此保存后，本页积分设置优先于其他来源。":"。"}</p>}
    <label className={styles.field}>查看工具价格<select aria-label="查看工具价格" value={active} disabled={locked} onChange={e=>{setActive(e.target.value);setSelected(old=>old.includes(e.target.value)?old:[...old,e.target.value]);}}>{views.map(v=><option key={v.feature} value={v.feature}>{v.label}</option>)}</select><small>切换查看各工具的当前售价；逐格修改后，可应用到下面勾选的多个工具。</small></label>
    <div className={styles.scopeControls}><b>本次更新 {selected.length} 个工具</b><button type="button" disabled={locked} onClick={()=>setSelected(views.map(v=>v.feature))}>全选应用工具</button><button type="button" disabled={locked} onClick={()=>setSelected([])}>清空</button></div>
    <div className={`${styles.scopeGrid} ${styles.priceTools}`}>{views.map(v=><label className={styles.scopeOption} data-selected={selected.includes(v.feature)} key={v.feature}><input type="checkbox" aria-label={v.label} disabled={locked} checked={selected.includes(v.feature)} onChange={()=>setSelected(old=>old.includes(v.feature)?old.filter(x=>x!==v.feature):[...old,v.feature])}/><span><b>{v.label}</b><small>{v.estimated?"预估":"参考"} {v.credits ?? "待核对"} 积分/{v.unit==="image"?"张":v.unit==="item"?"项":"次"}{v.override?" · 已自定义":""}</small></span></label>)}</div>
    <label className={styles.field}>积分计价方式<select aria-label="积分计价方式" value={mode} disabled={locked} onChange={e=>setMode(e.target.value)}>{row.modality==="image" && <option value="matrix">质量 × 分辨率价格表</option>}<option value="fixed">所有可用规格统一积分</option></select></label>
    {mode==="fixed"?numberField("每单位消耗积分",amount,setAmount):<div className={styles.bulkPrice}>{numberField("批量填充积分",bulk,setBulk)}<button type="button" className={styles.secondary} disabled={locked || !draft || !validNumber(bulk)} onClick={fillAll}>填入所有可用规格</button></div>}
    {loading?<p role="status" className={styles.ruleNote}>正在读取当前价格表…</p>:draft && <div className={styles.priceTableScroll}><table className={styles.priceTable} aria-label="模型积分价格表"><caption>{views.find(v=>v.feature===active)?.label} · 每{views.find(v=>v.feature===active)?.unit==="image"?"张":views.find(v=>v.feature===active)?.unit==="item"?"项":"次"}消耗积分</caption><thead><tr><th scope="col">质量 / 分辨率</th>{priceResolutions.map(r=><th scope="col" key={r}>{r}</th>)}</tr></thead><tbody>{priceQualities.map(q=><tr key={q}><th scope="row">{priceQualityNames[q]}</th>{priceResolutions.map(r=>{const cell=draft.cells.find(c=>c.quality===q&&c.resolution===r)!,value=mode==="fixed"?amount:draft.prices[cell.effectiveQuality]?.[r];return <td key={r} data-unavailable={!cell.available}>{!cell.available?<span title="本系统当前能力配置未开放此规格">未开放</span>:cell.effectiveQuality!==q?<span title={`按${priceQualityNames[cell.effectiveQuality]}质量计价`}>{validNumber(value)?value:"待设置"}<small>按{priceQualityNames[cell.effectiveQuality]}</small></span>:<input aria-label={`${priceQualityNames[q]} · ${r} 积分`} type="number" min={0} max={2147483647} step={1} disabled={locked || mode==="fixed"} value={typeof value==="number"&&!Number.isNaN(value)?value:""} onChange={e=>editCell(q,r,e.target.value===""?NaN:Number(e.target.value))}/>}</td>;})}</tr>)}</tbody></table></div>}
    <p className={styles.scopeNote}>提交按钮按当前规格和数量显示实际报价。规格来自本系统的能力配置，并非自动逐项实测；未开放组合不能定价。发生质量映射时按实际执行档位计价。0 积分表示免费。采购成本和模型路由保留原配置。</p>
    </div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="button" className={styles.secondary} disabled={locked || !selected.length || !views.some(v=>selected.includes(v.feature)&&v.override)} onClick={()=>onSave(selected,null)}>恢复原计价</button><button type="submit" className={styles.primary} disabled={locked || loading || !selected.length || !valid}>保存积分并生效</button></footer></form></Dialog>;
}
