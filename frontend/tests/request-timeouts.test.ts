import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNetworkOrServerOutage } from '@/features/auth/authErrors';
import { createTimeoutFetch } from '@/lib/supabase';

/** A fetch that never answers until its signal aborts (a stalled mobile connection). */
function stalledFetch(): typeof fetch {
  return (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const reason: unknown = init.signal?.reason;
        // jsdom's DOMException is not an Error subclass; keep its message either way.
        const message =
          reason instanceof Error || reason instanceof DOMException ? reason.message : 'aborted';
        reject(reason instanceof Error ? reason : new Error(message));
      });
    });
}

describe('Supabase request timeouts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns a stalled request into an error after the deadline instead of hanging forever', async () => {
    vi.useFakeTimers();
    const timedFetch = createTimeoutFetch(stalledFetch(), () => 20_000);
    const pending = timedFetch('https://x.supabase.co/auth/v1/token?grant_type=password', { method: 'POST' });
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it('gives storage transfers a longer deadline than auth and database calls', async () => {
    const seen: number[] = [];
    const timedFetch = createTimeoutFetch(
      () => Promise.resolve(new Response('{}')),
      (url) => {
        const ms = url.includes('/storage/v1/') ? 120_000 : 20_000;
        seen.push(ms);
        return ms;
      },
    );
    await timedFetch('https://x.supabase.co/rest/v1/profiles');
    await timedFetch('https://x.supabase.co/storage/v1/object/learner-documents/a.pdf');
    expect(seen).toEqual([20_000, 120_000]);
  });

  it('still honours an abort requested by the caller', async () => {
    const controller = new AbortController();
    const timedFetch = createTimeoutFetch(stalledFetch(), () => 60_000);
    const pending = timedFetch('https://x.supabase.co/rest/v1/profiles', { signal: controller.signal });
    controller.abort(new Error('caller cancelled'));
    await expect(pending).rejects.toThrow('caller cancelled');
  });

  it('classifies timeouts and aborts as connection problems, not account rejections', () => {
    expect(isNetworkOrServerOutage({ message: 'TimeoutError: Request timed out (slow or lost connection).' })).toBe(true);
    expect(isNetworkOrServerOutage({ message: 'AbortError: signal is aborted without reason' })).toBe(true);
    expect(isNetworkOrServerOutage({ message: 'Invalid login credentials', status: 400 })).toBe(false);
  });
});
