import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LaunchRedirect } from '@/app/AuthGuards';
import { offlineDb } from '@/lib/db/dexie';
import {
  extendOfflineUnlockWindow,
  getUnexpiredOfflineProfileByUserId,
  revokeOfflineUnlockCredentialsForUser,
  saveOfflineUnlockCredential,
} from '@/lib/offline/offlineAuth';
import { offlineTtlHoursForRole } from '@/lib/offline/offlinePolicy';
import { readPersistedSessionUserId, SUPABASE_AUTH_STORAGE_KEY } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { UserProfile } from '@/types/auth';

const HOUR_MS = 3600 * 1000;

function scholar(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'uid-scholar',
    email: 'juan@bst.tesda.ph',
    fullName: 'Juan Dela Cruz',
    username: 'juan',
    role: 'scholar',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [{ institutionId: 'inst-bst', isPrimary: true, code: 'BST', name: 'Balli School of Technology' }],
    ...overrides,
  };
}

describe('Phase 2: scholar offline access', () => {
  beforeEach(async () => {
    await offlineDb.offlineVault.clear();
    localStorage.clear();
    useAuthStore.getState().clearAuth();
  });

  it('gives scholars and applicants a longer offline window than staff', () => {
    expect(offlineTtlHoursForRole('scholar')).toBe(168);
    expect(offlineTtlHoursForRole('applicant')).toBe(168);
    expect(offlineTtlHoursForRole('registrar')).toBe(12);
    expect(offlineTtlHoursForRole('system_administrator')).toBe(12);
  });

  it('slides the offline window forward and refreshes the cached profile after online re-verification', async () => {
    await saveOfflineUnlockCredential('juan@bst.tesda.ph', 'Secret!123', scholar(), 1);
    const before = await offlineDb.offlineVault.get('juan@bst.tesda.ph');
    expect(new Date(before!.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(HOUR_MS);

    const expiresAt = await extendOfflineUnlockWindow(scholar({ fullName: 'Juan D. Cruz' }));

    const after = await offlineDb.offlineVault.get('juan@bst.tesda.ph');
    expect(after?.expiresAt).toBe(expiresAt);
    expect(new Date(after!.expiresAt).getTime() - Date.now()).toBeGreaterThan(160 * HOUR_MS);
    expect(after?.profile.fullName).toBe('Juan D. Cruz');
  });

  it('does not create offline access for a user who never signed in with a password on this device', async () => {
    expect(await extendOfflineUnlockWindow(scholar())).toBeNull();
    expect(await offlineDb.offlineVault.count()).toBe(0);
  });

  it('revokes offline access for a deactivated user id', async () => {
    await saveOfflineUnlockCredential('juan@bst.tesda.ph', 'Secret!123', scholar(), 168);
    await revokeOfflineUnlockCredentialsForUser('uid-scholar');
    expect(await getUnexpiredOfflineProfileByUserId('uid-scholar')).toBeNull();
  });

  it('reads the persisted Supabase session user id without a network call', () => {
    expect(readPersistedSessionUserId()).toBeNull();
    localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify({ access_token: 'x', user: { id: 'uid-scholar' } }));
    expect(readPersistedSessionUserId()).toBe('uid-scholar');
    localStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, 'not-json');
    expect(readPersistedSessionUserId()).toBeNull();
  });

  function renderLaunch() {
    return render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/app" element={<LaunchRedirect />} />
          <Route path="/login" element={<div>Login Screen</div>} />
          <Route path="/learner" element={<div>Scholar Learner Portal</div>} />
          <Route path="/dashboard" element={<div>Staff Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('opens the installed app straight into the scholar portal when signed in', () => {
    useAuthStore.getState().setProfile(scholar(), { isOfflineSession: true });
    renderLaunch();
    expect(screen.getByText('Scholar Learner Portal')).toBeInTheDocument();
  });

  it('opens the installed app on the login screen when nobody is signed in', () => {
    renderLaunch();
    expect(screen.getByText('Login Screen')).toBeInTheDocument();
  });
});
