"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth-context";
import { authHeader } from "@/lib/supabase";
import { CollaborationClient } from "./collaboration-client";
import { CollaborationWindow } from "./collaboration-window";
import "./collaboration.css";

type Context = { client: CollaborationClient };
const CollaborationContext = createContext<Context | null>(null);

/** Mounted once below Auth/Toast and outside route-keyed content. */
export function CollaborationProvider({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const [client] = useState(() => new CollaborationClient(authHeader));
  const email = user?.email.toLowerCase() || null;
  useLayoutEffect(() => {
    // ready false->true is hydration, not an identity boundary. Preserve accepted
    // operations until an actual changed identity or confirmed sign-out.
    if (ready || (client.state.account && email && client.state.account !== email)) client.setAccount(email);
  }, [client, ready, email]);
  useEffect(() => {
    client.resume();
    const signOut = () => client.setAccount(null);
    window.addEventListener("naumi:cache-session-ended", signOut);
    return () => { window.removeEventListener("naumi:cache-session-ended", signOut); client.dispose(); };
  }, [client]);
  const value = useMemo(() => ({ client }), [client]);
  return <CollaborationContext.Provider value={value}>{children}<CollaborationWindow /></CollaborationContext.Provider>;
}

export function useCollaborationState() {
  const context = useContext(CollaborationContext);
  if (!context) throw new Error("CollaborationProvider is missing");
  return { client: context.client, state: useSyncExternalStore(context.client.subscribe, context.client.snapshot, context.client.snapshot) };
}

export function useCollaboration() {
  const context = useContext(CollaborationContext);
  if (!context) throw new Error("CollaborationProvider is missing");
  // Draft typing/upload progress must not re-render the entire CanvasClient.
  return useSyncExternalStore(context.client.subscribe, context.client.entrySnapshot, context.client.entrySnapshot);
}
