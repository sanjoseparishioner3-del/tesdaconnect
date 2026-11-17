import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isNetworkOrServerOutage } from '@/features/auth/authErrors';
import { offlineDb, pruneExpiredOfflineData } from '@/lib/db/dexie';
import { saveOfflineUnlockCredential, verifyOfflineUnlockCredential } from '@/lib/offline/offlineAuth';
import { buildLearnerDocumentStoragePath } from '@/lib/sync/supabaseTransport';
import { useAuthStore } from '@/stores/authStore';
import type { UserProfile } from '@/types/auth';

const mockUpload = vi.fn();
const mockInsertSelect = vi.fn();
const insertedPayloads: unknown[] = [];

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: 'token', user: { id: 'uid-scholar' } } } }),
    },
    storage: {
      from: () => ({ upload: mockUpload }),
    },
    from: () => ({
      insert: (payload: unknown) => {
        insertedPayloads.push(payload);
        return { select: () => ({ returns: mockInsertSelect }) };
      },
    }),
  }),
}));

const INST_ID = '11111111-1111-4111-8111-111111111111';

function profileFor(id: string, email: string, role: UserProfile['role']): UserProfile {
  return {
    id,
    email,
    fullName: 'Test User',
    username: email.split('@')[0] ?? null,
    role,
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [{ institutionId: INST_ID, isPrimary: true, code: 'BST', name: 'Balli School of Technology' }],
  };
}

describe('Phase 1 offline hardening', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    insertedPayloads.length = 0;
    await offlineDb.offlineVault.clear();
    await offlineDb.cachedDocuments.clear();
    useAuthStore.getState().clearAuth();
  });

  it('rejects legacy demo accounts offline even when an old build left a vault record behind', async () => {
    await saveOfflineUnlockCredential(
      'admin@tesdaconnect.test',
      'admin123',
      profileFor('11111111-0000-4000-8000-000000000001', 'admin@tesdaconnect.test', 'system_administrator'),
      720,
    );

    for (const password of ['admin123', 'Password123!', 'password123']) {
      const res = await verifyOfflineUnlockCredential('admin@tesdaconnect.test', password);
      expect(res.ok).toBe(false);
    }
    expect(await offlineDb.offlineVault.get('admin@tesdaconnect.test')).toBeUndefined();
  });

  it('purges leftover demo vault records during startup pruning but keeps real accounts', async () => {
    await saveOfflineUnlockCredential(
      'scholar@tesdaconnect.test',
      'scholar123',
      profileFor('demo', 'scholar@tesdaconnect.test', 'scholar'),
      720,
    );
    await saveOfflineUnlockCredential('juan@bst.tesda.ph', 'RealPass!1', profileFor('real', 'juan@bst.tesda.ph', 'scholar'), 12);

    await pruneExpiredOfflineData();

    expect(await offlineDb.offlineVault.get('scholar@tesdaconnect.test')).toBeUndefined();
    expect(await offlineDb.offlineVault.get('juan@bst.tesda.ph')).toBeDefined();
  });

  it('treats only network failures and 5xx responses as outages', () => {
    expect(isNetworkOrServerOutage({ message: 'Failed to fetch' })).toBe(true);
    expect(isNetworkOrServerOutage({ message: 'Service Unavailable', status: 503 })).toBe(true);
    expect(isNetworkOrServerOutage({ message: 'Invalid login credentials', status: 400 })).toBe(false);
    expect(isNetworkOrServerOutage({ message: 'User is banned', status: 400 })).toBe(false);
  });

  it('builds storage paths only for valid institution UUIDs', () => {
    expect(buildLearnerDocumentStoragePath(INST_ID, 'uid-1', 'My PSA (1).pdf', 42)).toBe(
      `${INST_ID}/uid-1/42_My_PSA__1_.pdf`,
    );
    expect(buildLearnerDocumentStoragePath('global', 'uid-1', 'a.pdf')).toBeNull();
    expect(buildLearnerDocumentStoragePath('BST', 'uid-1', 'a.pdf')).toBeNull();
  });
  // Offline document upload behaviour is covered in tests/document-upload-queue.test.ts.
});
