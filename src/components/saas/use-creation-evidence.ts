'use client';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {authHeader} from '@/lib/supabase';
import type {CreationAssetSlice,CreationDetail,CreationEventSlice,EvidencePagination} from '@/lib/saas/creation-contracts';

type ErrorRead=Error&{status?:number};
async function read<T>(url:string,signal:AbortSignal):Promise<T>{
 const headers=await authHeader();
 signal.throwIfAborted();
 const response=await fetch(url,{headers,cache:'no-store',signal});
 const body=await response.json().catch(()=>null);
 if(!response.ok)throw Object.assign(new Error(body?.error||'读取失败，请重试'),{status:response.status});
 if(!body)throw new Error('读取失败，请重试');
 return body;
}
type Snapshot={key:string;eventSequence:number;assetSequence:number;detail:CreationDetail};
export type CreationEvidenceFeedback={loading:boolean;error:string;retry:()=>void};

function useEvidencePart<T>(url:string|null,scope:string,sequence:number,ended:RefObject<boolean>,deny:(scope:string,message:string)=>void){
 const [revision,retry]=useState(0),[loaded,setLoaded]=useState<{scope:string;key:string;data:T|null;error:string}|null>(null);
 const live=useRef<AbortController|null>(null),key=JSON.stringify([scope,sequence,revision]);
 useEffect(()=>{
  if(!url||ended.current)return;
  const request=new AbortController();live.current=request;
  void read<T>(url,request.signal).then(data=>{
   if(!request.signal.aborted)setLoaded({scope,key,data,error:''});
  }).catch((error:ErrorRead)=>{
   if(request.signal.aborted)return;
   if(error.status===401||error.status===403||error.status===404)deny(scope,error.message);
   else setLoaded({scope,key,data:null,error:error.message});
  }).finally(()=>{if(live.current===request)live.current=null;});
  return()=>{request.abort();if(live.current===request)live.current=null;};
 },[url,scope,key,ended,deny]);
 const current=loaded?.key===key?loaded:null;
 return {data:current?.data??null,latest:loaded?.scope===scope?loaded.data:null,
  feedback:{loading:!!url&&!current,error:current?.error??'',retry:()=>retry(n=>n+1)} satisfies CreationEvidenceFeedback,
  stop:()=>{live.current?.abort();setLoaded(null);}};
}

export function useCreationEvidence(api:string,selected:string,evidenceKey:string,eventPage:string,assetPage:string,tenantId?:string){
 const [revision,refresh]=useState(0);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
 const [ended,setEnded]=useState(false);
 const endedRef=useRef(false),detailRead=useRef<AbortController|null>(null);
 const path=selected?api+'/'+encodeURIComponent(selected):'';
 const detailKey=JSON.stringify([path,evidenceKey]);
 // Returning to a previously visited record or event page must revalidate
 // access rather than showing an older snapshot while that read is pending.
 const [previous,setNavigation]=useState({detailKey,eventPage,assetPage,detailSequence:0,eventSequence:0,assetSequence:0});
 const changedDetail=previous.detailKey!==detailKey,changedEvent=previous.eventPage!==eventPage,changedAsset=previous.assetPage!==assetPage;
 const navigation=changedDetail||changedEvent||changedAsset?{detailKey,eventPage,assetPage,
  detailSequence:previous.detailSequence+Number(changedDetail),eventSequence:previous.eventSequence+Number(changedEvent),
  assetSequence:previous.assetSequence+Number(changedAsset)}:previous;
 if(navigation!==previous)setNavigation(navigation);
 const currentNavigation=useRef(navigation);currentNavigation.current=navigation;
 const scope=JSON.stringify([detailKey,navigation.detailSequence,revision]);
 const active=snapshot?.key===scope?snapshot:null;
 const requiresEvents=!!active&&active.eventSequence!==navigation.eventSequence;
 const requiresAssets=!!active&&active.assetSequence!==navigation.assetSequence;
 const deny=useCallback((key:string,message:string)=>{
  setSnapshot(old=>old?.key===key?null:old);setFailure({key,message});
 },[]);

 useEffect(()=>{
  if(!path||endedRef.current)return;
  const request=new AbortController();detailRead.current=request;
  const start=currentNavigation.current,params=new URLSearchParams(evidenceKey);
  params.set('eventPage',start.eventPage);params.set('assetPage',start.assetPage);
  void read<CreationDetail>(path+'?'+params,request.signal).then(detail=>{
   if(!request.signal.aborted){setFailure(null);setSnapshot({key:scope,eventSequence:start.eventSequence,assetSequence:start.assetSequence,detail});}
  }).catch((error:ErrorRead)=>{
   if(!request.signal.aborted){setSnapshot(old=>old?.key===scope?null:old);setFailure({key:scope,message:error.message});}
  }).finally(()=>{if(detailRead.current===request)detailRead.current=null;});
  return()=>{request.abort();if(detailRead.current===request)detailRead.current=null;};
 },[path,evidenceKey,scope]);

 const eventParams=new URLSearchParams({eventPage,projection:'page'}),assetParams=new URLSearchParams({assetPage,projection:'assets'});
 if(tenantId){eventParams.set('tenantId',tenantId);assetParams.set('tenantId',tenantId);}
 const events=useEvidencePart<CreationEventSlice>(requiresEvents?path+'/events?'+eventParams:null,scope,navigation.eventSequence,endedRef,deny);
 const assets=useEvidencePart<CreationAssetSlice>(requiresAssets?path+'?'+assetParams:null,scope,navigation.assetSequence,endedRef,deny);

 const endSession=()=>{
  endedRef.current=true;detailRead.current?.abort();events.stop();assets.stop();
  setEnded(true);setSnapshot(null);setFailure(null);
 };
 const reload=()=>{if(!endedRef.current&&!detailRead.current)refresh(value=>value+1);};
 let visible=active?.detail??null;
 if(visible&&requiresEvents)visible={...visible,events:events.data?.items??[],
  eventPagination:events.data?.pagination??requestedPage(events.latest?.pagination??visible.eventPagination,eventPage)};
 if(visible&&requiresAssets)visible={...visible,assets:assets.data?.assets??[],
  assetPagination:assets.data?.assetPagination??requestedPage(assets.latest?.assetPagination??visible.assetPagination,assetPage)};
 return {detail:ended?null:visible,error:ended?'请重新登录':failure?.key===scope?failure.message:'',
  eventFeedback:events.feedback,assetFeedback:assets.feedback,endSession,reload};
}

function requestedPage(last:EvidencePagination,page:string){
 return {...last,page:Number(page)||1};
}
