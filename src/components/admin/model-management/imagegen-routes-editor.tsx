"use client";
import {useState} from "react";
import {ImagegenMetadataEditor} from "./imagegen-metadata-editor";
import {imagegenRoutePolicySchema,type ImagegenRoutePolicy} from "@/lib/model-config/imagegen-policy";
import type {ManagedModelRow} from "@/lib/model-config/management";
import styles from "./model-management.module.css";
export function ImagegenRoutesEditor({row,locked,onSave}:{row:ManagedModelRow;locked:boolean;onSave:(routes:ImagegenRoutePolicy[]|null)=>void}){
 const [routes,setRoutes]=useState(()=>structuredClone(row.imagegenConfig?.routes||[]));
 const valid=routes.length>0&&routes.every(r=>imagegenRoutePolicySchema.safeParse(r).success);
 return <form onSubmit={e=>{e.preventDefault();if(valid)onSave(routes);}}><div className={styles.dialogBody}><p className={styles.ruleNote}>资料库用于默认值；此处保存后才发布到执行通道，已接受的任务保留原参数。</p>
 {routes.map(route=><fieldset key={route.upstreamId} className={styles.parameterRoute}><legend>{row.routes.find(r=>r.upstreamId===route.upstreamId)?.provider} · {row.routes.find(r=>r.upstreamId===route.upstreamId)?.model}</legend>
 <ImagegenMetadataEditor disabled={locked} parameters={{imagegen:{capabilities:route.capabilities,wireMap:route.wireMap}}} onChange={value=>{const next=value.imagegen as Pick<ImagegenRoutePolicy,"capabilities"|"wireMap">;setRoutes(old=>old.map(r=>r.upstreamId===route.upstreamId?{...r,...next,metadataRef:null}:r));}}/>
 </fieldset>)}{!valid&&<p className={styles.error}>支持的能力需填写依据及核对日期，并使用合法参数名。</p>}</div><footer className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={locked} onClick={()=>onSave(null)}>恢复资料库默认值</button><button type="submit" className={styles.primary} disabled={locked||!valid}>发布高级参数</button></footer></form>;
}
