'use client';
import {useEffect,useState} from 'react';
import {AdminQueryInput} from '@/components/admin/query-input';
import styles from './saas.module.css';

export type SupervisorOption={email:string;name:string};
type ReadOptions=(tenantId:string,page:number,query:string,signal:AbortSignal)=>Promise<{supervisors:SupervisorOption[];hasMore:boolean}>;

export function TenantSupervisorPicker({tenantId,owner,ownerName,value,selectedName,exclude,legacyOptions,read,onChange}:{
 tenantId:string;owner:string;ownerName:string;value:string;selectedName?:string;exclude?:string;
 legacyOptions?:SupervisorOption[];read:ReadOptions;onChange:(email:string)=>void;
}){
 const [query,setQuery]=useState(''),[page,setPage]=useState(1),[retry,setRetry]=useState(0);
 const [result,setResult]=useState<{key:string;options:SupervisorOption[];more:boolean}|null>(null);
 const [failure,setFailure]=useState<{key:string;text:string}|null>(null);
 const [selected,setSelected]=useState<SupervisorOption|null>(null);
 const key=JSON.stringify([tenantId,page,query,retry]),remote=!legacyOptions;
 useEffect(()=>{
  if(!remote)return;
  const request=new AbortController();
  void read(tenantId,page,query,request.signal)
   .then(data=>{if(!request.signal.aborted)setResult({key,options:data.supervisors,more:data.hasMore});})
   .catch(error=>{if(!request.signal.aborted)setFailure({key,text:error.message});});
  return()=>request.abort();
 },[remote,read,tenantId,page,query,key]);
 const current=result?.key===key?result:null,error=failure?.key===key?failure.text:'';
 const options=(legacyOptions??current?.options??[]).filter(row=>row.email!==exclude&&row.email!==owner);
 const pinned=value&&value!==owner&&!options.some(row=>row.email===value)
  ?{email:value,name:(selected?.email===value?selected.name:selectedName)||value}:null;
 return <div className={styles.supervisorPicker}>
  <label>直属上级<select aria-label="直属上级" value={value} onChange={event=>{
   const next=event.target.value;setSelected(options.find(option=>option.email===next)??null);onChange(next);
  }}>
   <option value={owner}>{ownerName}（所有者）</option>
   {pinned&&<option value={pinned.email}>{pinned.name}</option>}
   {options.map(row=><option key={row.email} value={row.email}>{row.name||row.email}</option>)}
  </select></label>
  {remote&&<>
   <AdminQueryInput aria-label="查找直属上级" placeholder="搜索姓名或账号" maxLength={100} value={query}
    onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}}
    onCommit={text=>{setQuery(text);setPage(1);}}/>
   {error?<p role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>重试上级读取</button></p>
    :!current?<p role="status" className={styles.muted}>正在读取上级选项</p>
    :!options.length?<p className={styles.muted}>没有匹配的成员</p>:null}
   {(page>1||current?.more)&&<div className={styles.actions}>
    <button type="button" disabled={page===1} onClick={()=>setPage(n=>n-1)}>上一页上级</button>
    <button type="button" disabled={!current?.more} onClick={()=>setPage(n=>n+1)}>下一页上级</button>
   </div>}
  </>}
 </div>;
}
