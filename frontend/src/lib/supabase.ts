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

/** Default limit for auth, database and edge-function calls. */
export const SUPABASE_REQUEST_TIMEOUT_MS = 20_000;
/** File uploads/downloads may legitimately take long on slow mobile data. */
export const SUPABASE_STORAGE_TIMEOUT_MS = 120_000;

function timeoutForUrl(url: string): number {
  return url.includes('/storage/v1/') ? SUPABASE_STORAGE_TIMEOUT_MS : SUPABASE_REQUEST_TIMEOUT_MS;
}

/**
 * fetch with a deadline. On weak mobile data a request can stall without ever failing,
 * which left sign-in spinning on "Verifying account & role..." forever. Aborting turns a
 * stall into a normal network error, which the app already handles (offline fallback,
 * retry, or a readable message). A caller-supplied AbortSignal is still honoured.
 */
export function createTimeoutFetch(
  baseFetch: typeof fetch = (...args) => fetch(...args),
  getTimeoutMs: (url: string) => number = timeoutForUrl,
): typeof fetch {
  return (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException('Request timed out (slow or lost connection).', 'TimeoutError')),
      getTimeoutMs(url),
    );
    const callerSignal = init.signal;
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort(callerSignal.reason);
      else callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason), { once: true });
    }
    return baseFetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    return null;
  }

  if (!cachedClient) {
    cachedClient = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
      },
      global: {
        fetch: createTimeoutFetch(),
      },
    });
  }

  return cachedClient;
}
