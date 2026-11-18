'use client';
import {useEffect,useRef,useState} from 'react';
import {AdminQueryInput} from '@/components/admin/query-input';
import { useAppSearchParams } from '@/lib/app-router-navigation';
import {replaceAdminQuery} from '@/components/admin/query-navigation';
import {ArrowLeft,ChevronRight,ImageIcon,RefreshCw,X} from 'lucide-react';
import {authHeader} from '@/lib/supabase';
import {useAuth} from '@/lib/auth-context';
import Markdown from 'react-markdown';
import type {CreationListPage,CreationAsset,CreationFailure} from '@/lib/saas/creation-contracts';
import styles from './saas.module.css';
import {queueCreationPreview} from './creation-preview-queue';
import {useCreationEvidence,type CreationEvidenceFeedback,type VisibleCreationDetail} from './use-creation-evidence';
const labels:Record<string,string>={queued:'排队中',running:'处理中',succeeded:'已完成',partial:'部分成功',failed:'失败',cancel_requested:'取消申请中',cancelled:'已取消',needs_review:'待核查'};
function eventSummary(event:{type:string;summary:string}){
 if(event.type==='agent-tool'){try{const detail=JSON.parse(event.summary);if(typeof detail.tool==='string'&&typeof detail.summary==='string')return `${detail.tool} · ${detail.summary}`;}catch{}}
 return event.summary;
}
export function CreationStatus({status}:{status:string}){return <span className={`${styles.badge} ${styles[status]||''}`}>{labels[status]||'未记录'}</span>;}
export function CreationBrowser(props:{tenantId?:string;enterprise?:boolean}){const {user}=useAuth();return <ScopedCreationBrowser key={`${user?.email||'console'}:${props.tenantId||'*'}:${props.enterprise?'enterprise':'platform'}`} {...props}/>;}
function ScopedCreationBrowser({tenantId,enterprise=false}:{tenantId?:string;enterprise?:boolean}){
 const query=useAppSearchParams();const selected=query.get('creationId')||'';
 const platformHistory=!enterprise&&!tenantId;
 const [page,setPage]=useState<CreationListPage|null>(null),[error,setError]=useState(''),[listRevision,refreshList]=useState(0),[loading,setLoading]=useState(true);
 const api=enterprise?'/api/enterprise/creations':'/api/admin/creations';
 const sessionEnded=useRef(false),listRead=useRef<AbortController|null>(null);
 const {detail,error:detailError,reload:reloadDetails,endSession:endEvidence,eventFeedback,assetFeedback,childFeedback}=
  useCreationEvidence(api,selected,query.get('eventPage')||'1',query.get('assetPage')||'1',query.get('childPage')||'1',tenantId);
 const reloadList=()=>{if(!sessionEnded.current&&!listRead.current)refreshList(v=>v+1);};
 useEffect(()=>{
  let wasHidden=document.visibilityState==='hidden';
  const refresh=()=>{
    if(document.visibilityState!=='visible'){wasHidden=true;return;}
    if(!wasHidden)return;
    wasHidden=false;
    // Restoring a tab refreshes authorization once. Ordinary window focus
    // (dialogs, file pickers, DevTools) must not restart the reads.
    if(!sessionEnded.current){
      if(!listRead.current)refreshList(v=>v+1);
      reloadDetails();
    }
  };
  const clear=()=>{
  sessionEnded.current=true;listRead.current?.abort();endEvidence();
  setPage(null);setLoading(false);setError('请重新登录');
 };document.addEventListener('visibilitychange',refresh);window.addEventListener('naumi:cache-session-ended',clear);return()=>{document.removeEventListener('visibilitychange',refresh);window.removeEventListener('naumi:cache-session-ended',clear);};},[]);
 const update=(values:Record<string,string>)=>replaceAdminQuery(values,Object.keys(values).some(k=>['q','from','to','period','user','status','source','page'].includes(k))?['creationId','assetPage','eventPage','childPage']:[]);
 const filters=new URLSearchParams();for(const key of ['q','from','to','period','user','status','source','page'])if(query.get(key))filters.set(key,query.get(key)!);if(tenantId)filters.set('tenantId',tenantId);if(filters.get('source')==='legacy')filters.delete('source');filters.set('view','unified');filters.set('projection','list');const filterKey=filters.toString();
 useEffect(()=>{if(sessionEnded.current)return;const abort=new AbortController();listRead.current=abort;setPage(null);setError('');setLoading(true);
  void authHeader().then(headers=>fetch(`${api}?${filterKey}`,{headers,cache:'no-store',signal:abort.signal})).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'记录读取失败');if(!abort.signal.aborted)setPage(d);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(listRead.current===abort)listRead.current=null;if(!abort.signal.aborted)setLoading(false);});return()=>{abort.abort();if(listRead.current===abort)listRead.current=null;};
 },[api,filterKey,listRevision]);
 const artworkParams=new URLSearchParams({section:'artworks'});for(const key of ['q','from','to'])if(query.get(key))artworkParams.set(key,query.get(key)!);if(query.get('user'))artworkParams.set('email',query.get('user')!);
 const allDates=!query.get('from')&&!query.get('to')&&!page?.appliedFilters.from;
 const range=allDates?'全部日期':`${query.get('from')||page?.appliedFilters.from||'不限'} 至 ${query.get('to')||page?.appliedFilters.to||'不限'}`;
 const filtersUi=(<div className={styles.actions} style={{marginBottom:16}}><AdminQueryInput aria-label="搜索创作记录" placeholder="搜索创作记录" value={query.get('q')||''} onCommit={value=>update({q:value,page:'1'})}/><details className={styles.filterMenu}><summary>筛选</summary><div className={styles.filterFields}><AdminQueryInput aria-label="成员账号" type="email" placeholder="成员账号" value={query.get("user")||""} onCommit={value=>update({user:value,page:"1"})}/><input aria-label="开始日期" type="date" value={query.get('from')||page?.appliedFilters.from||''} onChange={e=>update({from:e.target.value,period:'',page:'1'})}/><input aria-label="结束日期" type="date" value={query.get('to')||page?.appliedFilters.to||''} onChange={e=>update({to:e.target.value,period:'',page:'1'})}/><select aria-label="创作状态" value={query.get('status')||''} onChange={e=>update({status:e.target.value,page:'1'})}><option value="">全部状态</option>{Object.entries(labels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></div></details><button aria-label="刷新创作记录" onClick={()=>{reloadList();reloadDetails();}}><RefreshCw size={16}/></button></div>);
 return <div className={styles.page} style={{padding:0,minHeight:0}}>

  {error?<div className={styles.error} role="alert">{error} <button onClick={reloadList}>重试</button></div>:null}
  <div className={styles.detailGrid}>
   <section className={`${styles.panel} ${styles.recordList}`} aria-label="创作记录列表">{filtersUi}<div className={styles.actions}><span className={styles.muted}>{range}</span>{platformHistory&&<a href={`/admin/center?${artworkParams}`}>图片作品</a>}{!allDates&&<button onClick={()=>update({period:'all',from:'',to:'',page:'1'})}>全部日期</button>}</div>{loading?<div className={styles.empty} role="status">正在读取记录</div>:!page?.items.length?<div className={styles.empty}><ImageIcon size={30}/>暂无匹配的创作记录</div>:page.items.map(item=><button aria-pressed={selected===item.id||detail?.id===item.id} className={`${styles.record} ${selected===item.id||detail?.id===item.id?styles.selected:''}`} key={item.id} onClick={()=>update({creationId:item.id,assetPage:"",eventPage:"",childPage:""})}><div><strong>{item.title}</strong><p>{item.actorName} · {new Date(item.acceptedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</p><CreationStatus status={item.status}/>{item.scopeKind==='legacy_unconfirmed'&&<span className={styles.muted} title="历史任务记录，保留原始归属"> · 历史记录</span>}{!enterprise&&item.failure&&<p className={styles.failureSummary}>{item.failure.title}{item.failure.code&&`（${item.failure.code}）`}</p>}</div><ChevronRight size={16}/></button>)}
   {page&&<div className={styles.pager}><span>共 {page.pagination.total} 次创作</span><div className={styles.actions}><button aria-label="上一页" disabled={page.pagination.page===1} onClick={()=>update({page:String(page.pagination.page-1)})}>‹</button><span>{page.pagination.page}</span><button aria-label="下一页" disabled={page.pagination.page*page.pagination.size>=page.pagination.total} onClick={()=>update({page:String(page.pagination.page+1)})}>›</button></div></div>}</section>
   <section className={`${styles.panel} ${selected?styles.detail:''}`} aria-label="创作全链路详情">{selected&&<button className={styles.mobileBack} onClick={()=>update({creationId:''})}><ArrowLeft size={15}/>返回列表</button>}{detailError?<div className={styles.error} role="alert">{detailError}<button onClick={reloadDetails}>重试</button></div>:detail?<CreationDetailView detail={detail} api={api} tenantId={tenantId} eventFeedback={eventFeedback} assetFeedback={assetFeedback} childFeedback={childFeedback} onPage={(key,value)=>update({[key]:String(value)})} onChild={id=>update({creationId:id,assetPage:'',eventPage:'',childPage:''})}/>:<div className={styles.empty}>{selected?'正在读取详情':'选择创作记录查看输入、结果与费用'}</div>}</section>
  </div>
 </div>;
}
export function CreationDetailView({detail,api,tenantId,eventFeedback,assetFeedback,childFeedback,onPage,onChild}:{detail:VisibleCreationDetail;api:string;tenantId?:string;eventFeedback?:CreationEvidenceFeedback;assetFeedback?:CreationEvidenceFeedback;childFeedback?:CreationEvidenceFeedback;onPage?:(key:string,value:number)=>void;onChild?:(id:string)=>void}){
 const [showProcessed,setShowProcessed]=useState(false);
 useEffect(()=>setShowProcessed(false),[detail.id]);
 const outputs=detail.assets.filter(a=>a.direction==='output'&&a.role!=='reply'),replies=detail.assets.filter(a=>a.direction==='output'&&a.role==='reply'),inputs=detail.assets.filter(a=>a.direction==='input'&&a.variant!=='processed'),processed=detail.assets.filter(a=>a.direction==='input'&&a.variant==='processed');
 const assetApi=(asset:CreationAsset)=>{
  const q=new URLSearchParams();if(tenantId)q.set('tenantId',tenantId);if(asset.evidenceRecordId)q.set('evidenceRecord',asset.evidenceRecordId);
  return `${api}/${detail.id}/assets/${asset.id}${q.size?`?${q}`:''}`;
 };
 const media=(assets:CreationAsset[],result=false)=><div className={styles.mediaGrid}>{assets.map((a,i)=><CreationMedia key={`${detail.id}:${a.id}`} asset={a} title={result?(assets.length>1?`结果 ${i+1}`:''):undefined} api={assetApi(a)}/>)}</div>;
 const count=(v:number|null)=>v===null?(detail.billing.state==='not_applicable'?'不适用':'未记录'):`${v} 积分`;
 return <><div className={styles.detailTitle}><div><h2>{detail.title}</h2><p>{detail.actorName} · {new Date(detail.acceptedAt).toLocaleString('zh-CN')}</p></div><CreationStatus status={detail.status}/></div>
 {detail.evidencePending&&<p role="status" className={styles.error}>部分执行资料待核查，结果与账务按已记录证据显示。</p>}
  {api==='/api/admin/creations'&&detail.failure&&<CreationFailureView failure={detail.failure}/>}
 {outputs.length>0&&<section className={styles.mediaSection} aria-label="生成结果"><h3>生成结果</h3>{media(outputs,true)}</section>}
 {replies.length>0&&<section className={styles.mediaSection} aria-label="最终答复"><h3>最终答复</h3>{replies.map(reply=><div key={reply.id} style={{lineHeight:1.75,overflowWrap:'anywhere'}}><Markdown skipHtml components={{img:({alt})=><span>{alt||'图片'}</span>,a:({children})=><span>{children}</span>}}>{reply.text||''}</Markdown></div>)}</section>}
 {inputs.length>0&&<section className={styles.mediaSection} aria-label="输入素材"><h3>输入素材</h3>{media(inputs)}</section>}
 {processed.length>0&&<details className={styles.technical} open={showProcessed} onToggle={e=>setShowProcessed(e.currentTarget.open)}><summary>处理后输入（{processed.length}）</summary>{showProcessed&&media(processed)}</details>}
 <EvidencePager label="素材" page={detail.assetPagination} onPage={value=>onPage?.('assetPage',value)}/>
 {assetFeedback?.error?<div className={styles.error} role="alert">{assetFeedback.error} <button onClick={assetFeedback.retry}>重试素材</button></div>:
  assetFeedback?.loading?<div className={styles.empty} role="status">正在读取素材</div>:
  !detail.assets.length&&<div className={styles.empty} style={{minHeight:130}}>{detail.assetPagination.total>0?'本页没有素材':'输入与产物素材未记录'}</div>}
 <dl><div className={styles.facts}><dt>原始要求</dt><dd>{detail.request.state==='recorded'?detail.request.text||'已记录为空':'未记录'}</dd></div><div className={styles.facts}><dt>创作参数</dt><dd className={styles.creationParameters}>{detail.parameters.state==='recorded'?<><ParameterChips values={detail.parameters.values}/ ><ImageExecutionParameters value={detail.parameters.values.executionPlans}/></>:'未记录'}{detail.model.label&&<span className={styles.modelChip}>模型：{detail.model.label}</span>}</dd></div></dl>
 <h3 style={{marginTop:18,fontSize:16}}>执行过程</h3>{eventFeedback?.error?
  <div className={styles.error} role="alert">{eventFeedback.error} <button onClick={eventFeedback.retry}>重试执行事件</button></div>:eventFeedback?.loading?
  <div className={styles.empty} style={{minHeight:70}} role="status">正在读取执行事件</div>:
  detail.events.length?<ol aria-label="执行事件" className={styles.creationTimeline}>{detail.events.map(e=><li key={e.id} className={styles.creationEvent}><strong>{eventSummary(e)}</strong><span className={styles.muted}>{new Date(e.occurredAt).toLocaleTimeString('zh-CN')}</span><CreationStatus status={e.status}/></li>)}</ol>:<div className={styles.empty} style={{minHeight:70}}>{(detail.eventPagination?.total??0)>0?'本页没有执行事件':'执行事件未记录'}</div>}
 <EvidencePager label="执行事件" page={detail.eventPagination} onPage={value=>onPage?.('eventPage',value)}/>
 {(detail.childPagination.total>0||childFeedback?.loading||childFeedback?.error)&&<details className={styles.technical}><summary>关联子任务（{detail.childPagination.total}）</summary>
  {childFeedback?.error?<div className={styles.error} role="alert">{childFeedback.error} <button onClick={childFeedback.retry}>重试子任务</button></div>:
   childFeedback?.loading?<div role="status" className={styles.empty}>正在读取子任务</div>:
   detail.children.length?detail.children.map(child=><button key={child.id} className={styles.record} onClick={()=>onChild?.(child.id)}><span>{child.title}</span><CreationStatus status={child.status}/></button>):<div className={styles.empty}>本页没有子任务</div>}
  <EvidencePager label="子任务" page={detail.childPagination} onPage={value=>onPage?.('childPage',value)}/></details>}
 <div className={styles.billing}><strong>费用结算</strong><span>报价 {count(detail.billing.quoted)}</span><span>预占 {count(detail.billing.reserved)}</span><span>实扣 <b>{count(detail.billing.charged)}</b></span><span>释放预占 {count(detail.billing.released)}</span><span>退款 {count(detail.billing.refunded)}</span></div><p className={styles.muted}>扣款账户：{detail.billing.payerAccountId||'未记录'} · {detail.billing.state==='settled'?'已结算':detail.billing.state==='pending'?'待结算':detail.billing.state==='not_applicable'?'无需扣费':'账务未记录'}</p>
 {detail.billing.operations.length>0&&<details className={styles.technical}><summary>关联账务操作</summary>{detail.billing.operations.map(o=><p key={o.id} style={{marginTop:10,overflowWrap:'anywhere'}}>{o.id} · {o.state} · {count(o.charged)}</p>)}</details>}
 {detail.technical&&<details className={styles.technical}><summary>技术与来源信息</summary><pre>{JSON.stringify(detail.technical,null,2)}</pre></details>}</>;
}
export function CreationFailureView({failure:f}:{failure:CreationFailure}){
 const state:Record<string,string>={unknown:'待确认',pending:'待确认',started:'已发起，结果待确认',submitted:'已提交，结果待确认',accepted:'已受理，结果待确认',rejected:'已拒绝','response-received':'已收到响应','stream-completed':'响应流已结束',completed:'已完成',failed:'失败',cancelled:'已取消',reported:'已有费用回执',reconciled:'已对账',estimated:'暂估',not_charged:'明确未扣费',released:'预占已释放',settled:'已结算',reserved:'预占中',hold:'待核对',manual:'待人工核对'};
 const amount=(v:number|null)=>v===null?'未确认':`${v} 积分`;
 return <section className={styles.failurePanel} aria-label="失败原因"><h3>{f.title}{f.code&&<code>{f.code}</code>}</h3><p>{f.description}</p><dl>
  <div><dt>失败阶段</dt><dd>{f.stage}</dd></div>
  <div><dt>依据</dt><dd>{f.evidence==='supplier_receipt'?'原供应调用回执':f.evidence==='task_state'?'原任务状态':'未记录'}{f.observedAt&&` · ${new Date(f.observedAt).toLocaleString('zh-CN')}`}</dd></div>
  {f.supplier&&<><div><dt>供应通道 / 模型</dt><dd>{f.supplier.provider||'未记录'} / {f.supplier.model||'未记录'}</dd></div><div><dt>供应结果 / 费用</dt><dd>{state[f.supplier.state]||'待确认'} / {state[f.supplier.costStatus]||'待确认'}</dd></div></>}
  <div><dt>对应任务账务</dt><dd>{f.customerBilling?`${state[f.customerBilling.state]||'待确认'} · 实扣 ${amount(f.customerBilling.charged)} · 剩余预占 ${amount(f.customerBilling.reserved)}`:'该失败步骤未记录账务，本轮结算单独列出'}</dd></div>
  {f.diagnosis&&<>
   <div><dt>原因确认状态</dt><dd>{{confirmed:'已确认异常',unconfirmed:'执行结果待确认',evidence_missing:'证据待补齐'}[f.diagnosis.certainty]}</dd></div>
   {f.diagnosis.facts.length>0&&<div><dt>已记录事实</dt><dd>{f.diagnosis.facts.map(fact=><p key={fact}>{fact}</p>)}</dd></div>}
   {f.diagnosis.missing.length>0&&<div><dt>缺失的证据</dt><dd>{f.diagnosis.missing.map(item=><p key={item}>{item}</p>)}</dd></div>}
   {f.diagnosis.taskId&&<div><dt>执行任务 ID</dt><dd><code>{f.diagnosis.taskId}</code></dd></div>}
   {f.diagnosis.callId&&<div><dt>供应调用 ID</dt><dd><code>{f.diagnosis.callId}</code></dd></div>}
   {f.diagnosis.requestId&&<div><dt>供应请求 / 任务 ID</dt><dd><code>{f.diagnosis.requestId}</code></dd></div>}
   {f.diagnosis.nextChecks.length>0&&<div><dt>核对步骤</dt><dd><ol>{f.diagnosis.nextChecks.map(item=><li key={item}>{item}</li>)}</ol></dd></div>}
  </>}
 </dl></section>;
}
function EvidencePager({label,page,onPage}:{label:string;page?:{page:number;size:number;total:number};onPage:(value:number)=>void}){if(!page||page.total<=page.size)return null;return <div className={styles.pager}><span>{label}共 {page.total} 条</span><div className={styles.actions}><button disabled={page.page<=1} onClick={()=>onPage(page.page-1)}>上一页</button><span>{page.page}</span><button disabled={page.page*page.size>=page.total} onClick={()=>onPage(page.page+1)}>下一页</button></div></div>;}
export function CreationMedia({asset,api,title}:{asset:CreationAsset;api:string;title?:string}){
 const caption=title??(asset.direction==='output'?'生成结果':Array.from(new Set((asset.roles?.length?asset.roles:[asset.role]).map(role=>role==='mask'?'蒙版':role==='edit-target'?'上传原图':'参考图'))).join(' · '));
 const [url,setUrl]=useState(''),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[zoom,setZoom]=useState(false);const close=useRef<HTMLButtonElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const container=useRef<HTMLDivElement>(null),[visibleApi,setVisibleApi]=useState('');
 useEffect(()=>{
  const element=container.current;if(!element)return;
  if(typeof IntersectionObserver==='undefined'){setVisibleApi(api);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisibleApi(api);observer.disconnect();}},{rootMargin:'200px'});
  observer.observe(element);return()=>observer.disconnect();
 },[api]);
 useEffect(()=>{
  setUrl('');setFailed(false);if(visibleApi!==api||asset.availability!=='recorded')return;
  const image=asset.mediaType==='image',playback=['video','audio'].includes(asset.mediaType);if(!image&&!playback)return;
  const abort=new AbortController();let objectUrl='';
  void queueCreationPreview(abort.signal,async()=>{
   if(abort.signal.aborted)return;
   const headers=await authHeader();
   if(abort.signal.aborted)return;
   const response=await fetch(image?api:`${api}${api.includes('?')?'&':'?'}playback=1`,{headers,cache:'no-store',signal:abort.signal});
   if(!response.ok)throw new Error();
   if(image){const blob=await response.blob();if(abort.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);}
   else{const data=await response.json();if(!abort.signal.aborted)setUrl(data.url);}
  }).catch(()=>{if(!abort.signal.aborted)setFailed(true);});
  return()=>{abort.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);setZoom(false);};
 },[api,visibleApi,asset.mediaType,asset.availability,retry]);
 useEffect(()=>{if(!zoom)return;const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';close.current?.focus();const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();setZoom(false);}if(e.key==='Tab'){e.preventDefault();close.current?.focus();}};document.addEventListener('keydown',escape);return()=>{document.removeEventListener('keydown',escape);document.body.style.overflow=oldOverflow;trigger.current?.focus();};},[zoom]);
 return <div ref={container} className={styles.mediaBox}>{caption&&<h3>{caption}</h3>}{asset.availability!=='recorded'?<div className={styles.mediaFailure}>{asset.availability==='not_recorded'?(asset.variant==='original'?'原始素材未记录':'素材未记录'):'素材不可用'}</div>:asset.mediaType==='image'?url&&!failed?<button ref={trigger} style={{padding:0,border:0,width:'100%'}} aria-label="放大图片" onClick={()=>setZoom(true)}><img src={url} alt={`${asset.role} ${(asset.inputPosition??asset.position)+1}`} loading="lazy" decoding="async" onError={()=>setFailed(true)}/></button>:<div className={styles.mediaFailure}>{failed?'素材不可用':'正在读取素材'}{failed&&<button onClick={()=>setRetry(v=>v+1)}>重试读取</button>}</div>:['video','audio'].includes(asset.mediaType)?failed?<div className={styles.mediaFailure}>素材不可用<button onClick={()=>setRetry(v=>v+1)}>重试读取</button></div>:url?asset.mediaType==='video'?<video controls preload="none" src={url} onError={()=>setFailed(true)}/>:<audio controls preload="none" src={url} onError={()=>setFailed(true)}/>:<div className={styles.mediaFailure}>正在读取素材</div>:<p>{asset.text||`${asset.mime||'文件'} · ${asset.bytes??'未知'} 字节`}</p>}{zoom&&url&&!failed&&<div role="dialog" aria-modal="true" aria-label="图片预览" className={styles.lightbox} onClick={()=>setZoom(false)}><button ref={close} onClick={()=>setZoom(false)} aria-label="关闭预览"><X size={20}/></button><img src={url} alt={asset.role} onClick={e=>e.stopPropagation()}/></div>}</div>;
}

function ParameterChips({values}:{values:Record<string,unknown>}){const labels:Record<string,string>={ratio:'比例',resolution:'分辨率',quality:'质量',quantity:'数量',count:'数量',seconds:'时长',size:'尺寸',background:'背景',format:'格式',compression:'压缩',mode:'模式',width:'宽',height:'高',inputFidelity:'输入保真',moderation:'审核'};const entries=Object.entries(values).flatMap(([k,v]):[string,unknown][]=>v&&typeof v==='object'?Object.entries(v as Record<string,unknown>):[[k,v]]).filter(([,v])=>['string','number','boolean'].includes(typeof v));return <span className={styles.parameterChips}>{entries.map(([k,v],i)=><span key={`${k}-${i}`}><b>{labels[k]||k}</b> {String(v)}</span>)}</span>;}

function ImageExecutionParameters({value}:{value:unknown}){
 if(!value||typeof value!=='object')return null;
 const plans=Object.values(value as Record<string,any>).filter(p=>p?.version===1&&p.requested&&p.wire);
 if(!plans.length)return null;
 return <details className={styles.technical}><summary>实际发送参数</summary>{plans.map((p,i)=><div key={i}><strong>{p.upstreamId}</strong><div>用户选择：{p.requested.resolution} / {p.requested.quality} / {p.requested.ratio}</div><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(p.wire,null,2)}</pre></div>)}</details>;
}
