"use client";
import {useEffect,useRef,useState} from "react";
import {X} from "lucide-react";
import {authHeader} from "@/lib/supabase";
import type {SupplierMetadata,SupplierModelRecord} from "@/lib/supplier-models/types";
import {endpoint} from "./contracts";
import {useMetadataDraft} from "./use-metadata-draft";
import {IdentityFields} from "./identity-fields";
import {PriceFields} from "./price-fields";
import {MappingFields} from "./mapping-fields";
import styles from "../supplier-model-library.module.css";
export function MetadataDialog({model,onClose,onSave}:{model:SupplierModelRecord;onClose:()=>void;onSave:(metadata:SupplierMetadata,id:string)=>Promise<void>}){
 const form=useMetadataDraft(model,onSave);
 const {draft,busy,error,setError,change,editPrice,addPrice,texts,setTexts,parameterText,setParameterText,imported,submit}=form;
 const ref=useRef<HTMLDialogElement>(null),[history,setHistory]=useState<{revision:number;actor:string;createdAt:string}[]|null>(null);
 const specification=model.parameterMetadata.supplierSpecification as {modelUrl?:string;capabilityVersion?:string;observedAt?:string;model?:{parameters?:unknown[]}}|undefined;
 useEffect(()=>{ref.current?.showModal();},[]);
 const textField=(label:string,value:string,set:(value:string)=>void)=><label>{label}<input aria-label={label} disabled={busy} value={value} onChange={e=>set(e.target.value)}/></label>;
 const capabilityNames:Record<string,string>={generate:"生成",edit:"参考图 / 编辑",mask:"蒙版",vision:"图片理解",streaming:"流式输出"};
 return <dialog ref={ref} aria-labelledby="supplier-metadata-title" className={styles.dialog} onCancel={e=>{if(busy)e.preventDefault();}} onClose={onClose}><form onSubmit={e=>{e.preventDefault();void submit();}}>
  <header><div><h2 id="supplier-metadata-title">维护供应商模型元数据</h2><code>{model.providerName} / {model.modelId} · v{model.revision}</code></div><button type="button" aria-label="关闭元数据弹窗" disabled={busy} onClick={onClose}><X size={18}/></button></header>
  <div className={styles.body}>{error && <p role="alert" className={styles.error}>{error}</p>}
   {imported && <fieldset><legend>自动同步的上游资料</legend><dl className={styles.provenance}><dt>目录访问</dt><dd>{imported.accessibleWithCurrentKey===true?"可访问":imported.accessibleWithCurrentKey===false?"未开放":"未知"}</dd><dt>采集时间</dt><dd>{imported.observedAt?.slice(0,10)||"—"}</dd></dl>{imported.publicUrl && <a href={imported.publicUrl} target="_blank" rel="noreferrer">公开目录与报价来源</a>}<details><summary>查看原始规格、分组报价与计费单位</summary><textarea readOnly aria-label="自动采集上游资料" rows={10} value={JSON.stringify(imported,null,2)}/></details></fieldset>}
   {specification&&<fieldset><legend>供应商正式接口规格</legend><dl className={styles.provenance}><dt>资料版本</dt><dd>{specification.capabilityVersion||"—"}</dd><dt>采集时间</dt><dd>{specification.observedAt?.slice(0,10)||"—"}</dd></dl>{specification.modelUrl&&<a href={specification.modelUrl} target="_blank" rel="noreferrer">查看此模型正式文档</a>}<details><summary>查看官方参数定义与示例</summary><textarea readOnly aria-label="供应商正式参数定义" rows={8} value={JSON.stringify(specification.model,null,2)}/></details></fieldset>}
   <IdentityFields draft={draft} busy={busy} change={change} textField={textField} capabilityNames={capabilityNames} parameterText={parameterText} setParameterText={setParameterText}/>
   <PriceFields draft={draft} busy={busy} change={change} textField={textField} editPrice={editPrice} texts={texts} setTexts={setTexts} addPrice={addPrice}/>
   <MappingFields {...form}/>
   <button type="button" disabled={busy} onClick={async()=>{try{const res=await fetch(endpoint+"?history="+model.id,{cache:"no-store",headers:await authHeader()}),data=await res.json();if(!res.ok)throw Error(data.error);setHistory(data.versions);}catch(e){setError(e instanceof Error?e.message:"记录读取失败");}}}>查看修订记录</button>{history && <div className={styles.history}>{history.map(v=><p key={v.revision}>v{v.revision} · {v.actor} · {v.createdAt.slice(0,19).replace("T"," ")}</p>)}</div>}
  </div><footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button type="submit" className={styles.primary} disabled={busy}>{busy?"正在保存…":"保存元数据"}</button></footer>
 </form></dialog>;
}
