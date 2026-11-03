"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { authHeader } from "@/lib/supabase";
import { CollaborationClient } from "./collaboration-client";
import { CollaborationWindow } from "./collaboration-window";
import { CollaborationContext } from "./collaboration-context";
import "./collaboration.css";
export {useCollaboration,useCollaborationState} from "./collaboration-context";

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
