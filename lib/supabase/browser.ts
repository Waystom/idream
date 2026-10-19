import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

let browserClient: SupabaseClient | null = null;

export function hasSupabaseBrowserEnv() {
  return Boolean(getSupabaseConfig());
}

export function getSupabaseBrowserClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!browserClient) {
    browserClient = createBrowserClient(config.url, config.key, {
      // /auth/confirm owns token exchange; automatic detection would consume the code twice.
      auth: { detectSessionInUrl: false }
    });
  }

  return browserClient;
}
