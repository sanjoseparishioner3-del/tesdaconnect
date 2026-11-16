(() => {
    if (window.__tesdaOfflineAppLoaded) {
        window.TesdaOffline?.boot?.();
        return;
    }
    window.__tesdaOfflineAppLoaded = true;

    const DB_NAME = 'tesda-connect-offline-v1';
    const DB_VERSION = 1;
    const STORE_ACCOUNTS = 'accounts';
    const STORE_SNAPSHOTS = 'snapshots';
    const STORE_OUTBOX = 'outbox';
    const SESSION_KEY = 'tesda_connect_offline_session_v1';
    const PENDING_CRED_KEY = 'tesda_connect_pending_offline_cred_v1';
    const LAST_SYNC_KEY = 'tesda_connect_last_sync_at_v1';

    let dbPromise = null;
    let syncing = false;

    function getConfig() {
        const script = document.querySelector('script[data-tesda-offline-script]')
            || document.currentScript;
        const el = document.querySelector('[data-tesda-offline-config]') || script;
        return {
            userId: el?.dataset?.userId ? String(el.dataset.userId) : '',
            userEmail: el?.dataset?.userEmail ? String(el.dataset.userEmail).trim().toLowerCase() : '',
            snapshotUrl: el?.dataset?.snapshotUrl || '/offline-sync/snapshot',
            markReadUrl: el?.dataset?.markReadUrl || '/offline-sync/announcements/mark-read',
            verifyPasswordUrl: el?.dataset?.verifyPasswordUrl || '/offline-sync/verify-password',
            offlineUrl: el?.dataset?.offlineUrl || '/offline.html',
            loginUrl: el?.dataset?.loginUrl || '/login',
        };
    }

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) {
                reject(new Error('IndexedDB is unavailable in this browser.'));
                return;
            }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_ACCOUNTS)) {
                    db.createObjectStore(STORE_ACCOUNTS, { keyPath: 'email' });
                }
                if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
                    db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'userId' });
                }
                if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
                    const outbox = db.createObjectStore(STORE_OUTBOX, { keyPath: 'id', autoIncrement: true });
                    outbox.createIndex('byUserId', 'userId', { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error || new Error('Failed to open offline storage.'));
        });
        return dbPromise;
    }

    async function txStore(storeName, mode, action) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const req = action(store);
            let result;
            if (req && typeof req === 'object' && 'onsuccess' in req) {
                req.onsuccess = () => { result = req.result; };
                req.onerror = () => reject(req.error);
            }
            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    const bytesToBase64 = (bytes) => {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    };

    const base64ToBytes = (b64) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    };

    function randomSaltB64() {
        const bytes = new Uint8Array(16);
        if (window.crypto?.getRandomValues) {
            window.crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        return bytesToBase64(bytes);
    }

    // Pure-JS SHA-256 fallback only when crypto.subtle is unavailable (e.g., plain HTTP LAN demo).
    function sha256Fallback(bytes) {
        const K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
        ];
        const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const len = bytes.length;
        const bitLen = len * 8;
        const paddedLen = Math.ceil((len + 9) / 64) * 64;
        const buf = new Uint8Array(paddedLen);
        buf.set(bytes);
        buf[len] = 0x80;
        const view = new DataView(buf.buffer);
        view.setUint32(paddedLen - 4, bitLen >>> 0, false);
        view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
        const w = new Uint32Array(64);
        const rotr = (x, n) => (x >>> n) | (x << (32 - n));
        for (let offset = 0; offset < paddedLen; offset += 64) {
            for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
            for (let i = 16; i < 64; i++) {
                const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
                const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }
            let [a, b, c, d, e, f, g, h] = H;
            for (let i = 0; i < 64; i++) {
                const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
                const ch = (e & f) ^ (~e & g);
                const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
                const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (S0 + maj) >>> 0;
                h = g; g = f; f = e; e = (d + temp1) >>> 0;
                d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
            }
            H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
        }
        const out = new Uint8Array(32);
        const outView = new DataView(out.buffer);
        for (let i = 0; i < 8; i++) outView.setUint32(i * 4, H[i], false);
        return out;
    }

    async function deriveVerifier(password, saltB64, algoOverride = null, iterationsOverride = null) {
        const enc = new TextEncoder();
        const saltBytes = base64ToBytes(saltB64);
        const canSubtle = Boolean(window.crypto?.subtle) && (!algoOverride || algoOverride === 'webcrypto-pbkdf2');

        if (canSubtle) {
            const iterations = iterationsOverride || 100000;
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                enc.encode(password),
                'PBKDF2',
                false,
                ['deriveBits']
            );
            const bits = await window.crypto.subtle.deriveBits(
                { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
                keyMaterial,
                256
            );
            return {
                algo: 'webcrypto-pbkdf2',
                iterations,
                saltB64,
                hashB64: bytesToBase64(new Uint8Array(bits)),
            };
        }

        const iterations = iterationsOverride || 4000;
        const passBytes = enc.encode(password);
        let acc = new Uint8Array(saltBytes.length + passBytes.length);
        acc.set(saltBytes);
        acc.set(passBytes, saltBytes.length);
        acc = sha256Fallback(acc);
        for (let i = 1; i < iterations; i++) {
            const next = new Uint8Array(acc.length + saltBytes.length);
            next.set(acc);
            next.set(saltBytes, acc.length);
            acc = sha256Fallback(next);
        }
        return {
            algo: 'js-sha256-iter',
            iterations,
            saltB64,
            hashB64: bytesToBase64(acc),
        };
    }

    function constantTimeEqual(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return diff === 0;
    }

    function getActiveSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function setActiveSession(session) {
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } catch {
            // Storage may be restricted in private browsing.
        }
    }

    function clearActiveSession() {
        try {
            localStorage.removeItem(SESSION_KEY);
        } catch {
            // Ignore.
        }
    }

    async function getAccounts() {
        const list = await txStore(STORE_ACCOUNTS, 'readonly', (store) => store.getAll());
        return Array.isArray(list) ? list : [];
    }

    async function getAccount(email) {
        if (!email) return null;
        return await txStore(STORE_ACCOUNTS, 'readonly', (store) => store.get(String(email).trim().toLowerCase()));
    }

    async function saveAccount(account) {
        await txStore(STORE_ACCOUNTS, 'readwrite', (store) => store.put(account));
    }

    async function removeAccount(email) {
        const normalized = String(email || '').trim().toLowerCase();
        const existing = await getAccount(normalized);
        await txStore(STORE_ACCOUNTS, 'readwrite', (store) => store.delete(normalized));
        if (existing?.userId) {
            await txStore(STORE_SNAPSHOTS, 'readwrite', (store) => store.delete(String(existing.userId)));
        }
        const active = getActiveSession();
        if (active && String(active.email || '').toLowerCase() === normalized) {
            clearActiveSession();
        }
        dispatchOfflineUpdated();
    }

    async function getSnapshot(userId) {
        if (!userId) return null;
        return await txStore(STORE_SNAPSHOTS, 'readonly', (store) => store.get(String(userId)));
    }

    async function saveSnapshot(userId, email, data) {
        await txStore(STORE_SNAPSHOTS, 'readwrite', (store) => store.put({
            userId: String(userId),
            email: String(email || '').toLowerCase(),
            updatedAt: new Date().toISOString(),
            data,
        }));
        try {
            localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
        } catch {
            // Ignore.
        }
    }

    async function queueAnnouncementRead(userId, announcementId) {
        const uid = String(userId);
        const aid = Number(announcementId);
        if (!uid || !aid) return;

        const existingSnap = await getSnapshot(uid);
        if (existingSnap?.data?.announcements) {
            existingSnap.data.announcements = existingSnap.data.announcements.map((item) => (
                Number(item.id) === aid ? { ...item, is_read: true } : item
            ));
            await txStore(STORE_SNAPSHOTS, 'readwrite', (store) => store.put(existingSnap));
        }

        const outbox = await txStore(STORE_OUTBOX, 'readonly', (store) => store.getAll());
        const alreadyQueued = (outbox || []).some(
            (entry) => String(entry.userId) === uid && entry.type === 'announcement_read' && Number(entry.announcementId) === aid
        );
        if (!alreadyQueued) {
            await txStore(STORE_OUTBOX, 'readwrite', (store) => store.add({
                userId: uid,
                type: 'announcement_read',
                announcementId: aid,
                createdAt: new Date().toISOString(),
            }));
        }
        dispatchOfflineUpdated();
    }

    async function flushOutbox(cfg) {
        if (!navigator.onLine || !cfg.userId) return;
        const items = (await txStore(STORE_OUTBOX, 'readonly', (store) => store.getAll())) || [];
        const readItems = items.filter(
            (entry) => String(entry.userId) === String(cfg.userId) && entry.type === 'announcement_read'
        );
        if (!readItems.length) return;

        const ids = Array.from(new Set(readItems.map((entry) => Number(entry.announcementId)).filter(Boolean)));
        if (!ids.length) return;

        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
        const res = await fetch(cfg.markReadUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
            },
            body: JSON.stringify({ announcement_ids: ids.slice(0, 50) }),
        });

        if (!res.ok) return;
        const json = await res.json();
        const synced = new Set((json.synced_ids || []).map(Number));
        for (const entry of readItems) {
            if (synced.has(Number(entry.announcementId))) {
                await txStore(STORE_OUTBOX, 'readwrite', (store) => store.delete(entry.id));
            }
        }
    }

    async function syncNow(force = false) {
        const cfg = getConfig();
        if (!cfg.userId || !navigator.onLine || syncing) return null;

        if (!force) {
            try {
                const last = localStorage.getItem(LAST_SYNC_KEY);
                const snap = await getSnapshot(cfg.userId);
                if (snap && last && Date.now() - Date.parse(last) < 20000) {
                    return snap;
                }
            } catch {
                // Proceed to sync.
            }
        }

        syncing = true;
        updateConnectionIndicators();
        try {
            await flushOutbox(cfg);
            const res = await fetch(cfg.snapshotUrl, {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' },
            });
            if (res.status === 401) {
                clearActiveSession();
                return null;
            }
            if (res.status === 403) {
                if (cfg.userEmail) await removeAccount(cfg.userEmail);
                return null;
            }
            if (!res.ok) return null;

            const data = await res.json();
            const user = data?.meta?.user;
            if (!user?.id) return null;

            await saveSnapshot(user.id, user.email, data);
            const existingAccount = await getAccount(user.email);
            await saveAccount({
                ...(existingAccount || {}),
                email: String(user.email).toLowerCase(),
                userId: String(user.id),
                name: user.name,
                role: user.role,
                roleLabel: user.role_label,
                initials: user.initials,
                updatedAt: new Date().toISOString(),
            });

            setActiveSession({
                userId: String(user.id),
                email: String(user.email).toLowerCase(),
                loggedInAt: new Date().toISOString(),
                source: 'online',
            });

            dispatchOfflineUpdated();
            return await getSnapshot(user.id);
        } catch (err) {
            console.warn('TESDA offline snapshot sync skipped:', err);
            return null;
        } finally {
            syncing = false;
            updateConnectionIndicators();
        }
    }

    async function verifyOfflineLogin(email, password) {
        const normalized = String(email || '').trim().toLowerCase();
        if (!normalized || !password) {
            return { ok: false, message: 'Enter both your email address and password.' };
        }
        const account = await getAccount(normalized);
        if (!account || !account.hashB64 || !account.saltB64) {
            return {
                ok: false,
                message: 'This account does not have offline login saved on this device yet. Connect to the internet once and sign in to enable offline access.',
            };
        }
        const derived = await deriveVerifier(password, account.saltB64, account.algo, account.iterations);
        if (!constantTimeEqual(derived.hashB64, account.hashB64)) {
            return { ok: false, message: 'Incorrect password for offline sign-in on this device.' };
        }

        setActiveSession({
            userId: String(account.userId),
            email: account.email,
            loggedInAt: new Date().toISOString(),
            source: 'offline',
        });
        dispatchOfflineUpdated();
        return { ok: true, account };
    }

    async function enrollCurrentPassword(password) {
        const cfg = getConfig();
        if (!cfg.userId || !cfg.userEmail) {
            return { ok: false, message: 'You must be signed in online first.' };
        }
        if (!navigator.onLine) {
            return { ok: false, message: 'Connect to the internet to verify your password.' };
        }
        const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
        const res = await fetch(cfg.verifyPasswordUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
            },
            body: JSON.stringify({ password }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return { ok: false, message: err.message || 'Password verification failed.' };
        }
        const saltB64 = randomSaltB64();
        const verifier = await deriveVerifier(password, saltB64);
        const existing = await getAccount(cfg.userEmail);
        await saveAccount({
            ...(existing || {}),
            email: cfg.userEmail,
            userId: cfg.userId,
            ...verifier,
            updatedAt: new Date().toISOString(),
        });
        dispatchOfflineUpdated();
        return { ok: true, message: 'Offline login is now enabled on this device.' };
    }

    async function commitPendingCredential(cfg) {
        try {
            const raw = sessionStorage.getItem(PENDING_CRED_KEY);
            if (!raw) return;
            const pending = JSON.parse(raw);
            sessionStorage.removeItem(PENDING_CRED_KEY);
            if (!pending || !pending.email || !pending.hashB64 || !pending.saltB64) return;
            if (Date.now() - Number(pending.ts || 0) > 180000) return;
            if (String(pending.email).toLowerCase() !== cfg.userEmail) return;

            const existing = await getAccount(cfg.userEmail);
            await saveAccount({
                ...(existing || {}),
                email: cfg.userEmail,
                userId: cfg.userId,
                algo: pending.algo,
                iterations: pending.iterations,
                saltB64: pending.saltB64,
                hashB64: pending.hashB64,
                updatedAt: new Date().toISOString(),
            });
            dispatchOfflineUpdated();
        } catch {
            // Ignore storage errors.
        }
    }

    function dispatchOfflineUpdated() {
        window.dispatchEvent(new CustomEvent('tesda:offline-updated'));
        updateConnectionIndicators();
    }

    async function updateConnectionIndicators() {
        const cfg = getConfig();
        const online = navigator.onLine;
        const pill = document.querySelector('[data-tesda-connection-pill]');
        if (pill) {
            const dot = pill.querySelector('[data-tesda-connection-dot]');
            const text = pill.querySelector('[data-tesda-connection-text]');
            pill.classList.remove(
                'border-emerald-200', 'bg-emerald-50', 'text-emerald-700',
                'border-amber-300', 'bg-amber-50', 'text-amber-800'
            );
            if (online) {
                pill.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
                if (dot) dot.className = 'size-2 rounded-full bg-emerald-500';
                if (text) text.textContent = syncing ? 'Syncing…' : 'Online';
            } else {
                pill.classList.add('border-amber-300', 'bg-amber-50', 'text-amber-800');
                if (dot) dot.className = 'size-2 rounded-full bg-amber-500';
                if (text) text.textContent = 'Offline';
            }
        }

        const statusEl = document.querySelector('[data-tesda-offline-sidebar-status]');
        if (statusEl && cfg.userId) {
            try {
                const account = cfg.userEmail ? await getAccount(cfg.userEmail) : null;
                const snap = await getSnapshot(cfg.userId);
                const hasLogin = Boolean(account?.hashB64);
                const hasData = Boolean(snap?.data);
                if (hasLogin && hasData) {
                    const timeStr = snap.data?.meta?.generated_at_label || 'Ready';
                    statusEl.textContent = `Offline ready · ${timeStr}`;
                } else if (hasData) {
                    statusEl.textContent = 'Data cached · Set offline login';
                } else {
                    statusEl.textContent = syncing ? 'Syncing offline data…' : 'Tap to sync offline data';
                }
            } catch {
                statusEl.textContent = 'Offline storage unavailable';
            }
        }
    }

    function bindLoginPage() {
        const form = document.querySelector('[data-tesda-login-form]');
        if (!form || form.dataset.offlineBound === 'true') return;
        form.dataset.offlineBound = 'true';

        const cfg = getConfig();
        const emailInput = form.querySelector('input[name="email"]');
        const passwordInput = form.querySelector('input[name="password"]');
        const enrollCheckbox = form.querySelector('[data-offline-enroll]');
        const banner = document.querySelector('[data-offline-login-banner]');
        const savedWrap = document.querySelector('[data-offline-saved-accounts]');
        const errorEl = document.querySelector('[data-offline-login-error]');

        const showError = (msg) => {
            if (!errorEl) return;
            errorEl.textContent = msg;
            errorEl.classList.toggle('hidden', !msg);
        };

        const renderSavedAccounts = async () => {
            if (!savedWrap) return;
            try {
                const accounts = (await getAccounts()).filter((acc) => Boolean(acc.hashB64));
                if (banner) {
                    banner.classList.toggle('hidden', navigator.onLine && accounts.length === 0);
                    const bannerTitle = banner.querySelector('[data-offline-banner-title]');
                    const bannerDesc = banner.querySelector('[data-offline-banner-desc]');
                    if (bannerTitle && bannerDesc) {
                        if (!navigator.onLine) {
                            bannerTitle.textContent = 'Offline Mode Active';
                            bannerDesc.textContent = accounts.length
                                ? 'Select a saved account or enter your email and password to sign in offline.'
                                : 'You are offline and no account has been saved on this device yet. Connect once to sign in.';
                        } else {
                            bannerTitle.textContent = 'Offline Sign-In Enabled on This Device';
                            bannerDesc.textContent = `${accounts.length} saved account(s) ready for offline access on this device.`;
                        }
                    }
                }
                const listEl = savedWrap.querySelector('[data-offline-account-list]');
                if (!listEl) return;
                listEl.replaceChildren();
                savedWrap.classList.toggle('hidden', accounts.length === 0 || navigator.onLine);

                for (const acc of accounts) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'flex w-full items-center justify-between rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-left text-sm text-white transition hover:bg-white/20';
                    const left = document.createElement('span');
                    left.className = 'min-w-0';
                    const nameEl = document.createElement('span');
                    nameEl.className = 'block truncate font-bold';
                    nameEl.textContent = acc.name || acc.email;
                    const metaEl = document.createElement('span');
                    metaEl.className = 'block truncate text-xs text-teal-200';
                    metaEl.textContent = `${acc.roleLabel || 'User'} · ${acc.email}`;
                    left.append(nameEl, metaEl);
                    const pill = document.createElement('span');
                    pill.className = 'ml-2 shrink-0 rounded-full bg-teal-400/20 px-2.5 py-0.5 text-[11px] font-bold text-teal-200';
                    pill.textContent = 'Select';
                    btn.append(left, pill);
                    btn.addEventListener('click', () => {
                        if (emailInput) emailInput.value = acc.email;
                        if (passwordInput) passwordInput.focus();
                        showError('');
                    });
                    listEl.appendChild(btn);
                }
            } catch {
                // Ignore if IndexedDB disabled.
            }
        };

        renderSavedAccounts();
        window.addEventListener('online', renderSavedAccounts);
        window.addEventListener('offline', renderSavedAccounts);

        let submittingProgrammatically = false;
        form.addEventListener('submit', async (event) => {
            if (submittingProgrammatically) return;
            showError('');
            const email = String(emailInput?.value || '').trim().toLowerCase();
            const password = String(passwordInput?.value || '');

            if (!navigator.onLine) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const result = await verifyOfflineLogin(email, password);
                if (result.ok) {
                    window.location.href = cfg.offlineUrl;
                } else {
                    showError(result.message);
                }
                return;
            }

            if (enrollCheckbox?.checked && email && password) {
                event.preventDefault();
                try {
                    const saltB64 = randomSaltB64();
                    const verifier = await deriveVerifier(password, saltB64);
                    sessionStorage.setItem(PENDING_CRED_KEY, JSON.stringify({
                        email,
                        ...verifier,
                        ts: Date.now(),
                    }));
                } catch {
                    // Proceed with normal login even if local storage fails.
                }
                submittingProgrammatically = true;
                HTMLFormElement.prototype.submit.call(form);
            }
        });
    }

    function bindLogoutForms() {
        document.querySelectorAll('form[action$="/logout"]').forEach((form) => {
            if (form.dataset.offlineLogoutBound === 'true') return;
            form.dataset.offlineLogoutBound = 'true';
            form.addEventListener('submit', () => {
                clearActiveSession();
                try {
                    sessionStorage.removeItem(PENDING_CRED_KEY);
                } catch {
                    // Ignore.
                }
            });
        });
    }

    async function boot() {
        const cfg = getConfig();
        bindLoginPage();
        bindLogoutForms();
        updateConnectionIndicators();

        if (cfg.userId && cfg.userEmail) {
            await commitPendingCredential(cfg);
            if (navigator.onLine) {
                syncNow(false);
            }
        }
    }

    window.TesdaOffline = {
        boot,
        syncNow,
        verifyOfflineLogin,
        enrollCurrentPassword,
        getAccounts,
        getAccount,
        removeAccount,
        getSnapshot,
        getActiveSession,
        setActiveSession,
        clearActiveSession,
        queueAnnouncementRead,
        flushOutbox: () => flushOutbox(getConfig()),
        getConfig,
    };

    window.addEventListener('online', () => {
        updateConnectionIndicators();
        syncNow(true);
    });
    window.addEventListener('offline', updateConnectionIndicators);
    document.addEventListener('livewire:navigated', boot);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
