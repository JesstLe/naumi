"use client";
import {useEffect,useState} from "react";
import {authHeader} from "@/lib/supabase";
import type {ManagedModelCreditGrid,ManagedModelRow} from "@/lib/model-config/management";
import {endpoint} from "./contracts";
import styles from "./workspace.module.css";

const qualityNames:Record<string,string>={low:"低",medium:"标准",high:"高",xhigh:"超高",max:"最高",auto:"自动"};
const sourceNames:Record<string,string>={"model-rule":"模型积分设置",preset:"默认预设","feature-option":"功能模型定价","tariff-rule":"条件规则",tariff:"通用价目"};
export function EffectivePrices({row,feature,modelVersion,billingVersion,locked,onEdit}:{row:ManagedModelRow;feature:string;modelVersion:number;billingVersion?:number;locked:boolean;onEdit:()=>void}){
  const [snapshot,setSnapshot]=useState<{key:string;grid:ManagedModelCreditGrid}|null>(null),[error,setError]=useState(""),[reload,setReload]=useState(0);
  const key=JSON.stringify([row.id,feature,modelVersion,billingVersion]);
  const grid=snapshot?.key===key?snapshot.grid:null;
  const view=row.pricing?.find(price=>price.feature===feature);
  useEffect(()=>{
    setSnapshot(null);setError("");if(!feature)return;
    const abort=new AbortController();
    void(async()=>{try{
      const headers=await authHeader();if(abort.signal.aborted)return;
      const response=await fetch(`${endpoint}?rowId=${encodeURIComponent(row.id)}&feature=${encodeURIComponent(feature)}`,{headers,cache:"no-store",signal:abort.signal});
      const data=await response.json();if(abort.signal.aborted)return;
      if(!response.ok)throw Error(data.error||"价格表读取失败");
      if(data.version!==modelVersion || data.billingVersion!==billingVersion)throw Error("模型或计费版本已变化，请刷新工作区后查看");
      if(!Array.isArray(data.grid))throw Error("价格表数据不完整");setSnapshot({key,grid:data.grid});
    }catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:"价格表读取失败");}})();
    return()=>abort.abort();
  },[row.id,feature,modelVersion,billingVersion,reload,key]);
  if(!feature)return <p className={styles.empty}>尚未应用到工具，先设置应用范围。</p>;
  const qualities=[...new Set(grid?.filter(cell=>cell.available).map(cell=>cell.quality)||[])];
  const resolutions=[...new Set(grid?.map(cell=>cell.resolution)||[])];
  return <section aria-label={`${row.label} 有效售价`}>
    <div className={styles.sectionHeader}><h2>积分 / {view?.unit==="image"?"张":view?.unit==="item"?"项":"次"}</h2><button className={styles.primary} disabled={locked || !grid || !!error} onClick={onEdit}>设置积分</button></div>
    {view?.source&&<p className={styles.summary}>标准 1K 来源：{view.source.label} · 计费版本 {billingVersion ?? "未记录"}</p>}
    {error?<div className={`${styles.alert} ${styles.error}`} role="alert">{error} <button className={styles.link} onClick={()=>setReload(value=>value+1)}>重新读取</button></div>:!grid?<p role="status">正在读取生效价格…</p>:<div className={styles.tableWrap}><table className={`${styles.table} ${styles.matrix}`} aria-label="生效积分价格表"><thead><tr><th>质量 / 分辨率</th>{resolutions.map(value=><th key={value}>{value}</th>)}</tr></thead><tbody>{qualities.map(quality=><tr key={quality}><th>{qualityNames[quality]||quality}</th>{resolutions.map(resolution=>{
      const cell=grid.find(value=>value.quality===quality&&value.resolution===resolution);
      return <td key={resolution} data-available={!!cell?.available}>{!cell?.available?<span className={styles.muted}>未开放</span>:<><span className={styles.priceValue}>{cell.credits ?? "待核对"}</span>{cell.estimated&&<small>预估</small>}{cell.source&&cell.source!==view?.source?.kind&&<small>{sourceNames[cell.source]||cell.source}</small>}{cell.effectiveQuality!==quality&&<small>按{qualityNames[cell.effectiveQuality]||cell.effectiveQuality}计价</small>}</>}</td>;
    })}</tr>)}</tbody></table>{!qualities.length&&<p className={styles.empty}>没有已开放的规格。</p>}</div>}
  </section>;
}
