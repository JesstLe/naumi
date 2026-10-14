"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useAuth} from "@/lib/auth-context";
import {authHeader} from "@/lib/supabase";
import type {VideoByocCatalog} from "@/lib/video/byoc-settings";
export function useVideoByocCatalog(accountEmail?:string){
  const {user}=useAuth(),email=accountEmail||user?.email,[catalog,setCatalog]=useState<VideoByocCatalog|null>(null),[error,setError]=useState(""),identity=useRef({email,user:user?.email,revision:0}),attempt=useRef(0);
  if(identity.current.email!==email||identity.current.user!==user?.email)identity.current={email,user:user?.email,revision:identity.current.revision+1};const revision=identity.current.revision;
  const refresh=useCallback(async()=>{if(!user?.email||!email)return;const current=++attempt.current;try{const headers=await authHeader();if(identity.current.revision!==revision)return;const response=await fetch(`/api/video/byoc/catalog?email=${encodeURIComponent(email)}`,{headers,cache:"no-store"}),data=await response.json();if(!response.ok)throw new Error(data.error||"自备工作流加载失败");if(identity.current.revision===revision&&attempt.current===current){setCatalog(data);setError("");}}catch(cause){if(identity.current.revision===revision&&attempt.current===current)setError(cause instanceof Error?cause.message:"自备工作流加载失败");}},[user?.email,email,revision]);
  useEffect(()=>{setCatalog(null);setError("");void refresh();return()=>{attempt.current++;};},[refresh]);
  return {catalog,error,refresh};
}
