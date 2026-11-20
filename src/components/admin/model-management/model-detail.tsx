"use client";
import Link from "next/link";
import {useState} from "react";
import type {ManagedModelRow} from "@/lib/model-config/management";
import type {State} from "./contracts";
import type {MappingAction} from "./model-mapping-card";
import type {EditorState} from "./editor-state";
import {EffectivePrices} from "./effective-prices";
import {orderedRoutes} from "./channel-display";
import styles from "./workspace.module.css";

export const modalityNames:Record<string,string>={image:"图片",text:"文字 / 视觉",video:"视频",audio:"声音"};
export function ModelDetail({row,state,actions,locked,onBack,onOpen}:{row:ManagedModelRow;state:State;actions:MappingAction[];locked:boolean;onBack:()=>void;onOpen:(editor:EditorState)=>void}){
  const [section,setSection]=useState("overview"),[feature,setFeature]=useState(row.pricing?.[0]?.feature||"");
  const activeFeature=row.pricing?.some(view=>view.feature===feature)?feature:row.pricing?.[0]?.feature||"";
  const tabs=[["overview","概览"],["parameters","规格与参数"],["routing","供应通道"],["pricing","售价"],["records","记录"]];
  const group=(name:MappingAction["group"])=>actions.filter(action=>action.group===name).map(action=><button key={action.label} className={styles.button} disabled={action.disabled} title={action.title} onClick={action.onClick}>{action.label}</button>);
  return <section aria-label={`${row.label} 模型详情`}>
    <button className={styles.link} onClick={onBack}>← 模型列表</button><div className={styles.detailTitle}><h2>{row.label}</h2><span className={styles.tag}>{modalityNames[row.modality]||row.modality}</span></div>
    <nav className={styles.detailTabs} role="tablist" aria-label="模型详情">{tabs.map(([id,label])=><button id={`detail-tab-${id}`} key={id} role="tab" aria-selected={section===id} aria-controls={`detail-panel-${id}`} onClick={()=>setSection(id)}>{label}</button>)}</nav>
    <section id={`detail-panel-${section}`} role="tabpanel" aria-labelledby={`detail-tab-${section}`}>
    {section==="overview"&&<><dl className={styles.facts}><div><dt>前端显示名称</dt><dd>{row.label}</dd></div><div><dt>公开 ID</dt><dd>{row.publicIds.join("、")}</dd></div><div><dt>应用范围</dt><dd>{row.features.map(feature=>feature.label).join("、")||"未应用到工具"}</dd></div><div><dt>默认用途</dt><dd>{row.defaultFeatures?.map(option=>option.label).join("、")||(row.defaultFeatures?"未设置":"未记录")}</dd></div><div><dt>路由方式</dt><dd>{row.supplierRouting?.mode==="random"?"同级随机":row.supplierRouting?.mode==="balanced"?"同级分流":row.supplierRouting?.mode==="priority"?"主备优先":row.conditional?"条件路由":row.preset?"默认预设":"固定通道 / 比例分支"}</dd></div><div><dt>模型版本 / 计费版本</dt><dd>{state.version} / {state.billingVersion ?? "未记录"}</dd></div></dl><div className={styles.detailActions}>{group("display")}<button className={styles.button} disabled={locked||!state.managed} onClick={()=>onOpen({kind:"scope",row})}>应用范围</button></div></>}
    {section==="parameters"&&<><div className={styles.detailActions}>{group("parameters")}</div>{row.parameterSources?.map(source=><section className={styles.section} key={source.id}><h2>{source.provider} / {source.model}</h2><dl className={styles.facts}><div><dt>接口协议</dt><dd>{source.protocol}</dd></div><div><dt>原生分辨率</dt><dd>{source.nativeResolutions.join("、")||"未记录"}</dd></div></dl><details className={styles.advanced}><summary>已发布参数映射</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(source.parameterMap,null,2)}</pre></details></section>)}{row.modality!=="image"&&<Link className={styles.link} href="/admin/bi/models?tab=upstreamModels">完整能力配置 →</Link>}</>}
    {section==="routing"&&<><div className={styles.detailActions}>{group("routing")}</div><div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>供应商</th><th>实际模型</th><th>通道</th><th>启停</th></tr></thead><tbody>{[...orderedRoutes(row,true),...orderedRoutes(row,false)].map(route=><tr key={`${route.upstreamId}-${route.kind}`}><td>{route.provider}</td><td><code>{route.model}</code></td><td>{route.kind}</td><td><span className={styles.status} data-state={route.enabled?"enabled":"disabled"}>{route.enabled?"启用":"停用"}</span></td></tr>)}</tbody></table></div></>}
    {section==="pricing"&&<><label className={styles.field}>应用用途<select aria-label="详情价格用途" value={activeFeature} onChange={event=>setFeature(event.target.value)}>{row.pricing?.map(view=><option key={view.feature} value={view.feature}>{view.label}</option>)}</select></label><div className={styles.section}><EffectivePrices row={row} feature={activeFeature} modelVersion={state.version} billingVersion={state.billingVersion} locked={locked||!state.managed} onEdit={()=>onOpen({kind:"price",row,feature:activeFeature})}/></div></>}
    {section==="records"&&<nav className={styles.runtimeLinks} aria-label="模型记录"><Link className={styles.runtimeLink} href="/admin/bi/models?tab=history">配置发布与恢复 →</Link><Link className={styles.runtimeLink} href="/admin/center?section=calls">真实模型调用 →</Link><Link className={styles.runtimeLink} href="/admin/center?section=models">图片质量审计 →</Link><Link className={styles.runtimeLink} href="/admin/billing/supplier-cost">采购成本与对账 →</Link></nav>}
    </section>
  </section>;
}
