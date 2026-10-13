"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionUser } from '@/lib/auth-context';
import { authHeader } from '@/lib/supabase';
import { parseEntryDiscovery, type TeamEntryDiscovery } from '@/lib/teams/entry-contract';

export function useManagementEntry(user: SessionUser | null) {
  const email = user?.email || '';
  const [snapshot, setSnapshot] = useState<{ email: string; data: TeamEntryDiscovery | null; error: boolean } | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    setSnapshot(null);
    if (!email) return;
    const controller = new AbortController();
    let revision = 0;
    const check = async () => {
      const serial = ++revision;
      try {
        const response = await fetch('/api/team/access', { cache: 'no-store', headers: await authHeader(), signal: controller.signal });
        if (!response.ok) throw new Error('Entry unavailable');
        const data = parseEntryDiscovery(await response.json());
        if (!controller.signal.aborted && serial === revision) setSnapshot({ email, data, error: false });
      } catch {
        if (!controller.signal.aborted && serial === revision) setSnapshot({ email, data: null, error: true });
      }
    };
    const refresh = () => { void check(); };
    refreshRef.current = refresh;
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('naumi:feature-access-changed', refresh);
    return () => {
      controller.abort(); refreshRef.current = () => {};
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('naumi:feature-access-changed', refresh);
    };
  }, [email]);
  const current = snapshot?.email === email ? snapshot : null;
  const refresh = useCallback(() => refreshRef.current(), []);
  return { data: current?.data ?? null, state: current?.error ? 'error' as const : current?.data ? 'ready' as const : 'loading' as const, refresh };
}
