'use client';
import {useEffect,useRef,useState} from 'react';
import {authHeader} from '@/lib/supabase';
import type {CreationDetail,CreationEventSlice,EvidencePagination} from '@/lib/saas/creation-contracts';

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
type Snapshot={key:string;eventSequence:number;detail:CreationDetail};
type EventResult={scope:string;key:string;data:CreationEventSlice|null;error:string};
export type CreationEventFeedback={loading:boolean;error:string;retry:()=>void};

export function useCreationEvidence(api:string,selected:string,evidenceKey:string,eventPage:string,tenantId?:string){
 const [revision,refresh]=useState(0),[eventRevision,refreshEvents]=useState(0);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[events,setEvents]=useState<EventResult|null>(null);
 const [failure,setFailure]=useState<{key:string;message:string}|null>(null);
 const [ended,setEnded]=useState(false);
 const endedRef=useRef(false),detailRead=useRef<AbortController|null>(null),eventRead=useRef<AbortController|null>(null);
 const path=selected?api+'/'+encodeURIComponent(selected):'';
 const detailKey=JSON.stringify([path,evidenceKey]);
 // Returning to a previously visited record or event page must revalidate
 // access rather than showing an older snapshot while that read is pending.
 const [previous,setNavigation]=useState({detailKey,eventPage,detailSequence:0,eventSequence:0});
 const changedDetail=previous.detailKey!==detailKey,changedEvent=previous.eventPage!==eventPage;
 const navigation=changedDetail||changedEvent?{detailKey,eventPage,
  detailSequence:previous.detailSequence+Number(changedDetail),eventSequence:previous.eventSequence+Number(changedEvent)}:previous;
 if(navigation!==previous)setNavigation(navigation);
 const currentNavigation=useRef(navigation);currentNavigation.current=navigation;
 const scope=JSON.stringify([detailKey,navigation.detailSequence,revision]);
 const active=snapshot?.key===scope?snapshot:null;
 const requiresEvents=!!active&&active.eventSequence!==navigation.eventSequence;
 const eventKey=JSON.stringify([scope,navigation.eventSequence,eventRevision]);

 useEffect(()=>{
  if(!path||endedRef.current)return;
  const request=new AbortController();detailRead.current=request;
  const start=currentNavigation.current,params=new URLSearchParams(evidenceKey);
  params.set('eventPage',start.eventPage);
  void read<CreationDetail>(path+'?'+params,request.signal).then(detail=>{
   if(!request.signal.aborted){setFailure(null);setSnapshot({key:scope,eventSequence:start.eventSequence,detail});}
  }).catch((error:ErrorRead)=>{
   if(!request.signal.aborted){setSnapshot(old=>old?.key===scope?null:old);setFailure({key:scope,message:error.message});}
  }).finally(()=>{if(detailRead.current===request)detailRead.current=null;});
  return()=>{request.abort();if(detailRead.current===request)detailRead.current=null;};
 },[path,evidenceKey,scope]);

 useEffect(()=>{
  if(!requiresEvents||endedRef.current)return;
  const request=new AbortController();eventRead.current=request;
  const params=new URLSearchParams({eventPage,projection:'page'});
  if(tenantId)params.set('tenantId',tenantId);
  void read<CreationEventSlice>(path+'/events?'+params,request.signal).then(data=>{
   if(!request.signal.aborted)setEvents({scope,key:eventKey,data,error:''});
  }).catch((error:ErrorRead)=>{
   if(request.signal.aborted)return;
   if(error.status===401||error.status===403||error.status===404){
    setSnapshot(old=>old?.key===scope?null:old);setEvents(null);setFailure({key:scope,message:error.message});
   }else setEvents({scope,key:eventKey,data:null,error:error.message});
  }).finally(()=>{if(eventRead.current===request)eventRead.current=null;});
  return()=>{request.abort();if(eventRead.current===request)eventRead.current=null;};
 },[requiresEvents,path,eventPage,tenantId,eventKey,scope]);

 const endSession=()=>{
  endedRef.current=true;detailRead.current?.abort();eventRead.current?.abort();
  setEnded(true);setSnapshot(null);setEvents(null);setFailure(null);
 };
 const reload=()=>{if(!endedRef.current&&!detailRead.current)refresh(value=>value+1);};
 const current=events?.key===eventKey?events:null;
 const visible=newestDetail(active,requiresEvents,current,events?.scope===scope?events.data?.pagination:undefined,eventPage);
 const feedback:CreationEventFeedback={loading:requiresEvents&&!current,error:current?.error??'',retry:()=>refreshEvents(value=>value+1)};
 return {detail:ended?null:visible,error:ended?'请重新登录':failure?.key===scope?failure.message:'',feedback,endSession,reload};
}

function newestDetail(active:Snapshot|null,requiresEvents:boolean,event:EventResult|null,latest:EvidencePagination|undefined,page:string){
 if(!active||!requiresEvents)return active?.detail??null;
 const source=active.detail.eventPagination;
 return {...active.detail,events:event?.data?.items??[],
  eventPagination:event?.data?.pagination??{...(latest??source),page:Number(page)||1}};
}
