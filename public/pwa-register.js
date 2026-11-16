(() => {
    const script = document.currentScript;
    const workerUrl = script?.dataset?.workerUrl || './service-worker.js';
    const workerScope = script?.dataset?.workerScope || './';
    const offlineUrl = script?.dataset?.offlineUrl || './offline.html';

    function showConnectivityNotice() {
        let notice = document.getElementById('tesda-connect-network-status');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'tesda-connect-network-status';
            notice.setAttribute('role', 'status');
            notice.setAttribute('aria-live', 'polite');
            notice.style.cssText = 'position:fixed;z-index:99999;left:50%;bottom:16px;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 24px);padding:11px 14px;border-radius:14px;font:600 13px/1.45 system-ui,sans-serif;box-shadow:0 10px 30px rgb(15 23 42 / 22%);display:none;text-align:center;';
            document.body.appendChild(notice);
        }

        if (!navigator.onLine) {
            notice.replaceChildren();
            const msg = document.createElement('span');
            msg.textContent = 'Offline mode: cached announcements, schedules, and offline sign-in are available. ';
            const link = document.createElement('a');
            link.href = offlineUrl;
            link.textContent = 'Open Offline View';
            link.style.cssText = 'display:inline-block;margin-left:6px;padding:4px 10px;border-radius:8px;background:#fff;color:#78350f;font-weight:800;text-decoration:none;';
            notice.append(msg, link);
            notice.style.background = '#78350f';
            notice.style.color = '#fff';
            notice.style.display = 'block';
        } else if (notice.style.display === 'block') {
            notice.textContent = 'Connection restored. Syncing offline updates with TESDA Connect…';
            notice.style.background = '#ecfdf5';
            notice.style.color = '#065f46';
            window.setTimeout(() => {
                if (navigator.onLine) notice.style.display = 'none';
            }, 3500);
        }
    }

    window.addEventListener('online', showConnectivityNotice);
    window.addEventListener('offline', showConnectivityNotice);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showConnectivityNotice, { once: true });
    } else {
        showConnectivityNotice();
    }

    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register(workerUrl, { scope: workerScope }).catch((error) => {
            // PWA installability must not break normal application use.
            console.warn('TESDA Connect service worker registration failed.', error);
        });
    }
})();
