'use client';
import {useEffect,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {authHeader} from '@/lib/supabase';
import type {EnterpriseHealth} from '@/lib/enterprise/health';
import styles from './enterprise.module.css';
export function EnterpriseHealthPanel({enterpriseId}:{enterpriseId:string}){
  const [result,setResult]=useState<EnterpriseHealth|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{const c=new AbortController();setResult(null);setError('');void (async()=>{try{
    const r=await fetch('/api/enterprise/health?'+new URLSearchParams({enterpriseId}),{headers:await authHeader(),cache:'no-store',signal:c.signal});const body=await r.json();if(!r.ok)throw Error(body.error||'运行状态读取失败');if(!c.signal.aborted)setResult(body);
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'运行状态读取失败');}})();return()=>c.abort();},[enterpriseId,revision]);
  return <section aria-label='运行健康'><div className={styles.sectionHead}><h2>运行健康</h2><button onClick={()=>setRevision(n=>n+1)}><RefreshCw size={16}/>刷新</button></div>
    {error?<p role='alert' className={styles.error}>{error}</p>:!result?<p role='status'>正在读取运行状态…</p>:<>
      <div className={styles.roleGrid}>{[['数据服务','可访问'],['任务调度',result.worker.recentTicks?'近期有运行记录':result.worker.state==='not_recorded'?'尚无运行记录':'近期未收到运行记录'],['排队中',result.tasks.queued],['处理中',result.tasks.running],['待核查',result.tasks.review],['近一小时成功',result.tasks.succeeded],['近一小时失败',result.tasks.failed]].map(([label,value])=><article className={styles.roleCard} key={label}><h3>{label}</h3><strong>{value}</strong></article>)}</div>
      <p className={styles.hint}>更新于 {new Date(result.observedAt).toLocaleString('zh-CN')}{result.worker.lastAcceptedAt&&` · 最近调度 ${new Date(result.worker.lastAcceptedAt).toLocaleString('zh-CN')}`}</p>
    </>}
  </section>;
}
