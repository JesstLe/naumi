import {currentWorkspace} from "@/lib/saas/workspace-client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { currentImageQuality } from "@/lib/image-quality-preference";
import { currentModelCatalogVersion } from "@/lib/model-config/public-client";

// Browser Supabase client (anon key) — used client-side for auth only.
// NEXT_PUBLIC_* are inlined at build time, so this is safe in client code.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/**
 * Returns an `{ Authorization: "Bearer <token>" }` header for the current
 * session (or `{}` if not logged in / auth disabled). Attach to credit-spending
 * API calls (generate / suite) so the server can bind the request to a real
 * session instead of trusting a client-supplied email. Safe with FormData
 * bodies — it only adds Authorization, never Content-Type.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    headers["x-naumi-workspace"]=currentWorkspace();
    let textModel: string | undefined;
    try { textModel = window.localStorage.getItem("naumi:text-model")?.trim(); } catch { /* blocked storage: server default model */ }
    if (textModel) headers["x-naumi-text-model"] = textModel;
    const quality = currentImageQuality();
    if (quality) headers["x-naumi-image-quality"] = quality;
    const version = currentModelCatalogVersion();
    if (version) headers["x-naumi-model-version"] = String(version);
  }
  if (!url || !anon) return headers;
  try {
    const { data } = await browserSupabase().auth.getSession();
    const tok = data.session?.access_token;
    if (tok) headers.Authorization = `Bearer ${tok}`;
    return headers;
  } catch {
    return headers;
  }
}
