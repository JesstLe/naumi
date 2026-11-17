'use client';
import { useCallback,useEffect,useMemo,useRef,useState } from 'react';
import { Download,RefreshCw,TrendingUp,Wallet,Users,Images,AlertTriangle,ChevronRight } from 'lucide-react';
import { authHeader } from '@/lib/supabase';
import { PURPOSES,EVENT_LABELS,presetDates,type AnalyticsFilter,type EnterpriseAnalytics } from '@/lib/enterprise/analytics-contracts';
import type { EnterpriseSnapshot } from '@/lib/enterprise/contracts';
import styles from './enterprise.module.css';

const number=(n:number)=>n.toLocaleString('zh-CN',{maximumFractionDigits:2});
const time=(v:string)=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
const riskLabels:Record<string,string>={'low-balance':'余额不足100积分','expiring-credits':'积分30天内到期','intern-expiry':'实习生7天内到期','disabled':'已停用账号','settlement-review':'结算待核对 / 超24小时未结算'};

export function EnterpriseAnalyticsPanel({snapshot,onMember}:{snapshot:EnterpriseSnapshot;onMember:(email:string)=>void}){
 const enterpriseId=snapshot.enterprise.id;
 const [preset,setPreset]=useState('month'),[draft,setDraft]=useState(()=>presetDates('month'));
 const [filter,setFilter]=useState<AnalyticsFilter>(()=>({enterpriseId,...presetDates('month'),group:'day',email:'',team:'',purpose:'',kind:'',page:1}));
 const [data,setData]=useState<EnterpriseAnalytics|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[exporting,setExporting]=useState(false);
 const [sort,setSort]=useState<'net'|'artworks'|'tasks'>('net'),[search,setSearch]=useState('');
 const abort=useRef<AbortController|null>(null),seq=useRef(0),exportAbort=useRef<AbortController|null>(null);
 const query=useMemo(()=>new URLSearchParams({...filter,page:String(filter.page)}).toString(),[filter]);
 const load=useCallback(async()=>{
  const n=++seq.current;abort.current?.abort();const c=new AbortController();abort.current=c;setLoading(true);setError('');
  try{const headers=await authHeader();if(c.signal.aborted)return;const r=await fetch(`/api/enterprise/analytics?${query}`,{cache:'no-store',headers,signal:c.signal});const body=await r.json();if(!r.ok)throw new Error(body.error||'经营数据读取失败');if(n===seq.current&&!c.signal.aborted)setData(body)}
  catch(e){if(n===seq.current&&!c.signal.aborted){setError((e as Error).message);setData(null)}}
  finally{if(n===seq.current&&!c.signal.aborted)setLoading(false)}
 },[query]);
 useEffect(()=>{setData(null);void load();return()=>{seq.current++;abort.current?.abort();exportAbort.current?.abort()}},[load]);
 const update=(patch:Partial<AnalyticsFilter>)=>{exportAbort.current?.abort();setFilter(old=>({...old,...patch,page:patch.page||1}))};
 const members=[...(snapshot.actor.owner?[{email:snapshot.enterprise.owner_email,name:data?.choices.find(m=>m.email===snapshot.enterprise.owner_email)?.name||snapshot.enterprise.owner_email.split('@')[0],supervisor_email:''}]:[]),...snapshot.members];
 const teamChoices=members.filter(m=>snapshot.members.some(c=>c.supervisor_email===m.email));
 const choosePreset=(v:string)=>{setPreset(v);if(v!=='custom'){const dates=presetDates(v);setDraft(dates);update(dates)}};
 const drill=(email:string)=>{update({email,team:''});document.getElementById('enterprise-ledger')?.scrollIntoView({behavior:'smooth',block:'start'})};
 async function download(){
  if(exporting)return;const c=new AbortController();exportAbort.current=c;setExporting(true);setError('');let url='';
  try{const r=await fetch(`/api/enterprise/analytics?${query}&format=csv`,{cache:'no-store',headers:await authHeader(),signal:c.signal});if(!r.ok){const b=await r.json();throw new Error(b.error||'导出失败')}const blob=await r.blob();if(c.signal.aborted)return;url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`企业积分流水-${filter.from}-${filter.to}.csv`;a.click()}
  catch(e){if(!c.signal.aborted)setError((e as Error).message)}finally{if(url)window.setTimeout(()=>URL.revokeObjectURL(url),10_000);setExporting(false)}
 }
 const sorted=data?[...data.members].filter(m=>`${m.name} ${m.email} ${m.role}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>b[sort]-a[sort]||a.email.localeCompare(b.email)):[];
 return <section className={styles.analytics} data-testid='enterprise-analytics'>
  <div className={styles.sectionHead}><h2>经营概览</h2><div className={styles.actions}><span className={styles.hint}>{data?`更新于 ${time(data.generatedAt).split(' ')[1]||time(data.generatedAt)}`:''}</span><button onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/>刷新</button></div></div>
  <div className={styles.filterBox}>
   <div className={styles.recordsBar}><div className={styles.tabs}>{[['today','今天'],['yesterday','昨天'],['week','本周'],['month','本月'],['last7','近7天'],['last30','近30天'],['custom','自选日期']].map(([id,label])=><button key={id} aria-pressed={preset===id} className={preset===id?styles.active:''} onClick={()=>choosePreset(id)}>{label}</button>)}</div><span className={styles.hint}>北京时间 · 结束日包含当天</span></div>
   <form className={styles.filterRow} onSubmit={e=>{e.preventDefault();if(draft.from&&draft.to&&draft.from<=draft.to){setPreset('custom');update(draft)}else setError('请选择有效的起止日期')}}>
    <label>开始日期<input type='date' aria-label='开始日期' required min='2000-01-01' max='2100-12-31' value={draft.from} onChange={e=>{setPreset('custom');setDraft(d=>({...d,from:e.target.value}))}}/></label>
    <label>结束日期<input type='date' aria-label='结束日期' required min={draft.from||'2000-01-01'} max='2100-12-31' value={draft.to} onChange={e=>{setPreset('custom');setDraft(d=>({...d,to:e.target.value}))}}/></label><button type='submit' className={styles.primary}>查询</button>
    <label>团队<select aria-label='团队范围' value={filter.team} onChange={e=>update({team:e.target.value,email:''})}><option value=''>全部授权范围</option>{teamChoices.map(m=><option key={m.email} value={m.email}>{m.name||m.email}及下级</option>)}</select></label>
    <label>成员<select aria-label='统计成员' value={filter.email} onChange={e=>update({email:e.target.value,team:''})}><option value=''>全部成员</option>{members.map(m=><option key={m.email} value={m.email}>{m.name||m.email}</option>)}</select></label>
    <label>用途<select aria-label='统计用途' value={filter.purpose} onChange={e=>update({purpose:e.target.value})}><option value=''>全部用途</option>{Object.entries(PURPOSES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   </form>
  </div>
  {error&&<p className={styles.error} role='alert'>{error}</p>}
  {loading&&!data?<div className={styles.empty}>读取经营数据…</div>:data&&<>
   <div className={styles.metricGrid}>
    <Metric icon={<Wallet size={20}/>} label='净消耗积分' value={number(data.summary.net)} tone='blue' sub={data.summary.changePercent===null?'上期无正向净消耗':`较上期 ${data.summary.changePercent>=0?'+':''}${number(data.summary.changePercent)}%`} />
    <Metric icon={<TrendingUp size={20}/>} label='实际消费' value={number(data.summary.consumed)} tone='orange' sub={`返还 ${number(data.summary.refunded)} 积分`}/>
    <Metric icon={<Users size={20}/>} label='消费活跃成员' value={`${data.summary.activeMembers} / ${data.summary.scopeMembers}`} tone='green' sub={`${filter.from} 至 ${filter.to}`}/>
    <Metric icon={<Images size={20}/>} label='期间可见作品' value={filter.purpose?'—':number(data.summary.artworks)} tone='purple' sub={filter.purpose?'作品无用途关联':`同期快照 · 每张均耗 ${data.summary.creditsPerArtwork===null?'—':number(data.summary.creditsPerArtwork)}`}/>
   </div>
   <div className={styles.balanceStrip}><span>当前账户快照</span><span>可用积分 <strong>{number(data.summary.available)}</strong></span><span>预占积分 <strong>{number(data.summary.reserved)}</strong></span><span>30天到期本金 <strong>{number(data.summary.expiring)}</strong></span></div>
   <div className={styles.analysisGrid}>
    <article className={styles.analysisCard}><header><h3>积分消耗趋势</h3><div className={styles.tabs}>{[['day','每日'],['week','每周'],['month','每月']].map(([id,label])=><button key={id} className={filter.group===id?styles.active:''} onClick={()=>update({group:id as AnalyticsFilter['group']})}>{label}</button>)}</div></header><Trend rows={data.trend}/><details className={styles.trendDetails}><summary>查看逐期数据 · {data.trend.length} 期</summary><div className={styles.tableWrap}><table><thead><tr><th>日期 / 期起始</th><th>消费</th><th>返还</th><th>净消耗</th><th>作品</th></tr></thead><tbody>{data.trend.map(r=><tr key={r.date}><td>{r.date}</td><td>{number(r.consumed)}</td><td>{number(r.refunded)}</td><td>{number(r.net)}</td><td>{filter.purpose?'—':r.artworks}</td></tr>)}</tbody></table></div></details></article>
    <article className={styles.analysisCard}><header><h3>用途分布</h3><span className={styles.hint}>按实际消费</span></header><div className={styles.purposeList}>{data.purposes.length?data.purposes.map(p=><button key={p.purpose} className={styles.purposeRow} onClick={()=>update({purpose:p.purpose})}><span>{PURPOSES[p.purpose]}</span><strong>{number(p.consumed)}</strong><i style={{width:`${data.summary.consumed?Math.min(100,p.consumed/data.summary.consumed*100):0}%`}}/><small>返还 {number(p.refunded)} · 净消耗 {number(p.net)}</small></button>):<div className={styles.empty}>此期间无消费或返还</div>}</div></article>
   </div>
   <article className={styles.analysisCard}><header><h3>生产效率</h3><span className={styles.hint}>期间发起任务 · 当前状态</span></header><div className={styles.efficiency}><div><strong>{data.summary.tasks}</strong><span>任务 / 操作</span></div><div><strong>{data.summary.succeeded}</strong><span>成功</span></div><div><strong>{data.summary.failed}</strong><span>失败 / 取消</span></div><div><strong>{data.summary.pending}</strong><span>处理中</span></div><div><strong>{data.summary.unknown}</strong><span>待核对 / 未记录</span></div><div><strong>{data.summary.successRate===null?'—':`${number(data.summary.successRate)}%`}</strong><span>已知终态成功率</span></div></div></article>
   <article className={styles.analysisCard}><header><h3>成员消耗与产出</h3><div className={styles.actions}><input className={styles.search} aria-label='搜索成员排行' placeholder='搜索成员 / 岗位' value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label='排行排序' value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value='net'>净消耗排序</option><option value='artworks'>作品排序</option><option value='tasks'>任务排序</option></select></div></header><div className={styles.tableWrap}><table><thead><tr><th>成员 / 岗位</th><th>消费</th><th>返还</th><th>净消耗</th><th>作品</th><th>成功 / 失败 / 处理 / 未知</th><th>可用 / 预占</th><th>操作</th></tr></thead><tbody>{sorted.map(m=><tr key={m.email}><td><strong>{m.name}</strong><small>{m.role}{m.employment==='intern'?' · 实习生':''}</small></td><td>{number(m.consumed)}</td><td>{number(m.refunded)}</td><td><strong>{number(m.net)}</strong></td><td>{filter.purpose?'—':m.artworks}</td><td>{m.succeeded} / {m.failed} / {m.pending} / {m.unknown}</td><td>{number(m.available)} / {number(m.reserved)}</td><td><div className={styles.rowActions}><button onClick={()=>drill(m.email)}>流水<ChevronRight size={12}/></button>{m.email!==snapshot.enterprise.owner_email&&<button onClick={()=>onMember(m.email)}>作品</button>}</div></td></tr>)}</tbody></table>{!sorted.length&&<div className={styles.empty}>没有匹配的成员</div>}</div></article>
   <article className={styles.analysisCard}><header><h3><AlertTriangle size={16}/>当前风险</h3><span className={styles.hint}>不受历史日期 / 用途影响</span></header><div className={styles.riskGrid}>{data.risks.map(r=><details key={r.code} className={r.count?styles.riskAlert:styles.riskClear}><summary><span>{riskLabels[r.code]}</span><strong>{r.count} 人</strong></summary>{r.count>0&&<div>{r.amount>0&&<p>{number(r.amount)} 积分</p>}{r.members.map(m=><button key={m.email} onClick={()=>drill(m.email)}>{m.name}</button>)}</div>}</details>)}</div></article>
   <article className={styles.analysisCard} id='enterprise-ledger'><header><h3>积分明细 <small>{number(data.details.total)} 条</small></h3><div className={styles.actions}><select aria-label='流水类型' value={filter.kind} onChange={e=>update({kind:e.target.value})}><option value=''>全部变动</option>{Object.entries(EVENT_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button onClick={()=>void download()} disabled={exporting||loading}><Download size={14}/>{exporting?'导出中…':'导出筛选结果'}</button></div></header><div className={styles.tableWrap}><table><thead><tr><th>北京时间</th><th>成员</th><th>用途</th><th>类型</th><th>积分变动</th><th>流水 / 操作编号</th></tr></thead><tbody>{data.details.rows.map(r=><tr key={r.id}><td>{time(r.createdAt)}</td><td>{r.name}</td><td>{r.kind==='consume'||r.kind==='refund'?PURPOSES[r.purpose]:'—'}<small>{r.kind==='consume'||r.kind==='refund'?r.source:''}</small></td><td>{EVENT_LABELS[r.kind]}</td><td className={r.delta>0?styles.positive:styles.negative}>{r.delta>0?'+':''}{number(r.delta)}</td><td className={styles.identifier}><code>{r.id}</code>{r.operationId&&<small>{r.operationId}</small>}</td></tr>)}</tbody></table>{!data.details.rows.length&&<div className={styles.empty}>此筛选条件下没有流水</div>}</div><div className={styles.pager}><button disabled={filter.page<=1||loading} onClick={()=>update({page:filter.page-1})}>上一页</button><span>{filter.page} / {Math.max(1,Math.ceil(data.details.total/25))}</span><button disabled={filter.page*25>=data.details.total||loading} onClick={()=>update({page:filter.page+1})}>下一页</button></div></article>
   <details className={styles.method}><summary>指标口径与期间其他变动</summary><p>净消耗 = 实际消费 − 积分返还；预占、发放、调账和过期不计创作消费。上期为紧邻的相同日数。余额是当前快照。</p><p>期间发放 / 购买 {number(data.summary.issued)}；管理员调账 {number(data.summary.adjustment)}；过期 {number(data.summary.expired)}。用途未记录 {data.summary.unclassified} 条。</p><p>作品按创建时间统计当前可见记录，包含保留时间的历史副本，不等同生成张数。任务包含异步及可追溯同步操作，未知结果不纳入成功率；流水类型仅筛选明细。周一为每周期起始。</p></details>
  </>}
 </section>;
}
function Metric({icon,label,value,sub,tone}:{icon:React.ReactNode;label:string;value:string;sub:string;tone:string}){return <article className={`${styles.metric} ${styles[tone]}`}><div>{icon}<span>{label}</span></div><strong>{value}</strong><small>{sub}</small></article>}
function Trend({rows}:{rows:EnterpriseAnalytics['trend']}){
 const width=700,height=185,top=18,bottom=155,values=rows.flatMap(r=>[r.consumed,r.refunded,r.net]),min=Math.min(0,...values),max=Math.max(1,...values),y=(n:number)=>bottom-(n-min)/(max-min)*(bottom-top),x=(i:number)=>36+i/Math.max(1,rows.length-1)*(width-56);
 const line=(key:'consumed'|'refunded'|'net')=>rows.map((r,i)=>`${x(i)},${y(r[key])}`).join(' ');
 return <div className={styles.trend}><svg viewBox={`0 0 ${width} ${height}`} role='img' aria-label='积分消费返还与净消耗趋势'>
  {[min,(min+max)/2,max].map((n,i)=><g key={i}><line x1='36' x2={width-20} y1={y(n)} y2={y(n)} stroke='#e8edf4'/><text x='0' y={y(n)+4} fontSize='10' fill='#8390a6'>{number(n)}</text></g>)}
  <polyline points={line('consumed')} fill='none' stroke='#e9a444' strokeWidth='2'/><polyline points={line('refunded')} fill='none' stroke='#35a989' strokeWidth='2'/><polyline points={line('net')} fill='none' stroke='#447de1' strokeWidth='2.5'/>
  {rows.length===1&&<circle cx={x(0)} cy={y(rows[0].net)} r='3' fill='#447de1'/>}
  <text x='36' y='180' fontSize='11' fill='#8390a6'>{rows[0]?.date}</text><text x={width-20} y='180' textAnchor='end' fontSize='11' fill='#8390a6'>{rows.at(-1)?.date}</text>
 </svg><div className={styles.legend}><span>● 净消耗</span><span>● 消费</span><span>● 返还</span></div></div>;
}
