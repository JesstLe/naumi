'use client';
import { useState } from 'react';
export type SiteCreation={id:string;title:string;actorName:string;status:string;createdAt:string;assetId:string|null;thumbnail:string|null};
export type SiteCreationCommand={id:string;operation:{type:string;creationId?:string;search?:string};state:string;created_at:string;result?:{data?:{creations?:SiteCreation[];total?:number;page?:number;mediaUrl?:string}}};
const button='rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:opacity-50 hover:bg-slate-50';
const labels:Record<string,string>={queued:'排队中',running:'生成中',succeeded:'已完成',partial:'部分完成',failed:'失败',cancelled:'已取消',cancel_requested:'取消中',needs_review:'待核实'};
export function SiteCreations({commands,busy,queue}:{commands:SiteCreationCommand[];busy:boolean;queue:(operation:unknown)=>void}){
  const [search,setSearch]=useState(''),[failed,setFailed]=useState<Record<string,boolean>>({});
  const command=commands.find(c=>c.operation.type==='creations.list'&&c.state==='succeeded');
  const result=command?.result?.data;
  function load(page=1){setFailed({});queue({type:'creations.list',search,page});}
  return <section className='mb-6 rounded-xl border border-slate-200 p-4'>
    <h3 className='mb-3 text-sm font-semibold'>企业作品</h3>
    <div className='mb-4 flex gap-2'><input className='min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm' placeholder='搜索创作内容' aria-label='搜索企业作品' value={search} onChange={e=>setSearch(e.target.value)} maxLength={100}/><button className={button} disabled={busy} onClick={()=>load()}>读取作品</button></div>
    {result?.creations&&<><div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>{result.creations.map(item=>{
      const original=commands.find(c=>c.operation.type==='creations.media'&&c.operation.creationId===item.id&&c.state==='succeeded'&&Date.now()-Date.parse(c.created_at)<90000)?.result?.data?.mediaUrl;
      return <article key={item.id} className='overflow-hidden rounded-xl border border-slate-100'>
        <div className='flex aspect-square items-center justify-center bg-slate-50 text-xs text-slate-400'>{item.thumbnail&&!failed[item.thumbnail]?<img className='h-full w-full object-contain' alt={item.title} src={item.thumbnail} referrerPolicy='no-referrer' loading='lazy' onError={()=>setFailed(prev=>({...prev,[item.thumbnail!]:true}))}/>:<span>{item.thumbnail?'预览已过期，请重新读取':'暂无图片'}</span>}</div>
        <div className='space-y-2 p-3 text-sm'><p className='line-clamp-2'>{item.title}</p><p className='text-xs text-slate-500'>{item.actorName} · {labels[item.status]||'处理中'}</p><p className='text-xs text-slate-400'>{new Date(item.createdAt).toLocaleString()}</p>
        {item.assetId&&(original?<a className='text-indigo-600' href={original} target='_blank' rel='noopener noreferrer' referrerPolicy='no-referrer'>查看原图</a>:<button className='text-indigo-600 disabled:opacity-50' disabled={busy} onClick={()=>queue({type:'creations.media',creationId:item.id,assetId:item.assetId})}>获取原图</button>)}</div>
      </article>;
    })}</div>{result.creations.length===0&&<p className='py-5 text-center text-sm text-slate-500'>暂无企业作品</p>}
    <div className='mt-4 flex items-center justify-between gap-2 text-sm'><span>共 {result.total} 条 · 第 {result.page} 页</span><div className='flex gap-2'><button className={button} disabled={busy||(result.page||1)<=1} onClick={()=>load((result.page||1)-1)}>上一页</button><button className={button} disabled={busy||(result.page||1)*12>=(result.total||0)} onClick={()=>load((result.page||1)+1)}>下一页</button></div></div></>}
  </section>;
}
