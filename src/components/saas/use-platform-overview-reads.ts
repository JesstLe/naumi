'use client';
import {useEffect,useState} from 'react';

type Read=(url:string,init:RequestInit)=>Promise<unknown>;
type Settled<T>={key:string;data:T|null;error:string};

function useScopedRead<T>(url:string|null,read:Read){
 const [revision,setRevision]=useState(0),[last,setLast]=useState<Settled<T>|null>(null);
 const [denied,setDenied]=useState('');
 const key=url===null?null:JSON.stringify([url,revision]);
 useEffect(()=>{
  if(!url||!key)return;
  const controller=new AbortController();
  void read(url,{signal:controller.signal})
   .then(data=>{if(!controller.signal.aborted){setDenied('');setLast({key,data:data as T,error:''});}})
   .catch((error:Error&{status?:number})=>{if(!controller.signal.aborted){
    if(error.status===401||error.status===403)setDenied(error.message);
    setLast({key,data:null,error:error.message});
   }});
  return()=>controller.abort();
 },[url,key,read]);
 const current=key!==null&&last?.key===key?last:null;
 return {data:current?.data??null,error:current?.error??'',denied:url?denied:'',
  loading:key!==null&&!current,retry:()=>setRevision(n=>n+1)};
}

export function usePlatformOverviewReads<Metrics,Tenants>(view:'overview'|'tenants'|'tenant'|'creations',search:Pick<URLSearchParams,'get'>,read:Read){
 const dates=new URLSearchParams({projection:'metrics'}),filters=new URLSearchParams();
 for(const key of ['from','to']){
  const v=search.get(key);if(v){dates.set(key,v);filters.set(key,v);}
 }
 for(const key of ['q','status','page','sort']){
  const v=search.get(key);if(v)filters.set(key,v);
 }
 if(view==='overview')filters.set('size','10');
 const tenants=useScopedRead<Tenants>(view==='overview'||view==='tenants'?'/api/admin/tenants?'+filters:null,read);
 const metrics=useScopedRead<Metrics>(view==='overview'?'/api/admin/saas-overview?'+dates:null,read);
 const retryBoth=()=>{metrics.retry();tenants.retry();};
 return {metrics,tenants,denied:metrics.denied||tenants.denied,retryBoth};
}
