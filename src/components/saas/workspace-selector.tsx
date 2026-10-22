'use client';
import {useEffect,useState} from 'react';
import {useAuth} from '@/lib/auth-context';
import {authHeader} from '@/lib/supabase';
import {selectWorkspace} from '@/lib/saas/workspace-client';
export function WorkspaceSelector(){const {user}=useAuth();const [list,setList]=useState<{id:string;name:string}[]>([]),[value,setValue]=useState('personal');
 useEffect(()=>{selectWorkspace('personal');setValue('personal');setList([]);if(!user)return;const abort=new AbortController();void authHeader().then(headers=>fetch('/api/enterprise?creation=1',{headers,cache:'no-store',signal:abort.signal})).then(async r=>{if(!r.ok)return;const data=await r.json();if(abort.signal.aborted)return;const items=data.enterprises||[];setList(items);const requested=new URLSearchParams(window.location.search).get('workspace');if(requested&&items.some((x:{id:string})=>x.id===requested)){setValue(requested);selectWorkspace(requested);}}).catch(()=>{});return()=>{abort.abort();selectWorkspace('personal');};},[user?.email]);
 if(!user||!list.length)return null;
 return <label className="mx-2 flex items-center gap-1 text-xs text-c-text2"><span className="sr-only">创作工作空间</span><select aria-label="创作工作空间" title="仅影响新项目；企业管理员可查看本次企业输入与结果" className="max-w-[140px] rounded-md border border-c-border bg-card px-2 py-1.5 text-sm" value={value} onChange={e=>{setValue(e.target.value);selectWorkspace(e.target.value);}}><option value="personal">个人空间</option>{list.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>;
}
