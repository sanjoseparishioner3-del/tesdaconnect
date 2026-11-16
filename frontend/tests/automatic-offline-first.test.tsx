import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceLockOverlay } from '@/features/auth/components/DeviceLockOverlay';
import { LoginPage } from '@/features/auth/LoginPage';
import {
  TesdaConnectOfflineDb,
  offlineDb,
  pruneExpiredOfflineData,
  purgeOfflineUserData,
  purgeOtherUsersCachedData,
  safeDexieWrite,
} from '@/lib/db/dexie';
import {
  getUnexpiredOfflineProfileByUserId,
  pruneExpiredVaultRecords,
  saveOfflineUnlockCredential,
  verifySessionLockPassword,
} from '@/lib/offline/offlineAuth';
import {
  refreshReactiveQueueCounts,
  verifyServerReachability,
} from '@/lib/sync/connectivityMonitor';
import {
  enqueueMutation,
  resolveConflictManually,
  runOutboxSync,
} from '@/lib/sync/syncEngine';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { useDeviceLockStore } from '@/stores/deviceLockStore';
import type { UserProfile } from '@/types/auth';

const mockSignInWithPassword = vi.fn();
const mockGetSession = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/lib/env', () => ({
  env: {
    VITE_APP_NAME: 'TCTESDAConnect',
    VITE_SUPABASE_URL: 'https://test.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    VITE_SENTRY_DSN: '',
    VITE_SENTRY_ENVIRONMENT: 'test',
    VITE_OFFLINE_MAX_TTL_HOURS: 12,
  },
  isSupabaseConfigured: true,
}));

vi.mock('@/lib/authProfile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authProfile')>();
  return {
    ...actual,
    refreshOfflineCachesForUser: vi.fn().mockResolvedValue('2026-11-16T03:00:00.000Z'),
  };
});

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      getSession: mockGetSession,
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          returns: () => ({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

function buildTestProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'focal@mif.tesda.ph',
    fullName: overrides.fullName ?? 'Marvin Cruz',
    username: overrides.username ?? 'focal_mif',
    role: overrides.role ?? 'focal_person',
    accountStatus: overrides.accountStatus ?? 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: overrides.institutions ?? [
      {
        institutionId: 'inst-mif',
        code: 'MIF',
        name: 'Mamburao Integrated Farm',
        isPrimary: true,
      },
    ],
  };
}

describe('Automatic Role-Based Offline-First Architecture', () => {
  beforeEach(async () => {
    useAuthStore.getState().clearAuth();
    useConnectivityStore.getState().setOnline(true);
    useConnectivityStore.getState().setStorageWarning(null);
    useDeviceLockStore.getState().unlockDevice();
    await purgeOfflineUserData(offlineDb);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enables automatic offline initialization by default and removes manual opt-in controls', () => {
    expect(useAuthStore.getState().offlineOptIn).toBe(true);

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText(/Permit authorized offline cache/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enable Offline Mode/i })).not.toBeInTheDocument();
  });

  it('verifies actual server reachability rather than trusting navigator.onLine alone', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: true,
    });

    // Browser reports online=true, but Supabase fetch fails with network error
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Network unreachable'));
    const firstCheck = await verifyServerReachability({ timeoutMs: 1000 });
    expect(firstCheck).toBe(false);
    expect(useConnectivityStore.getState().isOnline).toBe(false);
    expect(useConnectivityStore.getState().syncStatus).toBe('offline');

    // Gateway 503 should also count as server unreachable
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const gatewayDown = await verifyServerReachability({ timeoutMs: 1000 });
    expect(gatewayDown).toBe(false);

    // Recovered server < 500 transitions reachability cleanly back online
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const recovered = await verifyServerReachability({ timeoutMs: 1000 });
    expect(recovered).toBe(true);
    expect(useConnectivityStore.getState().isOnline).toBe(true);
  });

  it('persists role-scoped caches and pending outbox mutations across IndexedDB restarts', async () => {
    const dbName = `tesda-restart-test-${Date.now()}`;
    const db1 = new TesdaConnectOfflineDb(dbName);

    const queued = await enqueueMutation(
      {
        userId: 'focal-1',
        entityType: 'competency_progress',
        entityId: 'app-1:task-9',
        operation: 'upsert',
        baseVersion: 1,
        payload: {
          enrollment_application_id: 'app-1',
          competency_task_id: 'task-9',
          status: 'competent',
        },
      },
      db1,
    );

    await db1.cachedFocalData.put({
      id: 'focal-1:batch:b1',
      userId: 'focal-1',
      institutionId: 'inst-mif',
      batchId: 'b1',
      kind: 'batch',
      entityId: 'b1',
      payload: { id: 'b1', code: 'MIF-01', name: 'Batch 1', course_id: 'c1' },
      syncedAt: new Date().toISOString(),
    });

    await db1.cachedTraineeDirectory.put({
      id: 'reg-1:app-1',
      userId: 'reg-1',
      applicationId: 'app-1',
      institutionId: 'inst-bst',
      referenceNo: 'REF-2026-001',
      learnerUserId: 'learner-1',
      learnerName: 'Ana Reyes',
      email: 'ana@student.ph',
      courseId: 'c1',
      courseName: 'Cookery NC II',
      courseCode: 'CK2',
      institutionName: 'Balli School of Technology',
      institutionCode: 'BST',
      scholarshipPackage: 'TWSP',
      applicationStatus: 'confirmed',
      recordCompleteness: 100,
      scholarId: 'BST-2026-001',
      forwardingId: null,
      archivedAt: null,
      learnerProfileJson: { uli_number: 'ULI-001' },
      updatedAt: new Date().toISOString(),
    });

    db1.close();

    // Simulate page reload / app restart by opening fresh Dexie handle
    const db2 = new TesdaConnectOfflineDb(dbName);
    const persistedMutation = await db2.syncOutbox.get(queued.mutationId);
    const persistedFocal = await db2.cachedFocalData.where('userId').equals('focal-1').toArray();
    const persistedDir = await db2.cachedTraineeDirectory.where('userId').equals('reg-1').toArray();

    expect(persistedMutation?.entityId).toBe('app-1:task-9');
    expect(persistedMutation?.mutationId).toBe(queued.mutationId);
    expect(persistedFocal).toHaveLength(1);
    expect(persistedDir[0]?.learnerName).toBe('Ana Reyes');

    db2.close();
    await db2.delete();
  });

  it('tracks reactive pending counts including queued documents and handles conflicts & revoked permissions safely', async () => {
    const dbName = `tesda-sync-lifecycle-${Date.now()}`;
    const testDb = new TesdaConnectOfflineDb(dbName);

    const conflictItem = await enqueueMutation(
      {
        userId: 'reg-1',
        entityType: 'trainee_profile',
        entityId: 'learner-1',
        operation: 'upsert',
        baseVersion: 1,
        payload: { contact_number: '09171234567' },
      },
      testDb,
    );

    const revokedItem = await enqueueMutation(
      {
        userId: 'reg-1',
        entityType: 'trainee_profile',
        entityId: 'learner-2',
        operation: 'upsert',
        baseVersion: 1,
        payload: { uli_number: 'ULI-999' },
      },
      testDb,
    );

    const summary1 = await runOutboxSync(
      'reg-1',
      async (item) => {
        await Promise.resolve();
        if (item.mutationId === conflictItem.mutationId) {
          return {
            status: 'conflict',
            message: 'Newer server record exists.',
            serverData: { contact_number: '09998887777', version: 2 },
          };
        }
        return {
          status: 'failed',
          message: '[PERMISSION_REVOKED] Role lacks ULI write access.',
        };
      },
      { db: testDb },
    );

    expect(summary1.conflicts).toBe(1);
    expect(summary1.failed).toBe(1);

    const conflicts = await testDb.conflicts.where('userId').equals('reg-1').toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.changedFields).toContain('contact_number');

    // Never silently overwrote server data; manual server acceptance clears conflict cleanly
    await resolveConflictManually(
      { conflictId: conflicts[0]!.conflictId, action: 'accept_server' },
      testDb,
    );
    expect(await testDb.syncOutbox.get(conflictItem.mutationId)).toBeUndefined();

    // Failed revoked item remains preserved locally rather than lost
    const preservedFailed = await testDb.syncOutbox.get(revokedItem.mutationId);
    expect(preservedFailed?.status).toBe('failed');
    expect(preservedFailed?.lastError).toContain('PERMISSION_REVOKED');

    // Also test reactive queue counts in default offlineDb (outbox + queued documents)
    await enqueueMutation({
      userId: 'sch-1',
      entityType: 'trainee_intake',
      entityId: 'draft-1',
      operation: 'submit',
      baseVersion: null,
      payload: { first_name: 'Kyla' },
    });
    await offlineDb.cachedDocuments.put({
      id: 'doc-q1',
      ownerUserId: 'sch-1',
      targetUserId: 'sch-1',
      institutionId: 'inst-mif',
      documentType: 'id_pictures',
      originalName: 'id.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 512,
      status: 'pending',
      remarks: null,
      storagePath: 'inst-mif/sch-1/id.jpg',
      blob: new Blob(['pic']),
      queuedUpload: true,
      syncedAt: new Date().toISOString(),
    });
    const reactive = await refreshReactiveQueueCounts('sch-1');
    expect(reactive.pendingCount).toBe(2);

    testDb.close();
    await testDb.delete();
  });

  it('isolates accounts, never stores raw passwords, enforces TTL expiry, and unlocks device lock screen safely', async () => {
    const userA = buildTestProfile({ id: 'user-a', email: 'a@bst.tesda.ph', fullName: 'User Alpha' });
    const userB = buildTestProfile({ id: 'user-b', email: 'b@mif.tesda.ph', fullName: 'User Beta' });
    const secretPass = 'SecretPass!2026';

    await saveOfflineUnlockCredential(userA.email, secretPass, userA, 12);
    const vaultRow = await offlineDb.offlineVault.get(userA.email);
    expect(vaultRow).toBeDefined();
    expect(JSON.stringify(vaultRow)).not.toContain(secretPass);

    // Populate User A's cached PII
    await offlineDb.cachedLearnerRecords.put({
      userId: userA.id,
      institutionId: 'inst-bst',
      learnerProfile: { first_name: 'Alpha' },
      enrollmentApp: { reference_no: 'A-001' },
      updatedAt: new Date().toISOString(),
    });
    await offlineDb.cachedTraineeDirectory.put({
      id: `${userA.id}:app-a`,
      userId: userA.id,
      applicationId: 'app-a',
      institutionId: 'inst-bst',
      referenceNo: 'A-001',
      learnerUserId: 'l-a',
      learnerName: 'Confidential Alpha Trainee',
      email: 'l@a.ph',
      courseId: null,
      courseName: 'Cookery',
      courseCode: 'CK',
      institutionName: 'BST',
      institutionCode: 'BST',
      scholarshipPackage: null,
      applicationStatus: 'confirmed',
      recordCompleteness: 100,
      scholarId: 'S1',
      forwardingId: null,
      archivedAt: null,
      learnerProfileJson: null,
      updatedAt: new Date().toISOString(),
    });

    // Wrong password rejected; right password unlocks screen
    expect((await verifySessionLockPassword(userA.email, 'WrongPass!')).ok).toBe(false);
    expect((await verifySessionLockPassword(userA.email, secretPass)).ok).toBe(true);

    // Account switching to User B wipes User A's cached PII and vault
    await saveOfflineUnlockCredential(userB.email, 'BetaPass!2026', userB, 12);
    await purgeOtherUsersCachedData(userB.id);
    expect(await offlineDb.cachedLearnerRecords.get(userA.id)).toBeUndefined();
    expect(await offlineDb.cachedTraineeDirectory.where('userId').equals(userA.id).count()).toBe(0);
    expect(await offlineDb.offlineVault.get(userA.email)).toBeUndefined();
    expect(await offlineDb.offlineVault.get(userB.email)).toBeDefined();

    // Expired vault record is rejected & pruned
    await offlineDb.offlineVault.update(userB.email, {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(await getUnexpiredOfflineProfileByUserId(userB.id)).toBeNull();
    expect(await offlineDb.offlineVault.get(userB.email)).toBeUndefined();
    await pruneExpiredVaultRecords();
    await pruneExpiredOfflineData();

    // Test DeviceLockOverlay unlock UI
    const user = userEvent.setup();
    await saveOfflineUnlockCredential(userA.email, secretPass, userA, 12);
    useAuthStore.getState().setProfile(userA, { isOfflineSession: true });
    useDeviceLockStore.getState().lockDevice('Shared lab inactivity lock');

    render(
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<DeviceLockOverlay />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Session Locked — Shared PC Protection/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Password$/i), secretPass);
    await user.click(screen.getByRole('button', { name: /Unlock Session/i }));

    await waitFor(() => {
      expect(useDeviceLockStore.getState().isLocked).toBe(false);
    });
  });

  it('recovers from QuotaExceededError during IndexedDB write while preserving queued uploads', async () => {
    await offlineDb.cachedDocuments.bulkPut([
      {
        id: 'old-preview',
        ownerUserId: 'u1',
        targetUserId: 'u1',
        institutionId: 'inst-1',
        documentType: 'id_pictures',
        originalName: 'cached.png',
        mimeType: 'image/png',
        sizeBytes: 1000,
        status: 'verified',
        remarks: null,
        storagePath: 'inst-1/u1/cached.png',
        blob: new Blob(['old-preview-bytes']),
        queuedUpload: false,
        syncedAt: new Date().toISOString(),
      },
      {
        id: 'pending-upload',
        ownerUserId: 'u1',
        targetUserId: 'u1',
        institutionId: 'inst-1',
        documentType: 'birth_cert',
        originalName: 'queued.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        status: 'pending',
        remarks: null,
        storagePath: 'inst-1/u1/queued.pdf',
        blob: new Blob(['important-queued-bytes']),
        queuedUpload: true,
        syncedAt: new Date().toISOString(),
      },
    ]);

    let attempts = 0;
    const onQuotaWarning = vi.fn();
    const res = await safeDexieWrite(
      async () => {
        await Promise.resolve();
        attempts += 1;
        if (attempts === 1) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        return 'saved';
      },
      { onQuotaWarning },
    );

    expect(res).toEqual({ ok: true, data: 'saved' });
    expect(onQuotaWarning).toHaveBeenCalledTimes(1);

    // Non-critical blob evicted; queuedUpload blob preserved!
    expect((await offlineDb.cachedDocuments.get('old-preview'))?.blob).toBeUndefined();
    expect((await offlineDb.cachedDocuments.get('pending-upload'))?.blob).toBeDefined();
  });
});
