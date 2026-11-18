'use client';
import {useCallback,useEffect,useRef,useState,type RefObject} from 'react';
import {authHeader} from '@/lib/supabase';
import type {CreationAssetSlice,CreationChildSlice,CreationDetail,CreationEventSlice,EvidencePagination} from '@/lib/saas/creation-contracts';

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
type Snapshot={key:string;eventSequence:number;assetSequence:number;childSequence:number;detail:CreationDetail};
export type VisibleCreationDetail=Omit<CreationDetail,'children'> & Pick<CreationChildSlice,'children'>;
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

export function useCreationEvidence(api:string,selected:string,eventPage:string,assetPage:string,childPage:string,tenantId?:string){
 const [revision,refresh]=useState(0);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
 const [ended,setEnded]=useState(false);
 const endedRef=useRef(false),detailRead=useRef<AbortController|null>(null);
 const path=selected?api+'/'+encodeURIComponent(selected):'';
 const detailKey=JSON.stringify([path,tenantId]);
 // Returning to a previously visited record or page must revalidate
 // access rather than showing an older snapshot while that read is pending.
 const [previous,setNavigation]=useState({detailKey,eventPage,assetPage,childPage,detailSequence:0,eventSequence:0,assetSequence:0,childSequence:0});
 const changedDetail=previous.detailKey!==detailKey,changedEvent=previous.eventPage!==eventPage,changedAsset=previous.assetPage!==assetPage,changedChild=previous.childPage!==childPage;
 const navigation=changedDetail||changedEvent||changedAsset||changedChild?{detailKey,eventPage,assetPage,childPage,
  detailSequence:previous.detailSequence+Number(changedDetail),eventSequence:previous.eventSequence+Number(changedEvent),
  assetSequence:previous.assetSequence+Number(changedAsset),childSequence:previous.childSequence+Number(changedChild)}:previous;
 if(navigation!==previous)setNavigation(navigation);
 const currentNavigation=useRef(navigation);currentNavigation.current=navigation;
 const scope=JSON.stringify([detailKey,navigation.detailSequence,revision]);
 const active=snapshot?.key===scope?snapshot:null;
 const requiresEvents=!!active&&active.eventSequence!==navigation.eventSequence;
 const requiresAssets=!!active&&active.assetSequence!==navigation.assetSequence;
 const requiresChildren=!!active&&active.childSequence!==navigation.childSequence;
 const deny=useCallback((key:string,message:string)=>{
  setSnapshot(old=>old?.key===key?null:old);setFailure({key,message});
 },[]);

 useEffect(()=>{
  if(!path||endedRef.current)return;
  const request=new AbortController();detailRead.current=request;
  const start=currentNavigation.current,params=new URLSearchParams({eventPage:start.eventPage,assetPage:start.assetPage,childPage:start.childPage});
  if(tenantId)params.set('tenantId',tenantId);
  void read<CreationDetail>(path+'?'+params,request.signal).then(detail=>{
   if(!request.signal.aborted){setFailure(null);setSnapshot({key:scope,eventSequence:start.eventSequence,assetSequence:start.assetSequence,childSequence:start.childSequence,detail});}
  }).catch((error:ErrorRead)=>{
   if(!request.signal.aborted){setSnapshot(old=>old?.key===scope?null:old);setFailure({key:scope,message:error.message});}
  }).finally(()=>{if(detailRead.current===request)detailRead.current=null;});
  return()=>{request.abort();if(detailRead.current===request)detailRead.current=null;};
 },[path,tenantId,scope]);

 const eventParams=new URLSearchParams({eventPage,projection:'page'}),assetParams=new URLSearchParams({assetPage,projection:'assets'}),childParams=new URLSearchParams({childPage,projection:'children'});
 if(tenantId)for(const params of [eventParams,assetParams,childParams])params.set('tenantId',tenantId);
 const events=useEvidencePart<CreationEventSlice>(requiresEvents?path+'/events?'+eventParams:null,scope,navigation.eventSequence,endedRef,deny);
 const assets=useEvidencePart<CreationAssetSlice>(requiresAssets?path+'?'+assetParams:null,scope,navigation.assetSequence,endedRef,deny);
 const children=useEvidencePart<CreationChildSlice>(requiresChildren?path+'?'+childParams:null,scope,navigation.childSequence,endedRef,deny);

 const endSession=()=>{
  endedRef.current=true;detailRead.current?.abort();events.stop();assets.stop();children.stop();
  setEnded(true);setSnapshot(null);setFailure(null);
 };
 const reload=()=>{if(!endedRef.current&&!detailRead.current)refresh(value=>value+1);};
 let visible:VisibleCreationDetail|null=active?.detail??null;
 if(visible&&requiresEvents)visible={...visible,events:events.data?.items??[],
  eventPagination:events.data?.pagination??requestedPage(events.latest?.pagination??visible.eventPagination,eventPage)};
 if(visible&&requiresAssets)visible={...visible,assets:assets.data?.assets??[],
  assetPagination:assets.data?.assetPagination??requestedPage(assets.latest?.assetPagination??visible.assetPagination,assetPage)};
 if(visible&&requiresChildren)visible={...visible,children:children.data?.children??[],
  childPagination:children.data?.childPagination??requestedPage(children.latest?.childPagination??visible.childPagination,childPage)};
 return {detail:ended?null:visible,error:ended?'请重新登录':failure?.key===scope?failure.message:'',
  eventFeedback:events.feedback,assetFeedback:assets.feedback,childFeedback:children.feedback,endSession,reload};
}

function requestedPage(last:EvidencePagination,page:string){
 return {...last,page:Number(page)||1};
}
