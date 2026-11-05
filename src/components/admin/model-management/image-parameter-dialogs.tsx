"use client";
import {useEffect,useState} from "react";
import type {ManagedModelRow} from "@/lib/model-config/management";
import {DISPLAY_QUALITY_IDS,DEFAULT_QUALITY_LABELS} from "@/lib/model-config/quality-policy";
import {RESOLUTION_FIELDS,RATIO_FIELDS,type ResolutionParameters} from "@/lib/model-config/resolution-policy";
import styles from "./model-management.module.css";
import {Dialog} from "./dialog";


export function ParametersDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(value:{choices:{id:string;label:string}[];routes:NonNullable<ManagedModelRow["qualityConfig"]>["routes"]}|null)=>void}){
  const initial=row.qualityConfig!;
  const [choices,setChoices]=useState(initial.choices),[routes,setRoutes]=useState(initial.routes);
  useEffect(()=>setRoutes(old=>old.map(route=>({...route,metadataDefaults:initial.routes.find(r=>r.upstreamId===route.upstreamId)?.metadataDefaults || null}))),[initial.routes]);
  const patchRoute=(index:number,patch:Partial<typeof routes[number]>)=>setRoutes(old=>old.map((route,i)=>i===index?{...route,...patch}:route));
  const valid=choices.length>0 && choices.every(c=>c.label.trim()) && routes.every(r=>r.mode!=="map" || choices.every(c=>r.values[c.id]?.trim()));
  const payload=()=>({choices,routes:routes.map(({upstreamId,mode,values,evidence,metadataRef})=>({upstreamId,mode,values,evidence,metadataRef})) as typeof routes});
  return <Dialog title="模型参数设置" locked={locked} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(valid)onSave(payload());}}><div className={styles.dialogBody}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.scopeHeading}><b>{row.label}</b><span>显示档位 → 实际传参</span></div>
    <p className={styles.ruleNote}>前端名称是平台展示档位，不等于供应商原生质量。关闭档位会同时从前端和可定价规格中移除；选择“不发送”时，上游使用自己的默认处理。积分售价继续在“设置积分”维护。</p>
    <div className={styles.scopeControls}><b>前端显示</b><button type="button" disabled={locked} onClick={()=>setChoices(DISPLAY_QUALITY_IDS.map(id=>({id,label:choices.find(c=>c.id===id)?.label || DEFAULT_QUALITY_LABELS[id]})))}>启用五档</button></div>
    <div className={styles.parameterChoices}>{DISPLAY_QUALITY_IDS.map(id=>{const choice=choices.find(c=>c.id===id);return <label key={id} className={styles.parameterChoice}><input type="checkbox" aria-label={`启用${DEFAULT_QUALITY_LABELS[id]}档`} disabled={locked} checked={!!choice} onChange={e=>setChoices(old=>e.target.checked?DISPLAY_QUALITY_IDS.filter(q=>q===id||old.some(c=>c.id===q)).map(q=>old.find(c=>c.id===q)||{id:q,label:DEFAULT_QUALITY_LABELS[q]}):old.filter(c=>c.id!==id))}/><span><b>{DEFAULT_QUALITY_LABELS[id]}</b><small>{id}</small></span><input aria-label={`${id}显示名称`} disabled={locked || !choice} maxLength={30} value={choice?.label || ""} placeholder={DEFAULT_QUALITY_LABELS[id]} onChange={e=>setChoices(old=>old.map(c=>c.id===id?{...c,label:e.target.value}:c))}/></label>;})}</div>
    {routes.map((route,index)=><fieldset key={route.upstreamId} disabled={locked} className={styles.parameterRoute}><legend>{route.provider} · <code>{route.model}</code></legend>
      <div className={styles.parameterDefaults}><b>元数据默认值</b><p>{route.metadataDefaults ? `${route.metadataDefaults.source} · 修订 v${route.metadataDefaults.revision} · ${({unknown:"待核实",configured:"执行配置记录",documented:"文档声明",verified:"已验证资料"} as Record<string,string>)[route.metadataDefaults.state] || route.metadataDefaults.state}` : "此供应商和实际模型尚未关联元数据记录"}</p><p>{route.metadataDefaults?.reason || "请先补充元数据库，或手动配置；未知参数默认不发送。"}</p><button type="button" className={styles.secondary} disabled={locked || !route.metadataDefaults?.available} onClick={()=>{const d=route.metadataDefaults!;patchRoute(index,{mode:d.mode,values:{...d.values},metadataRef:{id:d.id,revision:d.revision},evidence:{status:["documented","verified"].includes(d.state)?"documented":"unverified",source:`元数据库 ${d.id} v${d.revision}：${d.source}`.slice(0,1000),checkedAt:d.checkedAt}});}}>使用元数据默认映射</button></div>
      <label className={styles.field}>质量参数处理<select aria-label={`参数处理 ${route.upstreamId}`} value={route.mode} onChange={e=>patchRoute(index,{mode:e.target.value as typeof route.mode})}><option value="map">逐档映射到上游值</option><option value="passthrough">原样发送档位 ID</option><option value="omit">不发送 quality 参数</option></select></label>
      <div className={styles.priceTableScroll}><table className={styles.priceTable} aria-label={`质量映射 ${route.upstreamId}`}><thead><tr><th>前端显示</th><th>实际发送的 quality</th></tr></thead><tbody>{choices.map(choice=><tr key={choice.id}><th>{choice.label}<small className={styles.parameterId}>{choice.id}</small></th><td>{route.mode==="omit"?<code>不发送</code>:<><input aria-label={`${choice.id}上游值 ${route.upstreamId}`} required maxLength={100} list={`quality-native-${index}`} value={route.mode==="passthrough"?choice.id:route.values[choice.id] || ""} placeholder={route.metadataDefaults?.values[choice.id] || "选择或输入实际参数"} onChange={e=>patchRoute(index,{evidence:{status:"unverified",source:route.metadataDefaults?`手动覆盖，参考元数据库 ${route.metadataDefaults.id} v${route.metadataDefaults.revision}`:"手动覆盖",checkedAt:""},mode:"map",values:{...Object.fromEntries(choices.map(c=>[c.id,route.mode==="passthrough"?c.id:route.values[c.id] || ""])),[choice.id]:e.target.value}})}/><small className={styles.parameterId}>元数据默认：{route.metadataDefaults?.mode==="omit"?"不发送":route.metadataDefaults?.values[choice.id] || "待维护"}</small></>}</td></tr>)}</tbody></table></div>
      <datalist id={`quality-native-${index}`}>{route.metadataDefaults?.nativeValues.map(value=><option key={value} value={value}/>)}</datalist>
      <div className={styles.parameterEvidence}><label className={styles.field}>核对状态<select aria-label={`核对状态 ${route.upstreamId}`} value={route.evidence.status} onChange={e=>patchRoute(index,{evidence:{...route.evidence,status:e.target.value as typeof route.evidence.status}})}><option value="unverified">尚未验证</option><option value="documented">供应商文档声明</option><option value="accepted">接口接受（效果未验证）</option><option value="rejected">实测被拒绝</option></select></label><label className={styles.field}>核对日期<input type="date" aria-label={`核对日期 ${route.upstreamId}`} value={route.evidence.checkedAt.slice(0,10)} onChange={e=>patchRoute(index,{evidence:{...route.evidence,checkedAt:e.target.value}})}/></label><label className={styles.field}>核对依据<input aria-label={`核对依据 ${route.upstreamId}`} value={route.evidence.source} maxLength={1000} placeholder="文档链接或测试记录；请求成功不等于参数生效" onChange={e=>patchRoute(index,{evidence:{...route.evidence,source:e.target.value}})}/></label></div>
    </fieldset>)}
    <p className={styles.scopeNote}>同一家族的比例分支分别映射，展示档位统一。映射绑定实际模型来源；切换上游后会采用新来源的配置。共享该实际模型的其他入口也会继承配置。保存不自动测试供应商，不调整积分价格；已接受任务按原版本执行。</p>
  </div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="button" className={styles.secondary} disabled={locked || !routes.some(r=>r.configured)} onClick={()=>onSave(null)}>恢复原参数</button><button type="submit" className={styles.primary} disabled={locked || !valid}>保存参数并生效</button></footer></form></Dialog>;
}

export function ResolutionsDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(resolutions:string[]|null,parameters?:ResolutionParameters|null)=>void}) {
  const [selected,setSelected]=useState(row.displayResolutions || ["1K","2K","4K"]);
  const [routes,setRoutes]=useState(()=>row.resolutionConfig?.routes.map(r=>({...r,values:{...r.values}})) || []);
  const update=(id:string,patch:Partial<typeof routes[number]>)=>setRoutes(old=>old.map(r=>r.upstreamId===id?{...r,...patch}:r));
  const valid=selected.length>0&&routes.every(r=>r.mode!=="map"||r.fieldKnown&&selected.every(id=>r.values[id]?.trim()));
  const parameters=():ResolutionParameters=>({routes:routes.map(r=>({upstreamId:r.upstreamId,mode:r.mode,field:r.field,ratioField:r.ratioField||null,values:r.values,metadataRef:r.metadataRef}))});
  return <Dialog title="分辨率显示与实际参数" locked={locked} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(valid)onSave(selected,routes.length&&!row.preset?parameters():undefined);}}><div className={styles.dialogBody}>
    <div className={styles.scopeHeading}><b>{row.label}</b><span>按模型家族统一显示，各供应通道独立传参</span></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p className={styles.ruleNote}>前端档位决定用户可选的输出分辨率；实际发送值决定上游如何生成。系统自动匹配对应供应商的接口规格，只需选择实际档位。映射到较低规格时，输出仍沿用现有放大流程。</p>
    <div className={styles.scopeControls}><b>前端显示分辨率</b><button type="button" disabled={locked} onClick={()=>setSelected(["1K","2K","4K"])}>全选</button></div>
    <div className={styles.parameterChoices}>{["1K","2K","4K"].map(id=><label key={id} className={styles.parameterChoice}><input type="checkbox" aria-label={`显示 ${id}`} disabled={locked} checked={selected.includes(id)} onChange={e=>setSelected(old=>e.target.checked?[...old,id]:old.filter(v=>v!==id))}/><b>{id}</b></label>)}</div>
    {routes.map((route,index)=><fieldset key={route.upstreamId} className={`${styles.capabilities} ${styles.parameterRoute}`} disabled={locked||!route.editable}><legend>{route.provider} · {route.model}{row.routes.filter(r=>r.upstreamId===route.upstreamId).every(r=>!r.enabled)?" · 停用通道":""}</legend>
      <p className={styles.ruleNote}>已记录支持规格：{route.nativeValues.length?route.nativeValues.join("、"):"未知 / 待维护"}{route.metadataDefaults?.source?` · ${route.metadataDefaults.source} · 元数据 v${route.metadataDefaults.revision}`:""}</p>
      <p className={styles.ruleNote}>{route.metadataDefaults?.reason || "尚无对应元数据，继续原传参；可手动维护映射。"}{!route.editable?" 此路径由原适配器管理。":""}</p>
      <label className={styles.field}>分辨率参数处理<select aria-label={`${route.provider} ${route.model} 分辨率参数处理`} value={route.mode} onChange={e=>update(route.upstreamId,{mode:e.target.value as typeof route.mode,metadataRef:null})}><option value="legacy">沿用原传参</option><option value="map">按显示档位映射实际值</option><option value="omit">不发送分辨率参数</option></select></label>
      {route.mode==="map"&&<>
        <div className={styles.parameterDefaults}><b>{route.configured?"使用已保存的通道规格":route.fieldKnown?"传参方式已自动匹配":"这条通道的接口规格尚待确认"}</b><p>{route.fieldKnown?"无需选择接口字段，下面选择该显示档位实际使用的规格。":"元数据库还没有可靠的接口定义。可先沿用原调用；有供应商资料时在高级设置维护。系统不会默认把 size 当作分辨率。"}</p></div>
        <table className={`${styles.priceTable} ${styles.resolutionTable}`}><thead><tr><th>前端显示</th><th>实际使用的上游规格</th></tr></thead><tbody>{selected.map(id=>{
          const d=route.metadataDefaults;const sourceValues=d?.field===route.field?[...Object.values(d.values),...d.nativeValues.filter(v=>route.field!=="size"||/^(auto|\d+x\d+)$/.test(v))]:[];
          const options=[...new Set([...sourceValues,...Object.values(route.values)].filter(Boolean))];
          return <tr key={id}><th>{id}</th><td><select aria-label={`${route.provider} ${route.model} ${id} 实际分辨率`} disabled={!route.fieldKnown||!options.length} value={route.values[id]||""} onChange={e=>update(route.upstreamId,{values:{...route.values,[id]:e.target.value},metadataRef:null})}><option value="">{options.length?"选择实际规格":"暂无已确认规格"}</option>{options.map(v=><option key={v} value={v}>{v}</option>)}</select></td></tr>;
        })}</tbody></table>
        <details className={styles.parameterAdvanced}><summary>高级设置 · 手动配置接口参数</summary><p className={styles.ruleNote}>常规使用由系统自动确定。仅在供应商定义特殊参数或需自定义映射时修改；修改后按手动配置执行。</p>
          <label className={styles.field}>实际参数名<select aria-label={`${route.provider} ${route.model} 分辨率参数名`} value={route.fieldKnown?route.field:""} onChange={e=>{if(e.target.value)update(route.upstreamId,{field:e.target.value as typeof route.field,ratioField:undefined,fieldKnown:true,metadataRef:null});}}><option value="" disabled>按供应商文档选择参数</option>{RESOLUTION_FIELDS.filter(f=>route.protocol!=="openai-images"||!f.includes(".")).map(f=><option key={f} value={f}>{f}</option>)}</select></label>
          <label className={styles.field}>比例参数<select aria-label={`${route.provider} ${route.model} 比例参数名`} value={route.ratioField||""} onChange={e=>update(route.upstreamId,{ratioField:e.target.value as typeof route.ratioField||undefined,metadataRef:null})}><option value="">沿用适配器处理</option>{RATIO_FIELDS.filter(f=>f!==route.field&&(route.protocol!=="openai-images"||!f.includes("."))).map(f=><option key={f} value={f}>{f}</option>)}</select></label>
          {selected.map(id=><label key={id} className={styles.field}>{id} 自定义实际值<input aria-label={`${route.provider} ${route.model} ${id} 自定义分辨率`} value={route.values[id]||""} placeholder="按实际接口定义填写" maxLength={100} onChange={e=>update(route.upstreamId,{values:{...route.values,[id]:e.target.value},metadataRef:null})}/></label>)}
        </details>
      </>}

      {route.mode==="omit"&&<p className={styles.ruleNote}>此通道使用供应商默认生成规格，输出再按现有流程处理。</p>}
      {route.editable&&route.metadataDefaults?.available&&<button type="button" className={styles.secondary} onClick={()=>{const d=route.metadataDefaults!;update(route.upstreamId,{mode:d.mode,field:d.field,ratioField:d.ratioField,fieldKnown:true,values:{...d.values},metadataRef:{id:d.id,revision:d.revision}});}}>使用元数据默认映射</button>}
    </fieldset>)}
    <p className={styles.scopeNote}>至少选择一档，所有比例分支同步。新增档位的积分在“设置积分”中维护。这里只管理显示和执行映射；元数据库中的能力声明由供应商资料独立维护。</p>
  </div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type="button" className={styles.secondary} disabled={locked || !row.displayResolutions} onClick={()=>onSave(null)}>恢复默认显示</button><button type="submit" className={styles.primary} disabled={locked || !valid}>保存分辨率并生效</button></footer></form></Dialog>;
}
