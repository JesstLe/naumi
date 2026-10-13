"use client";
import { CachedImage } from "@/components/cached-image";
import {readBrowserImage} from '@/lib/browser-image-cache';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Building2, Eye, ImageIcon, LayoutDashboard, Plus, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { authHeader } from '@/lib/supabase';
import { USERNAME_DOMAIN } from '@/lib/account-identity';
import type { ContentPage } from '@/lib/teams/contracts';
import type { EnterpriseIdentity, EnterpriseMember, EnterpriseRole, EnterpriseSnapshot } from '@/lib/enterprise/contracts';
import styles from './enterprise.module.css';
import { EnterpriseAnalyticsPanel } from './enterprise-analytics';
type View='overview'|'members'|'roles'|'records';
type Section='artworks'|'tasks';
type Editor={kind:'organization'|'expiry'|'password';member:EnterpriseMember}|{kind:'role';role:EnterpriseRole|null}|null;
const identity=(e:string)=>e.endsWith(`@${USERNAME_DOMAIN}`)?e.slice(0,e.lastIndexOf('@')):e;
const datetime=(v:string|null|undefined)=>v?new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'—';
const inputDate=(v:string|null)=>{if(!v)return '';const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
async function json<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,{cache:'no-store',...init,headers:{...(await authHeader()),...init?.headers}}),body=await r.json();
  if(!r.ok)throw new Error(body.error||'读取失败');return body;
}
function ArtworkImage({src,alt}:{src:string;alt:string}){
  const [url,setUrl]=useState(''),[failed,setFailed]=useState(false);
  useEffect(()=>{const c=new AbortController();let object='';setUrl('');setFailed(false);
      void(async()=>{try{const blob=await readBrowserImage(src,c.signal);if(c.signal.aborted)return;object=URL.createObjectURL(blob);setUrl(object)}catch{if(!c.signal.aborted)setFailed(true)}})();
    return()=>{c.abort();if(object)URL.revokeObjectURL(object)};
  },[src]);
  return url?<CachedImage src={url} alt={alt} loading='lazy'/>:<div className={styles.empty}>{failed?'图片暂不可读取':'加载图片…'}</div>;
}
export function EnterpriseConsole(){
  const {user,ready}=useAuth(),email=user?.email||'console';
  const [entry,setEntry]=useState<{email:string;enterprises:EnterpriseIdentity[]}|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    setEntry(null);setError('');if(!ready)return;
    const controller=new AbortController();let sequence=0;
    const check=async()=>{const n=++sequence;try{const r=await json<{enterprises:EnterpriseIdentity[]}>('/api/enterprise',{signal:controller.signal});if(!controller.signal.aborted&&n===sequence)setEntry({email,enterprises:r.enterprises})}
      catch(e){if(!controller.signal.aborted&&n===sequence){setEntry({email,enterprises:[]});setError((e as Error).message)}}};
    void check();const timer=window.setInterval(check,30_000);window.addEventListener('focus',check);
    return()=>{controller.abort();window.clearInterval(timer);window.removeEventListener('focus',check)};
  },[email,ready]);
  if(!entry||entry.email!==email)return <main className={styles.page}><div className={styles.empty}>加载中…</div></main>;
  if(!entry.enterprises.length)return <main className={styles.page}><section className={styles.empty}><Building2 size={28}/><p>{error||'当前账号没有企业管理权限'}</p><a href='/dashboard'>返回工作台</a></section></main>;
  return <Workspace key={email} enterprises={entry.enterprises}/>;
}
function Workspace({enterprises}:{enterprises:EnterpriseIdentity[]}){
  const [enterpriseId,setEnterpriseId]=useState(enterprises[0].id),[data,setData]=useState<EnterpriseSnapshot|null>(null),[view,setView]=useState<View>('overview');
  const [loading,setLoading]=useState(true),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [selected,setSelected]=useState(''),[section,setSection]=useState<Section>('artworks'),[page,setPage]=useState(1);
  const [content,setContent]=useState<ContentPage|null>(null),[contentLoading,setContentLoading]=useState(false),[contentError,setContentError]=useState('');
  const [editor,setEditor]=useState<Editor>(null),[password,setPassword]=useState(''),[expiry,setExpiry]=useState('');
  const [roleId,setRoleId]=useState(''),[supervisor,setSupervisor]=useState(''),[employment,setEmployment]=useState<'permanent'|'intern'>('permanent');
  const [roleName,setRoleName]=useState(''),[level,setLevel]=useState(100),[manageMembers,setManageMembers]=useState(false),[viewRecords,setViewRecords]=useState(false);
  const command=useRef<{payload:string;id:string}|null>(null),newRoleId=useRef(''),sequence=useRef(0),scopeAbort=useRef<AbortController|null>(null);
  const dialog=useRef<HTMLElement|null>(null);
  useEffect(()=>{if(!editor)return;const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLElement>('input,select,button')?.focus();return()=>previous?.focus()},[editor]);
  const load=useCallback(async()=>{
    const n=++sequence.current;scopeAbort.current?.abort();const controller=new AbortController();scopeAbort.current=controller;setLoading(true);setError('');
    try{const r=await json<EnterpriseSnapshot>(`/api/enterprise?${new URLSearchParams({enterpriseId})}`,{signal:controller.signal});if(n!==sequence.current||controller.signal.aborted)return;setData(r);setSelected(old=>r.members.some(m=>m.email===old)?old:r.members[0]?.email||'')}
    catch(e){if(n===sequence.current&&!controller.signal.aborted){setError((e as Error).message);setData(null);setContent(null);setEditor(null);setPassword('')}}
    finally{if(n===sequence.current&&!controller.signal.aborted)setLoading(false)};
  },[enterpriseId]);
  useEffect(()=>{setData(null);setContent(null);setEditor(null);setPassword('');setSelected('');setPage(1);setView('overview');void load();return()=>{sequence.current++;scopeAbort.current?.abort()}},[load]);
  useEffect(()=>{const check=()=>void load();const timer=window.setInterval(check,30_000);window.addEventListener('focus',check);return()=>{window.clearInterval(timer);window.removeEventListener('focus',check)}},[load]);
  useEffect(()=>{if(!enterprises.some(e=>e.id===enterpriseId))setEnterpriseId(enterprises[0].id)},[enterprises,enterpriseId]);
  useEffect(()=>{
    if(view!=='records'||!selected||!data?.actor.viewRecords){setContent(null);return}
    const c=new AbortController();setContentLoading(true);setContent(null);setContentError('');
    const q=new URLSearchParams({enterpriseId,email:selected,section,page:String(page)});
    json<ContentPage>(`/api/enterprise/content?${q}`,{signal:c.signal}).then(r=>{if(!c.signal.aborted)setContent(r)}).catch(e=>{if(!c.signal.aborted)setContentError(e.message)}).finally(()=>{if(!c.signal.aborted)setContentLoading(false)});
    return()=>c.abort();
  },[view,selected,enterpriseId,section,page,data]);
  async function mutate(body:Record<string,unknown>){
    if(pending)return;const payload=JSON.stringify(body);if(command.current?.payload!==payload)command.current={payload,id:crypto.randomUUID()};setPending(true);setError('');setNotice('');
    try{await json('/api/enterprise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,id:command.current!.id})});command.current=null;setEditor(null);setPassword('');setNotice('已保存');await load()}
    catch(e){setError((e as Error).message)}finally{setPending(false)}
  }
  const body=(m:EnterpriseMember)=>({enterpriseId,email:m.email,expectedVersion:m.version,expectedUserVersion:m.management_version});
  const edit=(kind:'organization'|'expiry'|'password',member:EnterpriseMember)=>{setEditor({kind,member});setPassword('');setExpiry(inputDate(member.account_expires_at));setEmployment(member.employment);setRoleId(member.role_id||'');setSupervisor(member.supervisor_email)};
  const editRole=(role:EnterpriseRole|null)=>{newRoleId.current=role?.id||crypto.randomUUID();setEditor({kind:'role',role});setRoleName(role?.name||'');setLevel(role?.level||100);setManageMembers(role?.manage_members||false);setViewRecords(role?.view_records||false)};
  const label=(e:string)=>data?.members.find(m=>m.email===e)?.name||identity(e);
  const status=(m:EnterpriseMember)=>m.banned?'已停用':m.account_expires_at&&new Date(m.account_expires_at).getTime()<=Date.now()?'已到期':'正常';
  const nav=[{id:'overview' as View,label:'经营概览',icon:LayoutDashboard},{id:'members' as View,label:'组织与成员',icon:Users},...(data?.actor.owner?[{id:'roles' as View,label:'岗位与权限',icon:ShieldCheck}]:[]),...(data?.actor.viewRecords?[{id:'records' as View,label:'图片与操作内容',icon:ImageIcon}]:[])];
  return <main className={styles.page} data-testid='enterprise-console'>
    <aside className={styles.sidebar}><div className={styles.brand}><Building2 size={24}/><span>Naumi<small>企业管理中心</small></span></div><nav>{nav.map(item=>{const Icon=item.icon;return <button key={item.id} className={view===item.id?styles.active:''} aria-pressed={view===item.id} onClick={()=>setView(item.id)}><Icon size={17}/>{item.label}</button>})}</nav><div className={styles.sideFoot}><a href='/dashboard'><ArrowLeft size={15}/>返回工作台</a></div></aside>
    <section className={styles.main}><header className={styles.header}><div><h1>{data?.enterprise.name||'企业管理中心'}</h1><span className={styles.context}>{data?.actor.owner?'全企业':'直属组织范围'}</span></div><div className={styles.actions}>{enterprises.length>1&&<select aria-label='选择企业' value={enterpriseId} onChange={e=>setEnterpriseId(e.target.value)}>{enterprises.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select>}<button disabled={loading||pending} onClick={()=>void load()}><RefreshCw size={15}/>刷新</button></div></header>
      {error&&<p className={styles.error} role='alert'>{error}</p>}{notice&&<p className={styles.notice} role='status'>{notice}</p>}
      {loading&&!data?<div className={styles.empty}>加载中…</div>:!data?<div className={styles.empty}>暂无可管理的企业数据</div>:<>
        {view==='overview'&&(data.actor.viewRecords?<EnterpriseAnalyticsPanel key={enterpriseId} snapshot={data} onMember={email=>{setSelected(email);setSection('artworks');setPage(1);setView('records')}}/>:<div className={styles.empty}>当前岗位未开放经营数据查看权限</div>)}
        {view==='members'&&<div className={styles.pane}><div className={styles.tableWrap}><table><thead><tr><th>成员</th><th>岗位 / 级别</th><th>直属上级</th><th>用工 / 有效期</th><th>状态</th><th>操作</th></tr></thead><tbody>{data.members.map(m=><tr key={m.email}><td><strong>{m.name||identity(m.email)}</strong></td><td>{m.role_name}<small>{m.level===999?'基础成员':`L${m.level}`}</small></td><td>{label(m.supervisor_email)}</td><td>{m.employment==='permanent'?'正式员工':'实习生'}<small>{datetime(m.account_expires_at)}</small></td><td><span className={`${styles.badge} ${status(m)!=='正常'?styles.inactive:''}`}>{status(m)}</span></td><td><div className={styles.rowActions}>
          {data.actor.viewRecords&&<button onClick={()=>{setSelected(m.email);setPage(1);setView('records')}}><Eye size={14}/>内容</button>}{m.canManage&&<>{data.actor.owner&&<button disabled={pending} onClick={()=>edit('organization',m)}>岗位与上级</button>}{m.employment==='intern'&&<button disabled={pending} onClick={()=>edit('expiry',m)}>有效期</button>}<button disabled={pending} onClick={()=>edit('password',m)}>密码</button><button disabled={pending} onClick={()=>{if(window.confirm(`${m.banned?'启用':'停用'}${m.name}？`))void mutate({...body(m),action:'status',banned:!m.banned})}}>{m.banned?'启用':'停用'}</button></>}
        </div></td></tr>)}</tbody></table></div></div>}
        {view==='roles'&&data.actor.owner&&<div className={styles.pane}><div className={styles.sectionHead}><h2>岗位与权限</h2><button className={styles.primary} onClick={()=>editRole(null)}><Plus size={15}/>新增岗位</button></div><div className={styles.roleGrid}>{data.roles.map(r=><article className={styles.roleCard} key={r.id}><header><ShieldCheck size={18}/><h3>{r.name}</h3><span>L{r.level}</span></header><div className={styles.capabilities}><span>{r.manage_members?'管理下级成员':'无成员管理'}</span><span>{r.view_records?'查看范围内作品':'不查看作品'}</span></div><footer><span>{data.members.filter(m=>m.role_id===r.id).length} 位成员</span><button disabled={pending} onClick={()=>editRole(r)}>编辑</button></footer></article>)}</div></div>}
        {view==='records'&&data.actor.viewRecords&&<div className={styles.pane}><div className={styles.recordsBar}><label>成员<select aria-label='选择成员' value={selected} onChange={e=>{setSelected(e.target.value);setPage(1)}}><option value=''>选择成员</option>{data.members.map(m=><option key={m.email} value={m.email}>{m.name||identity(m.email)}</option>)}</select></label><div className={styles.tabs}><button className={section==='artworks'?styles.active:''} onClick={()=>{setSection('artworks');setPage(1)}}>图片</button><button className={section==='tasks'?styles.active:''} onClick={()=>{setSection('tasks');setPage(1)}}>操作任务</button></div></div>
          {!selected?<div className={styles.empty}>请选择成员</div>:contentLoading?<div className={styles.empty}>加载中…</div>:contentError?<p role='alert' className={styles.error}>{contentError}</p>:content&&<><div className={section==='artworks'?styles.gallery:styles.records}>{content.rows.map(row=><article key={String(row.id)} className={styles.record}>{section==='artworks'&&(row.image_url?<ArtworkImage src={`/api/enterprise/media?${new URLSearchParams({enterpriseId,email:selected,id:String(row.id)})}`} alt={String(row.title||'作品')}/>:<div className={styles.empty}>无图片</div>)}<h3>{String(row.title||row.kind||row.id)}</h3><small>{datetime(String(row.created_at))}{row.status?` · ${row.status}`:''}</small>{section==='tasks'&&<><p>{String(row.prompt||'')}</p><p>预估积分：{row.cost}</p></>}</article>)}</div>{!content.rows.length&&<div className={styles.empty}>暂无记录</div>}<div className={styles.pager}><span>共 {content.total} 条</span><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>上一页</button><span>{page}</span><button disabled={page*content.size>=content.total} onClick={()=>setPage(p=>p+1)}>下一页</button></div></>}
        </div>}
      </>}
    </section>
    {editor&&data&&<div className={styles.overlay} onKeyDown={e=>{if(e.key==='Escape'&&!pending){setEditor(null);setPassword('')}if(e.key==='Tab'){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')||[]),first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}}><section ref={dialog} className={styles.dialog} role='dialog' aria-modal='true' aria-labelledby='enterprise-editor-title'><div className={styles.dialogHead}><h2 id='enterprise-editor-title'>{editor.kind==='role'?'岗位设置':editor.kind==='organization'?'岗位与直属上级':editor.kind==='expiry'?'实习生有效期':'重置密码'}</h2><button aria-label='关闭编辑' disabled={pending} onClick={()=>{setEditor(null);setPassword('')}}><X size={18}/></button></div>
      <form onSubmit={e=>{e.preventDefault();if(editor.kind==='role')void mutate({enterpriseId,action:'role',roleId:editor.role?.id||newRoleId.current,expectedVersion:editor.role?.version??null,name:roleName,level,manageMembers,viewRecords});else if(editor.kind==='password')void mutate({...body(editor.member),action:'reset-password',password});else if(editor.kind==='expiry')void mutate({...body(editor.member),action:'expiry',expiresAt:new Date(expiry).toISOString()});else void mutate({...body(editor.member),action:'organization',roleId:roleId||null,supervisorEmail:supervisor,employment,expiresAt:employment==='permanent'?null:new Date(expiry).toISOString()})}}>
        {editor.kind==='role'?<><label>岗位名称<input autoFocus required maxLength={60} value={roleName} onChange={e=>setRoleName(e.target.value)}/></label><label>权限级别<input type='number' required min={1} max={998} value={level} onChange={e=>setLevel(Number(e.target.value))}/><small>数字越小级别越高；老板为最高级</small></label><label className={styles.check}><input type='checkbox' checked={manageMembers} onChange={e=>setManageMembers(e.target.checked)}/>管理直属组织内的下级成员</label><label className={styles.check}><input type='checkbox' checked={viewRecords} onChange={e=>setViewRecords(e.target.checked)}/>查看直属组织内的图片与操作内容</label></>:
        <><p>{editor.member.name}</p>{editor.kind==='password'?<label>新密码<input autoFocus type='password' autoComplete='new-password' required minLength={8} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/><small>保存后原登录会话失效</small></label>:<>{editor.kind==='organization'&&<><label>岗位<select value={roleId} onChange={e=>setRoleId(e.target.value)}><option value=''>基础成员</option>{data.roles.map(r=><option key={r.id} value={r.id}>{r.name} · L{r.level}</option>)}</select></label><label>直属上级<select value={supervisor} onChange={e=>setSupervisor(e.target.value)}><option value={data.enterprise.owner_email}>{identity(data.enterprise.owner_email)}（老板）</option>{data.members.filter(m=>m.email!==editor.member.email&&data.roles.some(r=>r.id===m.role_id&&r.manage_members)).map(m=><option key={m.email} value={m.email}>{m.name} · {m.role_name}</option>)}</select></label><label>用工类型<select value={employment} onChange={e=>setEmployment(e.target.value as typeof employment)}><option value='permanent'>正式员工</option><option value='intern'>实习生 · 限期</option></select></label></>}{(editor.kind==='expiry'||employment==='intern')&&<label>账号截止时间<input type='datetime-local' required value={expiry} onChange={e=>setExpiry(e.target.value)}/></label>}</>}</>}
        {error&&<p role='alert' className={styles.error}>{error}</p>}<div className={styles.dialogActions}><button type='button' disabled={pending} onClick={()=>{setEditor(null);setPassword('')}}>取消</button><button type='submit' className={styles.primary} disabled={pending}>{pending?'保存中…':'保存'}</button></div>
      </form></section></div>}
  </main>;
}
