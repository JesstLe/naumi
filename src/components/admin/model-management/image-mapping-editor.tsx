"use client";
import {useState} from 'react';
import type {ManagedModelRow} from '@/lib/model-config/management';
import {compileImageParameterPlan} from '@/lib/model-config/image-parameter-plan';
import {DEFAULT_QUALITY_LABELS,DISPLAY_QUALITY_IDS} from '@/lib/model-config/quality-policy';
import {RESOLUTION_FIELDS,RATIO_FIELDS} from '@/lib/model-config/resolution-policy';
import type {ImageMappingEditorInput} from '@/lib/model-config/image-mapping-editor';
import styles from './model-management.module.css';

type ResolutionMode='map'|'omit'|'legacy';
type Meta={values:Record<string,string>;nativeValues:string[];source:string;checkedAt:string;available:boolean}|null|undefined;
const has=(list:string[],value:string)=>list.some(v=>v.toLowerCase()===value.trim().toLowerCase());

export function ImageMappingEditor({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(value:ImageMappingEditorInput)=>void}){
 const [qualities,setQualities]=useState<string[]>(row.qualityConfig?.choices.map(c=>c.id)||['medium']);
 const [resolutions,setResolutions]=useState<string[]>(row.displayResolutions||['1K','2K','4K']);
 const [routes,setRoutes]=useState(()=>row.parameterSources?.map(s=>{
  const q=row.qualityConfig?.routes.find(r=>r.upstreamId===s.id),r=row.resolutionConfig?.routes.find(r=>r.upstreamId===s.id);
  // A channel without a published resolution policy keeps the protocol's own size fields; APIMart contracts require one.
  const resolutionMode:ResolutionMode=r?.mode==='omit'?'omit':r?.mode==='legacy'&&!s.parameterMap.apimartImages?'legacy':'map';
  return {source:s,conventional:s.parameterMap.parameterContract==='conventional',qualityMode:q?.mode||'omit',qualityValues:{...q?.values} as Record<string,string>,resolutionMode,field:r?.field||'resolution',ratioField:r?.ratioField,values:{...r?.values} as Record<string,string>,
   qualityMeta:q?.metadataDefaults as Meta,resolutionMeta:r?.metadataDefaults as Meta};
 })||[]);
 const [ratio,setRatio]=useState('1:1');
 const routePayload=(r:typeof routes[number]):ImageMappingEditorInput['routes'][number]=>({upstreamId:r.source.id,contract:r.conventional?'conventional':null,
  quality:{mode:r.qualityMode as 'map'|'omit'|'passthrough',choices:qualities.map(id=>({id:id as 'medium',label:DEFAULT_QUALITY_LABELS[id as 'medium'],...(r.qualityMode==='map'&&(!r.conventional||r.qualityValues[id]?.trim())?{value:r.qualityValues[id]}:{})}))},
  resolution:r.resolutionMode==='legacy'?null:{mode:r.resolutionMode,field:r.field,ratioField:r.ratioField,values:r.conventional?Object.fromEntries(Object.entries(r.values).filter(([,v])=>v?.trim())):r.values}});
 const payload=():ImageMappingEditorInput=>({qualities:qualities as ImageMappingEditorInput['qualities'],resolutions:resolutions as ImageMappingEditorInput['resolutions'],routes:routes.map(routePayload)});
 const previews=routes.map(r=>{try{const p=routePayload(r),source={...r.source,parameterMap:{...r.source.parameterMap,qualityPolicy:p.quality,resolutionPolicy:p.resolution||undefined,parameterContract:r.conventional?'conventional' as const:undefined}};return {wire:compileImageParameterPlan(source,{quality:qualities[0]||'medium',resolution:resolutions.at(-1)||'1K',ratio},{publicModelId:row.publicIds[0],protocol:r.source.protocol,modelVersion:0}).wire,error:''};}catch(e){return {wire:null,error:e instanceof Error?e.message:'映射无效'};}});
 const complete=(r:typeof routes[number])=>r.conventional||(r.qualityMode!=='map'||qualities.every(q=>r.qualityValues[q]?.trim()))&&(r.resolutionMode!=='map'||resolutions.every(v=>r.values[v]?.trim()));
 const valid=qualities.length>0&&resolutions.length>0&&routes.length>0&&routes.every(complete)&&previews.every(p=>!p.error);
 const patch=(i:number,value:Partial<typeof routes[number]>)=>setRoutes(old=>old.map((r,n)=>n===i?{...r,...value}:r));
 const toggle=(values:string[],id:string,set:(v:string[])=>void)=>set(values.includes(id)?values.filter(x=>x!==id):[...values,id]);
 // Supplier facts are hints only: they never block saving.
 const qualityHint=(r:typeof routes[number],id:string)=>{const native=r.qualityMeta?.nativeValues||[],v=r.qualityValues[id]?.trim();if(!native.length)return '';if(v)return has(native,v)?'':`资料未列出 ${v}`;return r.conventional&&!has(native,id)?`将发送 ${id}，资料未列出`:'';};
 const resolutionHint=(r:typeof routes[number],tier:string)=>{const native=r.resolutionMeta?.nativeValues||[],v=r.values[tier]?.trim();if(!native.length)return '';if(v)return has(native,v)?'':`资料未列出 ${v}`;return r.conventional&&!has(native,tier)?`资料支持 ${native.join(' / ')}，留空按协议原值发送`:'';};
 const fillFromLibrary=(i:number)=>{const r=routes[i],qv={...r.qualityValues},rv={...r.values};
  for(const id of qualities)if(!qv[id]?.trim()&&r.qualityMeta?.values[id])qv[id]=r.qualityMeta.values[id];
  for(const tier of resolutions)if(!rv[tier]?.trim()&&r.resolutionMeta?.values[tier])rv[tier]=r.resolutionMeta.values[tier];
  patch(i,{qualityValues:qv,values:rv,...(r.qualityMode!=='map'&&Object.keys(qv).length?{qualityMode:'map'}:{}),...(r.resolutionMode==='legacy'&&Object.keys(rv).length?{resolutionMode:'map' as ResolutionMode}:{})});};
 const summary=(r:typeof routes[number])=>{
  const mapped=(r.qualityMode==='map'?qualities.filter(q=>r.qualityValues[q]?.trim()).length:0)+(r.resolutionMode==='map'?resolutions.filter(t=>r.values[t]?.trim()).length:0);
  const empty=(r.qualityMode==='map'?qualities.length:0)+(r.resolutionMode==='map'?resolutions.length:0)-mapped;
  const hints=qualities.filter(q=>r.qualityMode==='map'&&qualityHint(r,q)).length+resolutions.filter(t=>r.resolutionMode==='map'&&resolutionHint(r,t)).length;
  return [mapped&&`${mapped} 格已映射`,empty&&(r.conventional?`${empty} 格按默认`:`${empty} 格待填`),hints&&`${hints} 处提示`].filter(Boolean).join(' · ');
 };
 const facts=(meta:Meta,fallback:string[]=[])=>{const list=meta?.nativeValues?.length?meta.nativeValues:fallback;return list.length?list.join(' / '):'未维护';};
 const section=(r:typeof routes[number],i:number)=><section key={r.source.id} className={styles.parameterRoute}>
  <h3>{r.source.provider} · {r.source.model}<span className={styles.mappingSummary}>{summary(r)}</span></h3>
  <div className={styles.mappingSupplier}><span>供应商资料：质量 <strong>{facts(r.qualityMeta)}</strong> · 分辨率 <strong>{facts(r.resolutionMeta,r.source.nativeResolutions)}</strong>{(r.resolutionMeta||r.qualityMeta)?.checkedAt?`（${(r.resolutionMeta||r.qualityMeta)!.source}，${(r.resolutionMeta||r.qualityMeta)!.checkedAt.slice(0,10)}）`:''}</span>
   {(r.qualityMeta?.available||r.resolutionMeta?.available)&&<button type="button" onClick={()=>fillFromLibrary(i)}>按资料填充空格</button>}</div>
  <datalist id={`${r.source.id}-quality-values`}>{(r.qualityMeta?.nativeValues||[]).map(v=><option key={v} value={v}/>)}</datalist>
  <datalist id={`${r.source.id}-resolution-values`}>{(r.resolutionMeta?.nativeValues||[]).map(v=><option key={v} value={v}/>)}</datalist>
  <label className={styles.field}><span><input type="checkbox" aria-label={`${r.source.id}按协议默认发送`} checked={r.conventional} onChange={e=>patch(i,{conventional:e.target.checked})}/> 按协议默认发送，只填需要改的格子</span></label>
  <label className={styles.field}>质量处理<select aria-label={`${r.source.id}质量处理`} value={r.qualityMode} onChange={e=>patch(i,{qualityMode:e.target.value as typeof r.qualityMode})}><option value="map">映射</option><option value="passthrough">原值发送</option><option value="omit">不发送</option></select></label>
  <table className={styles.mappingTable}><thead><tr><th>前端选项</th><th>上游字段</th><th>上游值</th></tr></thead><tbody>{qualities.map(q=>{const hint=r.qualityMode==='map'?qualityHint(r,q):'';return <tr key={q}><td>{q}</td><td>quality</td><td>{r.qualityMode==='map'?<><input aria-label={`${r.source.id} ${q}映射`} list={`${r.source.id}-quality-values`} placeholder={r.conventional?`留空发送 ${q}`:undefined} data-hint={hint?'true':undefined} value={r.qualityValues[q]||''} onChange={e=>patch(i,{qualityValues:{...r.qualityValues,[q]:e.target.value}})}/>{hint&&<span className={styles.mappingHint}>{hint}</span>}</>:r.qualityMode==='omit'?'不发送':q}</td></tr>;})}</tbody></table>
  <label className={styles.field}>分辨率处理<select aria-label={`${r.source.id}分辨率处理`} value={r.resolutionMode} onChange={e=>patch(i,{resolutionMode:e.target.value as ResolutionMode})}><option value="map">映射</option><option value="omit">不发送</option>{!r.source.parameterMap.apimartImages&&<option value="legacy">沿用协议（不覆盖）</option>}</select></label>
  {r.resolutionMode!=='legacy'&&<label className={styles.field}>分辨率字段<select value={r.field} onChange={e=>patch(i,{field:e.target.value as typeof r.field})}>{RESOLUTION_FIELDS.map(f=><option key={f}>{f}</option>)}</select></label>}
  <table className={styles.mappingTable}><tbody>{resolutions.map(v=>{const hint=r.resolutionMode==='map'?resolutionHint(r,v):'';return <tr key={v}><td>{v}</td><td>{r.resolutionMode==='legacy'?'协议原值':r.field}</td><td>{r.resolutionMode==='map'?<><input aria-label={`${r.source.id} ${v}映射`} list={`${r.source.id}-resolution-values`} placeholder={r.conventional?'留空保持协议原值':undefined} data-hint={hint?'true':undefined} value={r.values[v]||''} onChange={e=>patch(i,{values:{...r.values,[v]:e.target.value}})}/>{hint&&<span className={styles.mappingHint}>{hint}</span>}</>:r.resolutionMode==='omit'?'不发送':'不覆盖'}</td></tr>;})}</tbody></table>
  {r.resolutionMode!=='legacy'&&<details><summary>比例字段</summary><label className={styles.field}>比例字段<select value={r.ratioField||''} onChange={e=>patch(i,{ratioField:e.target.value as typeof r.ratioField||undefined})}><option value="">沿用协议</option>{RATIO_FIELDS.filter(f=>f!==r.field).map(f=><option key={f}>{f}</option>)}</select></label></details>}
  {previews[i].error&&<p role="alert" className={styles.error}>{previews[i].error}</p>}
  <details open={r.source.enabled!==false}><summary>实际请求预览 · {qualities[0]} / {resolutions.at(-1)}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',background:'#f5f7fb',padding:12,borderRadius:8,color:'#1e293b'}}>{JSON.stringify(previews[i].wire,null,2)}</pre></details>
 </section>;
 const active=routes.map((r,i)=>[r,i] as const).filter(([r])=>r.source.enabled!==false),stopped=routes.map((r,i)=>[r,i] as const).filter(([r])=>r.source.enabled===false);
 return <form onSubmit={e=>{e.preventDefault();if(valid)onSave(payload());}}><fieldset className={styles.dialogBody} disabled={locked}>
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 <section><h3>前端选项</h3><div className={styles.parameterOptionRow}>{DISPLAY_QUALITY_IDS.map(q=><button type="button" key={q} aria-pressed={qualities.includes(q)} onClick={()=>toggle(qualities,q,setQualities)}>{DEFAULT_QUALITY_LABELS[q]}</button>)}</div><div className={styles.parameterOptionRow}>{['1K','2K','4K'].map(r=><button type="button" key={r} aria-pressed={resolutions.includes(r)} onClick={()=>toggle(resolutions,r,setResolutions)}>{r}</button>)}</div></section>
 {active.map(([r,i])=>section(r,i))}
 {stopped.length>0&&<details className={styles.mappingStopped} open={stopped.some(([r,i])=>!complete(r)||!!previews[i].error)}><summary>已停用通道（{stopped.length}）</summary>{stopped.map(([r,i])=>section(r,i))}</details>}
 <label className={styles.field}>预览比例<input style={{minWidth:0,width:"100%",boxSizing:"border-box"}} value={ratio} onChange={e=>setRatio(e.target.value)}/></label></fieldset>
 <footer className={styles.dialogFooter}><button type="button" className={styles.secondary} onClick={onClose} disabled={locked}>取消</button><button className={styles.primary} disabled={locked||!valid}>保存映射并生效</button></footer></form>;
}
