"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useFeatureAccess } from "@/lib/feature-access/client";
import { authHeader } from "@/lib/supabase";
import { currentWorkspace, WORKSPACE_SELECTION } from "@/lib/saas/workspace-client";
import { createWorkbenchSessionCatalog, type WorkbenchCatalogContext } from "@/lib/agent/workbench-session-catalog";
import type { WorkbenchAccountScope, WorkbenchSessionSummary } from "@/lib/agent/workbench-contract";

/** Read/mutate the existing catalog without mounting an Agent task runtime.
 * A keyed observer fences both account and workspace changes, including late JSON. */
export function useSessionCatalog() {
  const { user, ready } = useAuth();
  const { can } = useFeatureAccess();
  const allowed = can("agent");
  const [workspace, setWorkspace] = useState(currentWorkspace);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([user?.email || "", workspace, ready, allowed]);
  const [state, setState] = useState<{key:string;sessions:WorkbenchSessionSummary[];loading:boolean;error:string}>({key:"",sessions:[],loading:false,error:""});
  useEffect(() => { const sync=()=>setWorkspace(currentWorkspace());window.addEventListener(WORKSPACE_SELECTION,sync);return()=>window.removeEventListener(WORKSPACE_SELECTION,sync); }, []);
  const observer = useMemo(() => {
    const scope:WorkbenchAccountScope={account:user?.email||"",active:false};
    const catalog=createWorkbenchSessionCatalog({current:()=>scope,owns:(value):value is WorkbenchAccountScope=>value===scope&&scope.active});
    const context:WorkbenchCatalogContext={ready,headers:authHeader,request:(input,init)=>fetch(input,init),
      setSessions:change=>setState(previous=>scope.active&&previous.key===key?{...previous,sessions:typeof change==="function"?change(previous.sessions):change}:previous),
      setLoading:change=>setState(previous=>scope.active&&previous.key===key?{...previous,loading:typeof change==="function"?change(previous.loading):change}:previous),
      setError:error=>setState(previous=>scope.active&&previous.key===key?{...previous,error:error||""}:previous),
      sessionId:()=>"",setTitle:()=>{},deletedCurrent:()=>{},
    };
    return {scope,catalog,context};
  }, [key,ready,user?.email]);
  useEffect(() => {
    observer.scope.active=true;
    setState({key,sessions:[],loading:!!user&&ready&&allowed,error:""});
    if(user&&ready&&allowed)void observer.catalog.refresh(observer.context);
    return()=>{observer.scope.active=false;observer.catalog.cancel();};
  }, [observer,key,attempt,user,ready,allowed]);
  const visible=state.key===key?state:{sessions:[],loading:!!user&&ready&&allowed,error:""};
  return {...visible,key,workspace,allowed,retry:()=>setAttempt(n=>n+1),
    rename:(id:string,title:string)=>observer.catalog.rename(id,title,observer.context),
    remove:(id:string)=>observer.catalog.remove(id,observer.context),
    pin:(id:string,pinned:boolean)=>observer.catalog.pin(id,pinned,observer.context),
  };
}
