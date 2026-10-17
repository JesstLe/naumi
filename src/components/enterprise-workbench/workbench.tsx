'use client';
import { useEffect,useState } from 'react';
import { authHeader } from '@/lib/supabase';
import type { EnterpriseIdentity,EnterpriseSnapshot } from '@/lib/enterprise/contracts';
import type { DeploymentPolicy,IntegrationPage,RecordKind } from '@/lib/enterprise/integration/contracts';
import styles from './workbench.module.css';
import { readBrowserImage } from '@/lib/browser-image-cache';
const modes={shared:'多企业平台',dedicated:'企业独立部署'};
const kinds:{id:RecordKind;label:string}[]=[{id:'artworks',label:'图片与提示词'},{id:'generations',label:'生成任务'},{id:'ledger',label:'积分明细'}];
const date=(d:Date)=>d.toISOString().slice(0,10);
const display=(v:number|null|undefined)=>v===null||v===undefined?'未记录':v.toLocaleString('zh-CN');
const time=(v:string|null)=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'未记录';
function ProtectedThumbnail({source}:{source:string}){
  const [result,setResult]=useState<{source:string;url:string}|null>(null),[failed,setFailed]=useState(false);
  useEffect(()=>{const abort=new AbortController();let url='';setFailed(false);setResult(null);
    void readBrowserImage(source,abort.signal).then(blob=>{if(!abort.signal.aborted){url=URL.createObjectURL(blob);setResult({source,url})}},()=>{if(!abort.signal.aborted)setFailed(true)});
    return()=>{abort.abort();if(url)URL.revokeObjectURL(url)}},[source]);
  return result?.source===source?<img className={styles.thumbnail} src={result.url} alt='生成作品' loading='lazy'/>:<span>{failed?'图片暂不可读取':'图片加载中…'}</span>;
}
async function read<T>(q:Record<string,string>,signal?:AbortSignal):Promise<T>{
  const response=await fetch('/api/admin/enterprise-workbench?'+new URLSearchParams(q),{cache:'no-store',signal,headers:await authHeader()});
  const body=await response.json();if(!response.ok)throw new Error(body.error||'读取失败');return body;
}
export function EnterpriseWorkbench(){
  const [enterprises,setEnterprises]=useState<EnterpriseIdentity[]>([]),[policy,setPolicy]=useState<DeploymentPolicy|null>(null),[id,setId]=useState('');
  const [kind,setKind]=useState<RecordKind>('artworks'),[snapshot,setSnapshot]=useState<EnterpriseSnapshot|null>(null),[data,setData]=useState<IntegrationPage|null>(null);
  const [from,setFrom]=useState(()=>date(new Date(Date.now()+8*3600000-29*86400000))),[to,setTo]=useState(()=>date(new Date(Date.now()+8*3600000)));
  const [email,setEmail]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{const abort=new AbortController();read<{enterprises:EnterpriseIdentity[];policy:DeploymentPolicy}>({action:'list'},abort.signal).then(r=>{setPolicy(r.policy);setEnterprises(r.enterprises);setId(r.enterprises[0]?.id||'');if(!r.enterprises.length)setLoading(false)}).catch(e=>{if(!abort.signal.aborted){setError(e.message);setLoading(false)}});return()=>abort.abort()},[]);
  useEffect(()=>{setSnapshot(null);setEmail('');setPage(1);if(!id)return;const abort=new AbortController();read<EnterpriseSnapshot>({action:'members',enterpriseId:id},abort.signal).then(setSnapshot).catch(e=>{if(!abort.signal.aborted)setError(e.message)});return()=>abort.abort()},[id,revision]);
  useEffect(()=>{if(!id)return;const abort=new AbortController();setData(null);setLoading(true);setError('');
    read<IntegrationPage>({action:'records',enterpriseId:id,kind,from,to,email,page:String(page)},abort.signal).then(setData).catch(e=>{if(!abort.signal.aborted)setError(e.message)}).finally(()=>{if(!abort.signal.aborted)setLoading(false)});return()=>abort.abort()},[id,kind,from,to,email,page,revision]);
  const scope=enterprises.find(e=>e.id===id);
  return <section className={styles.page} data-testid='enterprise-workbench'><header className={styles.header}><div><h1>企业流程工作台</h1><div className={styles.context}><span>{policy?modes[policy.mode]:'接入配置'}</span><span>Naumi</span></div></div><div className={styles.headerActions}><a href='/admin'>管理总入口</a><a href='/enterprise'>企业管理中心</a><button onClick={()=>setRevision(v=>v+1)}>刷新</button></div></header>
    {error&&<div className={styles.error} role='alert'>{error==='ENTERPRISE_INTEGRATION_NOT_CONFIGURED'?'尚未配置本实例的数据源标识与部署范围':error}</div>}
    <div className={styles.scope}><label>企业<select aria-label='企业' value={id} disabled={policy?.mode==='dedicated'||!enterprises.length} onChange={e=>{setId(e.target.value);setData(null)}}>{enterprises.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}{!enterprises.length&&<option value=''>暂无已授权企业</option>}</select></label><label>成员<select aria-label='成员' value={email} onChange={e=>{setEmail(e.target.value);setPage(1)}}><option value=''>当前可见范围</option>{snapshot?.members.map(m=><option value={m.email} key={m.email}>{m.name||m.email}</option>)}</select></label><label>开始日期<input aria-label='开始日期' type='date' value={from} onChange={e=>{setFrom(e.target.value);setPage(1)}}/></label><label>结束日期<input aria-label='结束日期' type='date' value={to} onChange={e=>{setTo(e.target.value);setPage(1)}}/></label></div>
    <div className={styles.panel}><div className={styles.tabs}>{kinds.map(k=><button key={k.id} className={kind===k.id?styles.active:''} onClick={()=>{setKind(k.id);setPage(1)}}>{k.label}</button>)}<span>{scope?.name||'企业数据'}{data?` · ${data.total} 条`:''}</span></div>
      {loading?<div className={styles.empty}>加载中…</div>:!data?.rows.length?<div className={styles.empty}>当前范围暂无记录</div>:<div className={styles.tableWrap}><table><thead><tr><th>时间 / 成员</th><th>{kind==='ledger'?'流水 / 类型':'作品 / 操作'}</th><th>{kind==='ledger'?'积分变动':'提示词 / 内容'}</th><th>{kind==='artworks'?'溯源':kind==='generations'?'实际扣费 / 预估':'用途来源'}</th><th>来源编号</th></tr></thead><tbody>{data.rows.map((r,i)=><tr key={JSON.stringify(r.ref)+i}><td>{time(r.createdAt)}<small>{r.account.name||r.account.email}</small></td><td>{r.media.href&&<ProtectedThumbnail source={r.media.href}/>}<strong>{r.title||r.operation||r.ledgerKind||'未记录'}</strong><small>{r.status||r.sourceLabel||'—'}</small></td><td>{kind==='ledger'?<strong className={r.credits.delta&&r.credits.delta<0?styles.negative:styles.positive}>{display(r.credits.delta)}</strong>:r.prompt?<details><summary>{r.prompt.slice(0,75)}{r.prompt.length>75?'…':''}</summary><pre>{r.prompt}</pre></details>:'未记录'}</td><td>{kind==='artworks'?r.provenance||'未记录':kind==='generations'?<>{display(r.credits.charged)}<small>预估 {display(r.credits.quoted)} · {r.credits.evidence==='linked-ledger'?'已关联扣费流水':'待核对'}</small></>:r.sourceLabel||'未记录'}</td><td><code>{r.ref.kind}</code><small>{r.ref.id}</small></td></tr>)}</tbody></table></div>}
      <footer className={styles.footer}><span>{data?'来源读取时间 '+time(data.generatedAt):'数据来自已授权的 Naumi 企业范围'}</span><button disabled={page<=1||loading} onClick={()=>setPage(v=>v-1)}>上一页</button><span>{page}</span><button disabled={!data||page*data.size>=data.total||loading} onClick={()=>setPage(v=>v+1)}>下一页</button></footer></div>
    <p className={styles.note}>记录按当前企业授权范围展示；历史业务归属与流程任务关联待确认。图片数量、预估积分和实际扣费分别记录。</p>
  </section>;
}
