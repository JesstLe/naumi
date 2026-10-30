"use client";
import {useEffect,useRef} from "react";
import type {CanvasDocumentScope} from "@/lib/canvas/document-scope";
import {createCanvasVideoTaskFollower,type CanvasVideoFollowPorts} from "@/lib/canvas/video-task-follow";

/** React binds the existing document epoch and timer lifetime. Durable tasks,
 * presentation records and artwork persistence keep their original owners. */
export function useCanvasVideoTaskFollow(scope:CanvasDocumentScope,enabled:boolean,ports:CanvasVideoFollowPorts){
  const owner=useRef<ReturnType<typeof createCanvasVideoTaskFollower>|null>(null);if(!owner.current)owner.current=createCanvasVideoTaskFollower();
  const latest=useRef(ports);latest.current=ports;
  useEffect(()=>{if(enabled)return owner.current!.follow(scope,latest.current);},[scope,enabled]);
}
