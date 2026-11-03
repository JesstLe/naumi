"use client";

import {createContext,useContext,useSyncExternalStore} from "react";
import type {CollaborationClient} from "./collaboration-client";

/** Consumers depend on this small port, not the provider/window composition.
 * The mounted provider still owns the single client and its account lifetime. */
export const CollaborationContext=createContext<{client:CollaborationClient}|null>(null);

export function useCollaborationState(){
  const context=useContext(CollaborationContext);
  if(!context)throw new Error("CollaborationProvider is missing");
  return {client:context.client,state:useSyncExternalStore(context.client.subscribe,context.client.snapshot,context.client.snapshot)};
}

export function useCollaboration(){
  const context=useContext(CollaborationContext);
  if(!context)throw new Error("CollaborationProvider is missing");
  // Draft/upload changes never subscribe the entire Canvas to the window state.
  return useSyncExternalStore(context.client.subscribe,context.client.entrySnapshot,context.client.entrySnapshot);
}
