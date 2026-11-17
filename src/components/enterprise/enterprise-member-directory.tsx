'use client';

import {useEffect,useMemo,useState} from 'react';
import {Eye} from 'lucide-react';
import {matchesUserPosition} from '@/lib/accounts/positions';
import {USERNAME_DOMAIN} from '@/lib/account-identity';
import type {EnterpriseMember} from '@/lib/enterprise/contracts';
import styles from './enterprise.module.css';

const PAGE_SIZE=50;
const identity=(email:string)=>email.endsWith(`@${USERNAME_DOMAIN}`)?email.slice(0,email.lastIndexOf('@')):email;
const datetime=(value:string|null)=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'永久';

export function EnterpriseMemberDirectory({members,dedicated,position,owner,pending,accountLocked,onAccount,onCreation,onEdit,onStatus}:{
  members:EnterpriseMember[];dedicated:boolean;position:string;owner:boolean;pending:boolean;accountLocked:boolean;
  onAccount:(member:EnterpriseMember)=>void;onCreation?: (member:EnterpriseMember)=>void;
  onEdit:(kind:'organization'|'expiry',member:EnterpriseMember)=>void;onStatus:(member:EnterpriseMember,banned:boolean)=>void;
}){
  const [page,setPage]=useState(1),[search,setSearch]=useState('');
  const query=search.trim().toLowerCase();
  const filtered=useMemo(()=>query||dedicated&&position ? members.filter(member=>
    (!dedicated||matchesUserPosition(member.position,position))&&
    (!query||(member.name||'').toLowerCase().includes(query)||member.email.toLowerCase().includes(query))) : members,[members,dedicated,position,query]);
  const names=useMemo(()=>new Map(members.map(member=>[member.email,member.name])),[members]);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),current=Math.min(page,pages);
  useEffect(()=>{if(page>pages)setPage(pages);},[page,pages]);
  const first=(current-1)*PAGE_SIZE,visible=filtered.slice(first,first+PAGE_SIZE);
  const now=Date.now();
  return <>
    {(members.length>PAGE_SIZE||search)&&<label className={styles.memberSearch}>搜索成员
      <input type='search' placeholder='姓名或账号' value={search} onChange={event=>{setPage(1);setSearch(event.target.value);}}/>
    </label>}
    <div className={styles.tableWrap}>
      <table aria-label='企业成员'><thead><tr><th>成员 / 账号</th>{dedicated&&<th>岗位</th>}<th>权限角色 / 级别</th><th>直属上级</th><th>用工 / 访问期限</th><th>成员状态 / 账号</th><th>操作</th></tr></thead>
        <tbody>{visible.map(member=>{
          const suspended=member.membership_status==='suspended';
          const status=suspended?'已暂停':member.membership_expires_at&&Date.parse(member.membership_expires_at)<=now?'身份到期':'正常';
          return <tr key={member.email}>
            <td><strong>{member.name||identity(member.email)}</strong><small title={member.email}>{identity(member.email)}</small></td>
            {dedicated&&<td>{member.position||'未分组'}</td>}<td>{member.role_name}<small>{member.level===999?'基础成员':`L${member.level}`}</small></td>
            <td>{names.get(member.supervisor_email)||identity(member.supervisor_email)}</td>
            <td>{member.employment==='permanent'?'正式员工':'实习生'}<small>{datetime(member.membership_expires_at)}</small></td>
            <td><span className={`${styles.badge} ${status!=='正常'?styles.inactive:''}`}>{status}</span><small>{member.banned?'账号已封禁':member.account_expires_at&&Date.parse(member.account_expires_at)<=now?'账号已到期':'账号正常'}</small></td>
            <td><div className={styles.rowActions}>
              {dedicated&&owner&&member.account_role!=='admin'&&<button disabled={accountLocked} onClick={()=>onAccount(member)}>账号与积分</button>}
              {onCreation&&<button onClick={()=>onCreation(member)}><Eye size={14}/>创作</button>}
              {member.canManage&&<>
                {owner&&<button disabled={pending} onClick={()=>onEdit('organization',member)}>岗位与上级</button>}
                <button disabled={pending} onClick={()=>onEdit('expiry',member)}>身份期限</button>
                <button disabled={pending} onClick={()=>{if(window.confirm(`${suspended?'恢复':'暂停'} ${member.name||identity(member.email)} 的管理与创作访问权限？`))onStatus(member,!suspended);}}>{suspended?'恢复身份':'暂停身份'}</button>
              </>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
      {!filtered.length&&<div className={styles.empty}>{query?'没有匹配的成员':position?'当前岗位暂无成员':'当前范围暂无成员'}</div>}
    </div>
    {pages>1&&<nav className={styles.memberPages} aria-label='成员分页'>
      <span aria-live='polite'>{first+1}–{first+visible.length} / {filtered.length} 人</span>
      <button type='button' disabled={current<=1||pending||accountLocked} onClick={()=>setPage(current-1)}>上一页</button>
      <button type='button' disabled={current>=pages||pending||accountLocked} onClick={()=>setPage(current+1)}>下一页</button>
    </nav>}
  </>;
}
