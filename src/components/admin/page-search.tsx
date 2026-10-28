"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Search,X} from 'lucide-react';
import {adminSearchLinks} from './navigation';
import styles from './center-shell.module.css';
export function AdminPageSearch({deploymentsOnly,fleetEnabled}:{deploymentsOnly:boolean;fleetEnabled:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null);const [query,setQuery]=useState('');
 const show=()=>{setQuery('');if(!dialog.current?.open){dialog.current?.showModal();input.current?.focus();}};
 const close=()=>{dialog.current?.close();trigger.current?.focus();};
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')){event.preventDefault();show();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const links=adminSearchLinks(deploymentsOnly,fleetEnabled).filter(link=>`${link.label} ${link.group} ${link.href}`.toLowerCase().includes(query.trim().toLowerCase()));
 return <><button ref={trigger} type="button" className={styles.searchTrigger} aria-haspopup="dialog" aria-label="搜索后台页面" onClick={show}><Search size={16}/><span>搜索页面</span><kbd>⌘ / Ctrl K</kbd></button>
 <dialog ref={dialog} className={styles.searchDialog} aria-label="搜索后台页面" onClick={e=>{if(e.target===e.currentTarget)close();}} onClose={()=>trigger.current?.focus()}>
 <div className={styles.searchInput}><Search size={18}/><input ref={input} aria-label="页面名称" placeholder="搜索页面名称" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();dialog.current?.querySelector<HTMLAnchorElement>('a')?.click();}}}/><button type="button" aria-label="关闭页面搜索" onClick={close}><X size={18}/></button></div>
 <nav className={styles.searchResults} aria-label="页面搜索结果">{links.map(link=><Link key={link.href} href={link.href} prefetch={false} onClick={close}><span>{link.label}{link.label!==link.group&&<small>{link.group}</small>}</span><ArrowUpRight size={16}/></Link>)}{!links.length&&<p role="status">没有匹配的页面</p>}</nav></dialog></>;
}
