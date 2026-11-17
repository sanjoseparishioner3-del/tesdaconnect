import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

export const SUPABASE_AUTH_STORAGE_KEY = 'tctesda-auth-session';

/**
 * Reads the user id of the Supabase session persisted on this device without any
 * network call. When the app starts offline with an expired access token, supabase-js
 * cannot refresh it and reports no session, yet the user never signed out; this id lets
 * the app reopen that user's offline workspace (still bounded by the offline vault TTL).
 */
export function readPersistedSessionUserId(): string | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: { id?: unknown } } | null;
    return typeof parsed?.user?.id === 'string' ? parsed.user.id : null;
  } catch {
    return null;
  }
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
      },
    });
  }

  return cachedClient;
}
