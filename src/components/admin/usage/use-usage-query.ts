"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {UsageData,UsersData} from "./contracts";

type Directory=Pick<UsersData,"users">;
type Snapshot<T>={key:string;data:T};

/** Range/page/identity own both reads. Rendering is key-bound too, so an old
 * page is never presented as the requested page, including after failures. */
export function useUsageQuery(token:string|null,days:number){
  const [selection,setSelection]=useState({token,days,page:1}),[revision,setRevision]=useState(0);
  const page=selection.token===token&&selection.days===days?selection.page:1;
  // Refresh may keep the same page visible on a transient failure. It is not
  // part of the result identity; another account/range/page must never reuse it.
  const key=JSON.stringify([token,days,page]);
  const activeKey=useRef(key),directoryRevision=useRef(0);activeKey.current=key;
  const [usage,setUsage]=useState<Snapshot<UsageData>|null>(null),[directory,setDirectory]=useState<Snapshot<Directory>|null>(null);
  const [request,setRequest]=useState<{key:string;loading:boolean;error:string|null}|null>(null);
  useEffect(()=>{setSelection({token,days,page:1});},[token,days]);
  useEffect(()=>{
    if(!token)return;
    const abort=new AbortController(),headers={Authorization:`Bearer ${token}`};
    setRequest({key,loading:true,error:null});
    void(async()=>{
      let phase="读取用量失败";
      try{
        const response=await fetch(`/api/admin/usage?days=${days}&page=${page}&size=30`,{headers,signal:abort.signal});
        if(!response.ok){
          if(!abort.signal.aborted&&[401,403,404].includes(response.status)){setUsage(null);setDirectory(null);}
          throw Error(phase);
        }
        const data=await response.json() as UsageData;
        if(abort.signal.aborted)return;
        setUsage({key,data});setRequest({key,loading:false,error:null});
        const params=new URLSearchParams({view:"members"});for(const user of data.users)params.append("member",user.email);
        phase="读取用户资料失败，请刷新重试";
        const readRevision=directoryRevision.current;
        const members=data.users.length?await fetch(`/api/admin/users?${params}`,{headers,signal:abort.signal}):null;
        if(members&&!members.ok){
          if(!abort.signal.aborted&&[401,403,404].includes(members.status)){setUsage(null);setDirectory(null);}
          throw Error(phase);
        }
        const users=members?await members.json() as Directory:{users:[]};
        if(!abort.signal.aborted&&readRevision===directoryRevision.current)setDirectory({key,data:users});
      }catch(error){if(!abort.signal.aborted)setRequest({key,loading:false,error:error instanceof Error?error.message:phase});}
    })();
    return()=>abort.abort();
  },[token,days,page,key,revision]);
  const setUsersData=useCallback((data:Directory)=>{
    if(activeKey.current!==key)return;
    directoryRevision.current++;setDirectory({key,data});
  },[key]);
  return {
    usageData:token&&usage?.key===key?usage.data:null,usersData:token&&directory?.key===key?directory.data:null,setUsersData,
    usageLoading:!!token&&(request?.key!==key||request.loading),usageError:request?.key===key?request.error:null,
    page,setPage:(next:number)=>setSelection({token,days,page:next}),refresh:()=>setRevision(value=>value+1),
  };
}
