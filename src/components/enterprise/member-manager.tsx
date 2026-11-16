'use client';
import {useEffect,useRef,useState} from 'react';
import type {EnterpriseMember,EnterpriseSnapshot} from '@/lib/enterprise/contracts';
import {loginIdentifierToEmail} from '@/lib/account-identity';
import styles from './member-manager.module.css';
import {USER_POSITIONS} from '@/lib/accounts/positions';

export function EnterpriseMemberManager({snapshot,member,onSaved,onLockChange}:{snapshot:EnterpriseSnapshot;member?:EnterpriseMember;onSaved:()=>void;onLockChange?:(locked:boolean)=>void}){
 const [action,setAction]=useState(member?'profile':'create');
 const [email,setEmail]=useState(member?.email||''),[name,setName]=useState(member?.name||''),[phone,setPhone]=useState(member?.phone||''),[note,setNote]=useState(member?.note||'');
 const [position,setPosition]=useState(member?.position||'');
 const [password,setPassword]=useState(''),[credits,setCredits]=useState('0'),[months,setMonths]=useState('24'),[reason,setReason]=useState('');
 const [roleId,setRoleId]=useState(snapshot.roles.find(r=>r.name==='正式员工')?.id||snapshot.roles.at(-1)?.id||'');
 const [supervisor,setSupervisor]=useState(snapshot.enterprise.owner_email),[employment,setEmployment]=useState('permanent'),[expiry,setExpiry]=useState('');
 const [review,setReview]=useState<Record<string,unknown>|null>(null),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const locked=useRef(false);
 const originalVersions=useRef(member?{expectedVersion:member.version,expectedUserVersion:member.management_version}:{});
 useEffect(()=>{const guard=busy||uncertain;onLockChange?.(guard);if(!guard)return;const before=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[busy,uncertain,onLockChange]);
 if(!snapshot.actor.owner||member?.account_role==='admin')return null;
 const labels:Record<string,string>={create:'新增成员',profile:'编辑资料','reset-password':'重置密码',adjust:'调整积分'};
 function prepare(event:React.FormEvent){event.preventDefault();setError('');const base={id:crypto.randomUUID(),enterpriseId:snapshot.enterprise.id,email:loginIdentifierToEmail(email),action,reason};
  // A background member refresh must not give an old form the latest CAS version.
  const versions=originalVersions.current;
  if(action==='create')setReview({...base,name,phone,note,password,initialCredits:Number(credits),months:Number(months),roleId,supervisorEmail:supervisor,employment,expiresAt:employment==='intern'&&expiry?new Date(expiry).toISOString():null});
  else if(action==='profile')setReview({...base,...versions,name,phone,note,position});
  else if(action==='reset-password')setReview({...base,...versions,password});
  else if(!Number.isSafeInteger(Number(credits))||Number(credits)===0)setError('请输入非零整数积分');
  else setReview({...base,...versions,delta:Number(credits),months:Number(months)});
 }
 async function save(){if(!review||locked.current)return;locked.current=true;setBusy(true);setError('');try{
  const response=await fetch('/api/enterprise/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(review)});const body=await response.json();
  setUncertain(body.uncertain===true||response.status>=500);if(!response.ok)throw new Error(body.error||'保存失败');setPassword('');setReview(null);onLockChange?.(false);onSaved();
 }catch(e){if(e instanceof TypeError||e instanceof SyntaxError){setUncertain(true);setError('响应未确认，请重试同一操作');}else setError(e instanceof Error?e.message:'保存失败');}finally{locked.current=false;setBusy(false);}}
 const input=(label:string,value:string,set:(value:string)=>void,props:React.InputHTMLAttributes<HTMLInputElement>={})=><label>{label}<input aria-label={label} value={value} onChange={e=>set(e.target.value)} {...props}/></label>;
 return <section className={styles.panel} aria-label="成员账号管理"><h3>{labels[action]}</h3>{review?<div className={styles.review}>
  <dl><dt>目标账号</dt><dd>{String(review.email)}</dd><dt>操作</dt><dd>{labels[String(review.action)]}</dd>{('initialCredits'in review||'delta'in review)&&<><dt>积分变动</dt><dd>{String(review.initialCredits??review.delta)}</dd></>}<dt>原因</dt><dd>{String(review.reason)}</dd></dl>
  {action==='profile'&&<p>岗位：{String(review.position)||'未分组'}</p>}
  {action==='reset-password'&&<p>旧登录会话将失效，密码不写入操作日志。</p>}
  <div className={styles.actions}><button disabled={busy||uncertain} onClick={()=>setReview(null)}>返回修改</button><button className={styles.primary} disabled={busy} onClick={()=>void save()}>{busy?'正在保存…':uncertain?'重试同一操作':'确认保存'}</button></div>
 </div>:<form onSubmit={prepare}>
  {member?<label>操作<select aria-label="成员账号操作" value={action} onChange={e=>{setAction(e.target.value);setPassword('');setCredits('0');setError('');}}><option value="profile">编辑资料</option><option value="adjust">调整积分</option><option value="reset-password">重置密码</option></select></label>:input('登录账号（邮箱或花名）',email,setEmail,{required:true,maxLength:254,autoComplete:'off'})}
  {['create','profile'].includes(action)&&<><div className={styles.grid}>{input('花名 / 显示名称',name,setName,{required:true,maxLength:80})}{input('手机号',phone,setPhone,{maxLength:40})}</div><label>对应关系 / 备注<textarea aria-label="对应关系 / 备注" maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label></>}
  {action==='profile'&&<label>岗位<select aria-label="成员岗位" value={position} onChange={e=>setPosition(e.target.value)}>{USER_POSITIONS.map(value=><option key={value} value={value}>{value||'未分组'}</option>)}</select></label>}
  {['create','reset-password'].includes(action)&&input('新登录密码',password,setPassword,{required:true,minLength:8,maxLength:128,type:'password',autoComplete:'new-password'})}
  {action==='create'&&<><div className={styles.grid}><label>权限角色<select aria-label="权限角色" required value={roleId} onChange={e=>setRoleId(e.target.value)}>{snapshot.roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>直属上级<select aria-label="直属上级" value={supervisor} onChange={e=>setSupervisor(e.target.value)}><option value={snapshot.enterprise.owner_email}>企业负责人</option>{snapshot.members.filter(m=>snapshot.roles.some(r=>r.id===m.role_id&&r.manage_members)).map(m=><option key={m.email} value={m.email}>{m.name||m.email}</option>)}</select></label></div><label>成员类型<select aria-label="成员类型" value={employment} onChange={e=>setEmployment(e.target.value)}><option value="permanent">正式员工</option><option value="intern">实习生</option></select></label>{employment==='intern'&&input('企业身份到期时间',expiry,setExpiry,{type:'datetime-local',required:true})}</>}
  {['create','adjust'].includes(action)&&<div className={styles.grid}>{input(action==='create'?'初始积分':'积分增减',credits,setCredits,{type:'number',required:true,step:1,min:action==='create'?0:-(member?.available||0),max:1000000})}{input('新增积分有效期（月）',months,setMonths,{type:'number',required:true,min:1,max:120,step:1})}</div>}
  {input('管理原因',reason,setReason,{required:true,minLength:3,maxLength:500})}<div className={styles.actions}><button className={styles.primary} type="submit">检查并确认</button></div>
 </form>}{error&&<p className={styles.error} role="alert">{error}</p>}</section>;
}
