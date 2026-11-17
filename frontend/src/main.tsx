import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from '@/app/App';
import { markOfflineUnsupported, watchOfflineReadiness } from '@/lib/pwa/offlineReadiness';
import { initOptionalSentry } from '@/lib/sentry';
import './index.css';

initOptionalSentry();

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    registerSW({
      immediate: true,
      onOfflineReady() {
        // App shell cached safely for offline startup; PII stays strictly inside scoped Dexie stores.
        watchOfflineReadiness();
      },
      onRegisterError() {
        markOfflineUnsupported();
      },
    });
    watchOfflineReadiness();
  } else {
    markOfflineUnsupported();
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((reg) => reg.unregister())))
      .catch(() => undefined);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
