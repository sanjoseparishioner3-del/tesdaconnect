import { create } from 'zustand';

/**
 * Whether this device can open the app with no internet:
 * - 'checking'     service worker support known, readiness not yet confirmed
 * - 'preparing'    the service worker is still downloading the app shell
 * - 'ready'        the app shell is cached; the app opens offline
 * - 'unsupported'  no service worker (old browser, private mode, or dev build)
 */
export type OfflineReadiness = 'checking' | 'preparing' | 'ready' | 'unsupported';

interface OfflineReadinessState {
  readiness: OfflineReadiness;
  storagePersisted: boolean | null;
  setReadiness: (readiness: OfflineReadiness) => void;
  setStoragePersisted: (persisted: boolean | null) => void;
}

export const useOfflineReadinessStore = create<OfflineReadinessState>((set) => ({
  readiness: 'checking',
  storagePersisted: null,
  setReadiness: (readiness) => set({ readiness }),
  setStoragePersisted: (storagePersisted) => set({ storagePersisted }),
}));

/**
 * Tracks the service worker lifecycle. A worker only becomes `active` after its install
 * step has finished precaching the whole app shell, so an active registration means the
 * app will open offline.
 */
export function watchOfflineReadiness(): void {
  const { setReadiness } = useOfflineReadinessStore.getState();
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    setReadiness('unsupported');
    return;
  }

  void navigator.serviceWorker
    .getRegistration()
    .then((registration) => {
      if (registration?.active) {
        setReadiness('ready');
        return;
      }
      setReadiness(registration ? 'preparing' : 'checking');
    })
    .catch(() => setReadiness('unsupported'));

  void navigator.serviceWorker.ready.then(() => setReadiness('ready')).catch(() => undefined);
}

/** Called from registerSW's onRegisterError when the worker cannot be installed. */
export function markOfflineUnsupported(): void {
  useOfflineReadinessStore.getState().setReadiness('unsupported');
}

/**
 * Asks the browser not to evict this app's offline data (cached app, IndexedDB records,
 * queued uploads) when the device runs low on storage. Chrome grants it silently for
 * installed / frequently used apps; Safari and Firefox may decline, which is harmless.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const { setStoragePersisted } = useOfflineReadinessStore.getState();
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
      setStoragePersisted(null);
      return null;
    }
    const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const persisted = already || (await navigator.storage.persist());
    setStoragePersisted(persisted);
    return persisted;
  } catch {
    setStoragePersisted(null);
    return null;
  }
}
