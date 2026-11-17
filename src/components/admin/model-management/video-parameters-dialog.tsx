"use client";
import {useState} from 'react';
import type {ManagedModelRow} from '@/lib/model-config/management';
import {publishedVideoExecutionSchema} from '@/lib/video/published-execution';
import {VIDEO_WIRE_PROFILES,type VideoWireProfile} from '@/lib/video/capability-schema';
import type {VideoParameters} from '@/lib/model-config/video-policy';
import styles from './model-management.module.css';
import {Dialog} from './dialog';

/** Execution fields have one writer; legacy descriptions stay read-only here. */
export function VideoParametersDialog({row,locked,error,onClose,onSave}:{row:ManagedModelRow;locked:boolean;error:string;onClose:()=>void;onSave:(routes:VideoParameters)=>void}){
 const [drafts,setDrafts]=useState(()=>row.videoConfig!.routes.map(route=>({upstreamId:route.upstreamId,profile:route.profile??route.candidateProfile,json:route.execution||route.executionCandidate?JSON.stringify(route.execution??route.executionCandidate,null,2):''})));
 const parsed=drafts.map(draft=>{try{return publishedVideoExecutionSchema.safeParse(JSON.parse(draft.json));}catch{return {success:false as const};}}),valid=parsed.every(p=>p.success);
 return <Dialog title='视频执行配置' locked={locked} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(!valid)return;onSave(drafts.map((draft,index)=>({upstreamId:draft.upstreamId,executionOnly:true,profile:draft.profile??null,execution:parsed[index].success?parsed[index].data:undefined})));}}><fieldset className={styles.dialogBody} disabled={locked}>
  {drafts.map((draft,index)=>{const route=row.videoConfig!.routes[index];return <section key={draft.upstreamId}><h3>{route.provider} · {route.model}</h3>
   {route.frozenRecorded===false&&<p className={styles.ruleNote}>此发布版本未记录视频能力。</p>}
   <label className={styles.field}>查询协议<select aria-label={route.model+' 查询协议'} value={draft.profile??''} onChange={e=>setDrafts(all=>all.map((d,i)=>i===index?{...d,profile:e.target.value as VideoWireProfile||undefined}:d))}><option value=''>继承上游</option>{VIDEO_WIRE_PROFILES.map(profile=><option key={profile} value={profile}>{profile}</option>)}</select></label>
   <label className={styles.field}>执行映射<textarea aria-label={route.model+' 执行映射'} spellCheck={false} rows={16} className='w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900' value={draft.json} onChange={e=>setDrafts(all=>all.map((d,i)=>i===index?{...d,json:e.target.value}:d))}/></label>
   {!parsed[index].success&&draft.json&&<p role='alert' className={styles.error}>执行映射格式无效</p>}
  </section>;})}
  {error&&<p role='alert' className={styles.error}>{error}</p>}
 </fieldset><footer className={styles.dialogFooter}><button type='button' className={styles.secondary} disabled={locked} onClick={onClose}>取消</button><button type='submit' className={styles.primary} disabled={locked||!valid}>保存并生效</button></footer></form></Dialog>;
}
