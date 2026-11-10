"use client";
import Link from "next/link";
import {useState} from "react";
import {ChevronLeft,Database,Download,RefreshCw} from "lucide-react";
import {states,bases,modalities,type Filter} from "./supplier-library/contracts";
import {costSummary} from "./supplier-library/presentation";
import {MetadataDialog} from "./supplier-library/metadata-dialog";
import {useSupplierLibrary} from "./supplier-library/use-supplier-library";
import styles from "./supplier-model-library.module.css";
export function SupplierModelLibrary(){
 const [search,setSearch]=useState("");
 const {filter,setFilter,listing,choices,loading,busy,error,notice,edit,opening,exporting,load,openModel,closeModel,exportPage,change,sync,save}=useSupplierLibrary();
 return <main className={styles.page}>
  <div className={styles.top}><Link href="/admin/model-management"><ChevronLeft size={15}/>返回模型管理</Link></div>
  <header className={styles.hero}><h1>供应商资料库</h1><div className={styles.actions}><button disabled={busy} onClick={()=>void sync(false)}>导入配置与缓存</button><button className={styles.primary} disabled={busy} onClick={()=>void sync(true)}><RefreshCw size={15}/>同步上游目录</button></div></header>
  {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
  <section className={styles.filters} aria-label="元数据筛选">
   <form onSubmit={e=>{e.preventDefault();change("q",search);}}><input aria-label="搜索供应商模型" placeholder="模型 ID、名称、家族或品牌" value={search} onChange={e=>setSearch(e.target.value)}/><button type="submit">搜索</button></form>
   {([["provider","供应商",choices?[...new Map([...choices.providers,...choices.facets.providers].map(p=>[p.id,p])).values()].map(p=>[p.id,p.name]):[]],["family","模型家族",choices?.facets.families.map(f=>[f,f]) || []],["brand","品牌",choices?.facets.brands.map(b=>[b,b]) || []],["basis","计费方式",Object.entries(bases)],["state","能力信息状态",Object.entries(states)]] as [keyof Filter,string,string[][]][]).map(([key,label,options])=><label key={key}>{label}<select aria-label={label} value={filter[key]} onChange={e=>change(key,e.target.value)}><option value="">全部</option>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>)}
  </section>
  <div className={styles.resultBar}><span>{loading?"正在读取…":listing?`${listing.total} 条模型元数据`:""}</span><div><button disabled={!listing||loading||exporting} onClick={()=>void exportPage()}><Download size={14}/>导出当前页</button><button aria-label="刷新元数据库" disabled={loading} onClick={()=>void load()}><RefreshCw size={14}/></button></div></div>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>模型 / 家族</th><th>供应商 / 品牌</th><th>能力依据</th><th>采购报价参考</th><th>操作</th></tr></thead><tbody>{listing?.models.map(m=><tr key={m.id}><td><b>{m.label}</b><code>{m.modelId}</code><small>{[m.family,modalities[m.modality]].filter(Boolean).join(" · ")}</small></td><td><b>{m.providerName}</b>{m.brand&&<small>{m.brand}</small>}{m.catalogOwner && <small>目录 owner：{m.catalogOwner}</small>}</td><td><span className={styles.badge} data-state={m.capabilityState}>{states[m.capabilityState]}</span>{!!m.capabilities.resolutions?.length&&<small>{m.capabilities.resolutions.join(" / ")}</small>}{m.capabilitySource&&<small>{m.capabilitySource}</small>}{m.checkedAt&&<small>{m.checkedAt}</small>}</td><td><b className={styles.cost}>{costSummary(m.prices[0])}</b><small>{m.prices.length?`${m.prices.length} 个报价规格 · ${m.prices[0].status==="unknown"?"来源待核实":m.prices[0].status==="estimate"?"估算":m.prices[0].status==="documented"?"文档报价":"已验证"}`:""}</small>{m.prices[0] && <small>{m.prices[0].checkedAt?`报价核对 ${m.prices[0].checkedAt}`:"报价日期待核对"}</small>}</td><td><button disabled={opening!==null} onClick={()=>void openModel(m.id)} data-testid={"metadata-edit-"+m.modelId}>{opening===m.id?"读取中…":"维护元数据"}</button><small>v{m.revision}</small></td></tr>)}</tbody></table></div>
  {!loading && !error && !listing?.models.length && <div className={styles.empty}><Database/><h2>没有匹配的模型元数据</h2></div>}
  {listing && <footer className={styles.pagination}><button disabled={listing.page<=1 || loading} onClick={()=>setFilter(old=>({...old,page:old.page-1}))}>上一页</button><span>{listing.page} / {Math.max(1,Math.ceil(listing.total/listing.pageSize))}</span><button disabled={listing.page*listing.pageSize>=listing.total || loading} onClick={()=>setFilter(old=>({...old,page:old.page+1}))}>下一页</button></footer>}
  {edit && <MetadataDialog model={edit} onClose={closeModel} onSave={(metadata,id)=>save(edit,metadata,id)}/>}
 </main>;
}
