import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/features/auth/LoginPage';
import { offlineDb } from '@/lib/db/dexie';
import { saveOfflineUnlockCredential } from '@/lib/offline/offlineAuth';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import type { UserProfile } from '@/types/auth';

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockResetPasswordForEmail = vi.fn();
const mockProfileMaybeSingle = vi.fn();
const mockProfileUpdate = vi.fn<(_payload: unknown) => Promise<{ error: null }>>().mockResolvedValue({ error: null });
const mockInstitutionReturns = vi.fn();
const mockAuditInsert = vi.fn<(_payload: unknown) => Promise<{ error: null }>>().mockResolvedValue({ error: null });
const mockGetAal = vi.fn();
const mockListFactors = vi.fn();
const mockMfaChallenge = vi.fn();
const mockMfaVerify = vi.fn();

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
      signOut: mockSignOut,
      resetPasswordForEmail: mockResetPasswordForEmail,
      mfa: {
        getAuthenticatorAssuranceLevel: mockGetAal,
        listFactors: mockListFactors,
        challenge: mockMfaChallenge,
        verify: mockMfaVerify,
      },
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              returns: () => ({
                maybeSingle: mockProfileMaybeSingle,
              }),
            }),
          }),
          update: (payload: unknown) => ({
            eq: () => mockProfileUpdate(payload),
          }),
        };
      }
      if (table === 'security_audit_logs') {
        return {
          insert: (payload: unknown) => mockAuditInsert(payload),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            returns: mockInstitutionReturns,
          }),
        }),
      };
    },
  }),
}));

function renderLoginRoutes(initialEntries: Array<string | { pathname: string; state?: unknown }> = ['/login']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Admin Dashboard Workspace</div>} />
        <Route path="/enrollments" element={<div>Registrar Enrollments Workspace</div>} />
        <Route path="/competency" element={<div>Focal Person Competency Workspace</div>} />
        <Route path="/schedules" element={<div>Trainer Schedules Workspace</div>} />
        <Route path="/learner" element={<div>Scholar Learner Portal</div>} />
        <Route path="/settings/password" element={<div>Password Rotation Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Unified TCTESDAConnect Login Experience & Role-Based Security', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    useAuthStore.getState().clearAuth();
    useConnectivityStore.getState().setOnline(true);
    await offlineDb.offlineVault.clear();

    mockSignOut.mockResolvedValue({ error: null });
    mockProfileUpdate.mockResolvedValue({ error: null });
    mockAuditInsert.mockResolvedValue({ error: null });
    mockGetAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    mockListFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
    mockInstitutionReturns.mockResolvedValue({
      data: [
        {
          institution_id: 'inst-mif',
          is_primary: true,
          institutions: { id: 'inst-mif', code: 'MIF', name: 'Mamburao Integrated Farm' },
        },
      ],
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders unified Email & Password gateway without Staff/Scholar tabs or fake OAuth', async () => {
    const user = userEvent.setup();
    renderLoginRoutes();

    expect(screen.getByRole('heading', { name: /Training Operations Management System/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Welcome Back/i })).toBeInTheDocument();
    expect(screen.getByText(/Unified Institutional Gateway/i)).toBeInTheDocument();

    // Staff Login & Scholar Login tabs must be completely removed
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/Staff Login/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Scholar Login/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign in with Google/i })).not.toBeInTheDocument();

    // Support drawers & navigation links
    expect(screen.getByRole('button', { name: /Contact System Administrator/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /User Guide/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Home/i })).toBeInTheDocument();

    // Password visibility toggle
    const pwdInput = screen.getByLabelText(/^Password$/i);
    expect(pwdInput).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /Show password/i }));
    expect(pwdInput).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: /Hide password/i }));
    expect(pwdInput).toHaveAttribute('type', 'password');
  });

  it.each([
    {
      role: 'system_administrator',
      email: 'scholar.looking.alias@gmail.com',
      expectedText: 'Admin Dashboard Workspace',
    },
    {
      role: 'institutional_administrator',
      email: 'campus.head@tesda.ph',
      expectedText: 'Admin Dashboard Workspace',
    },
    {
      role: 'registrar',
      email: 'records.mif@tesda.ph',
      expectedText: 'Registrar Enrollments Workspace',
    },
    {
      role: 'focal_person',
      email: 'focal.mif@tesda.ph',
      expectedText: 'Focal Person Competency Workspace',
    },
    {
      role: 'trainer',
      email: 'trainer.bst@tesda.ph',
      expectedText: 'Trainer Schedules Workspace',
    },
    {
      role: 'scholar',
      email: 'admin.pretender@tesda.ph',
      expectedText: 'Scholar Learner Portal',
    },
  ])(
    'automatically redirects verified $role using trusted DB role regardless of email name ($email)',
    async ({ role, email, expectedText }) => {
      const user = userEvent.setup();
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: { id: `uid-${role}` } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: {
          id: `uid-${role}`,
          email,
          full_name: `Verified ${role}`,
          username: role,
          role,
          account_status: 'active',
          force_password_change: false,
          password_expires_at: null,
          password_expiry_exempt: true,
          last_login_at: null,
        },
        error: null,
      });

      renderLoginRoutes();
      await user.type(screen.getByLabelText(/Email Address/i), email);
      await user.type(screen.getByLabelText(/^Password$/i), 'StrongPass!123');
      await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

      await waitFor(
        () => {
          expect(screen.getByText(expectedText)).toBeInTheDocument();
        },
        { timeout: 6000 },
      );

      expect(mockProfileUpdate).toHaveBeenCalledTimes(1);
      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_user_id: `uid-${role}`,
          event: 'auth_login_succeeded',
        }),
      );
    },
    15000,
  );

  it('prevents cross-role requestedFrom redirect leaks and forces unauthorized deep link back to role default', async () => {
    const user = userEvent.setup();
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'uid-scholar' } },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'uid-scholar',
        email: 'juan@scholar.ph',
        full_name: 'Juan Dela Cruz',
        username: 'juan_scholar',
        role: 'scholar',
        account_status: 'active',
        force_password_change: false,
        password_expires_at: null,
        password_expiry_exempt: true,
        last_login_at: null,
      },
      error: null,
    });

    renderLoginRoutes([{ pathname: '/login', state: { from: '/dashboard' } }]);
    await user.type(screen.getByLabelText(/Email Address/i), 'juan@scholar.ph');
    await user.type(screen.getByLabelText(/^Password$/i), 'StrongPass!123');
    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(
      () => {
        expect(screen.getByText('Scholar Learner Portal')).toBeInTheDocument();
      },
      { timeout: 6000 },
    );
    expect(screen.queryByText('Admin Dashboard Workspace')).not.toBeInTheDocument();
  }, 15000);

  it('prompts for TOTP MFA verification when aal2 elevation is required before opening workspace', async () => {
    const user = userEvent.setup();
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'uid-admin-mfa' } },
      error: null,
    });
    mockGetAal.mockResolvedValueOnce({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    mockListFactors.mockResolvedValueOnce({
      data: {
        totp: [{ id: 'factor-1', friendly_name: 'Authenticator', factor_type: 'totp', status: 'verified', created_at: '2026-01-01' }],
        all: [],
      },
      error: null,
    });
    mockMfaChallenge.mockResolvedValueOnce({ data: { id: 'challenge-99' }, error: null });
    mockMfaVerify.mockResolvedValueOnce({ data: {}, error: null });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'uid-admin-mfa',
        email: 'admin.mfa@tesda.ph',
        full_name: 'MFA Admin',
        username: 'admin_mfa',
        role: 'system_administrator',
        account_status: 'active',
        force_password_change: false,
        password_expires_at: null,
        password_expiry_exempt: true,
        last_login_at: null,
      },
      error: null,
    });

    renderLoginRoutes();
    await user.type(screen.getByLabelText(/Email Address/i), 'admin.mfa@tesda.ph');
    await user.type(screen.getByLabelText(/^Password$/i), 'StrongPass!123');
    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Multi-Factor Verification/i })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Authenticator Code \(6 digits\)/i), '654321');
    await user.click(screen.getByRole('button', { name: /Verify & Continue/i }));

    await waitFor(
      () => {
        expect(mockMfaVerify).toHaveBeenCalledWith({
          factorId: 'factor-1',
          challengeId: 'challenge-99',
          code: '654321',
        });
        expect(screen.getByText('Admin Dashboard Workspace')).toBeInTheDocument();
      },
      { timeout: 6000 },
    );
  }, 15000);

  it('presents multi-institution workspace selection screen after login when user belongs to multiple campuses', async () => {
    const user = userEvent.setup();
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'uid-multi-reg' } },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'uid-multi-reg',
        email: 'shared.registrar@tesda.ph',
        full_name: 'Shared Campus Registrar',
        username: 'shared_reg',
        role: 'registrar',
        account_status: 'active',
        force_password_change: false,
        password_expires_at: null,
        password_expiry_exempt: true,
        last_login_at: null,
      },
      error: null,
    });
    mockInstitutionReturns.mockResolvedValueOnce({
      data: [
        {
          institution_id: 'inst-mif',
          is_primary: true,
          institutions: { id: 'inst-mif', code: 'MIF', name: 'Mamburao Integrated Farm' },
        },
        {
          institution_id: 'inst-bst',
          is_primary: false,
          institutions: { id: 'inst-bst', code: 'BST', name: 'Balli School of Technology' },
        },
      ],
      error: null,
    });

    renderLoginRoutes();
    await user.type(screen.getByLabelText(/Email Address/i), 'shared.registrar@tesda.ph');
    await user.type(screen.getByLabelText(/^Password$/i), 'StrongPass!123');
    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Select Authorized Workspace/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Balli School of Technology/i }));

    await waitFor(
      () => {
        expect(useAuthStore.getState().activeInstitutionId).toBe('inst-bst');
        expect(screen.getByText('Registrar Enrollments Workspace')).toBeInTheDocument();
      },
      { timeout: 6000 },
    );
  }, 15000);

  it('displays safe authentication failure alert for wrong credentials and signs out disabled accounts', async () => {
    const user = userEvent.setup();

    // Case A: wrong password / credentials
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    renderLoginRoutes();
    await user.type(screen.getByLabelText(/Email Address/i), 'staff@mif.tesda.ph');
    await user.type(screen.getByLabelText(/^Password$/i), 'WrongPassword!1');
    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid login credentials/i);
    });

    // Case B: disabled / inactive DB account status
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'uid-disabled' } },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'uid-disabled',
        email: 'staff@mif.tesda.ph',
        full_name: 'Disabled Staff',
        username: 'disabled_staff',
        role: 'registrar',
        account_status: 'inactive',
        force_password_change: false,
        password_expires_at: null,
        password_expiry_exempt: true,
        last_login_at: null,
      },
      error: null,
    });

    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(
      () => {
        expect(mockSignOut).toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent(/Account status is "inactive"/i);
      },
      { timeout: 5000 },
    );
  });

  it('never unlocks a cached offline credential when the server definitively rejects the sign-in', async () => {
    const user = userEvent.setup();
    const cachedProfile: UserProfile = {
      id: 'uid-revoked-scholar',
      email: 'revoked.scholar@bst.tesda.ph',
      fullName: 'Revoked Scholar',
      username: 'revoked_scholar',
      role: 'scholar',
      accountStatus: 'active',
      forcePasswordChange: false,
      passwordExpiresAt: null,
      passwordExpiryExempt: true,
      lastLoginAt: null,
      institutions: [{ institutionId: 'inst-bst', isPrimary: true, code: 'BST', name: 'Balli School of Technology' }],
    };
    await saveOfflineUnlockCredential(cachedProfile.email, 'OldPassword!1', cachedProfile, 12);

    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials', status: 400 },
    });

    renderLoginRoutes();
    await user.type(screen.getByLabelText(/Email Address/i), cachedProfile.email);
    await user.type(screen.getByLabelText(/^Password$/i), 'OldPassword!1');
    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Invalid login credentials/i);
    });
    expect(screen.queryByText('Scholar Learner Portal')).not.toBeInTheDocument();
    expect(useAuthStore.getState().profile).toBeNull();
    expect(await offlineDb.offlineVault.get(cachedProfile.email)).toBeUndefined();
  });

  it('falls back to the cached offline credential only when the auth server is unreachable', async () => {
    const user = userEvent.setup();
    const cachedProfile: UserProfile = {
      id: 'uid-field-scholar',
      email: 'field.scholar@bst.tesda.ph',
      fullName: 'Field Scholar',
      username: 'field_scholar',
      role: 'scholar',
      accountStatus: 'active',
      forcePasswordChange: false,
      passwordExpiresAt: null,
      passwordExpiryExempt: true,
      lastLoginAt: null,
      institutions: [{ institutionId: 'inst-bst', isPrimary: true, code: 'BST', name: 'Balli School of Technology' }],
    };
    await saveOfflineUnlockCredential(cachedProfile.email, 'FieldPass!1', cachedProfile, 12);

    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Service Unavailable', status: 503 },
    });

    renderLoginRoutes();
    await user.type(screen.getByLabelText(/Email Address/i), cachedProfile.email);
    await user.type(screen.getByLabelText(/^Password$/i), 'FieldPass!1');
    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(() => {
      expect(screen.getByText('Scholar Learner Portal')).toBeInTheDocument();
    });
    expect(useAuthStore.getState().isOfflineSession).toBe(true);
  });

  it('keeps offline access and opens the cached workspace when the connection stalls after sign-in', async () => {
    const user = userEvent.setup();
    const cachedProfile: UserProfile = {
      id: 'uid-slow-scholar',
      email: 'slow.scholar@bst.tesda.ph',
      fullName: 'Slow Network Scholar',
      username: 'slow_scholar',
      role: 'scholar',
      accountStatus: 'active',
      forcePasswordChange: false,
      passwordExpiresAt: null,
      passwordExpiryExempt: true,
      lastLoginAt: null,
      institutions: [{ institutionId: 'inst-bst', isPrimary: true, code: 'BST', name: 'Balli School of Technology' }],
    };
    await saveOfflineUnlockCredential(cachedProfile.email, 'SlowPass!2026', cachedProfile, 168);

    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: { id: cachedProfile.id } }, error: null });
    mockProfileMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'TimeoutError: Request timed out (slow or lost connection).' },
    });

    renderLoginRoutes();
    await user.type(screen.getByLabelText(/Email Address/i), cachedProfile.email);
    await user.type(screen.getByLabelText(/^Password$/i), 'SlowPass!2026');
    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

    await waitFor(() => {
      expect(screen.getByText('Scholar Learner Portal')).toBeInTheDocument();
    });
    expect(useAuthStore.getState().isOfflineSession).toBe(true);
    expect(await offlineDb.offlineVault.get(cachedProfile.email)).toBeDefined();
  });

  it('supports live Supabase Forgot Password flow and blocks recovery when offline', async () => {
    const user = userEvent.setup();
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });

    renderLoginRoutes();

    await user.click(screen.getByRole('button', { name: /Forgot Password\?/i }));
    expect(screen.getByRole('heading', { name: /Reset Password/i })).toBeVisible();

    await user.type(screen.getByLabelText(/Registered Institutional Email/i), 'registrar@bst.tesda.ph');
    await user.click(screen.getByRole('button', { name: /Send Password Reset Link/i }));

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);
      const firstCall = mockResetPasswordForEmail.mock.calls[0] as [string, { redirectTo?: string }] | undefined;
      expect(firstCall?.[0]).toBe('registrar@bst.tesda.ph');
      expect(firstCall?.[1]?.redirectTo).toContain('/settings/password');
      expect(screen.getByText(/recovery link has been sent to that email address/i)).toBeInTheDocument();
    });

    useConnectivityStore.getState().setOnline(false);
    await user.click(screen.getByRole('button', { name: /Send Password Reset Link/i }));
    expect(screen.getByText(/Internet connection is required to send a password recovery email/i)).toBeInTheDocument();
  });

  it(
    'shows offline banner, blocks unknown offline credentials, and unlocks previously authorized offline users to role workspace',
    async () => {
      const user = userEvent.setup();
      useConnectivityStore.getState().setOnline(false);

      const offlineFocal: UserProfile = {
        id: 'user-focal-1',
        email: 'focal@mif.tesda.ph',
        fullName: 'Marvin Cruz',
        username: 'focal_mif',
        role: 'focal_person',
        accountStatus: 'active',
        forcePasswordChange: false,
        passwordExpiresAt: null,
        passwordExpiryExempt: true,
        lastLoginAt: null,
        institutions: [{ institutionId: 'inst-mif', code: 'MIF', name: 'Mamburao Integrated Farm', isPrimary: true }],
      };

      const offlineSecret = 'TesdaStrongPass2026!';
      await saveOfflineUnlockCredential('focal@mif.tesda.ph', offlineSecret, offlineFocal, 12);

      renderLoginRoutes();
      expect(screen.getByText(/You are offline. You can still sign in/i)).toBeInTheDocument();

      // Unknown offline account must be rejected
      await user.type(screen.getByLabelText(/Email Address/i), 'unknown@mif.tesda.ph');
      await user.type(screen.getByLabelText(/^Password$/i), 'SomePassword123!');
      await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/No authorized offline session exists/i);
      });

      // Known offline focal_person with valid password unlocks directly to /competency
      await user.clear(screen.getByLabelText(/Email Address/i));
      await user.clear(screen.getByLabelText(/^Password$/i));
      await user.type(screen.getByLabelText(/Email Address/i), 'focal@mif.tesda.ph');
      await user.type(screen.getByLabelText(/^Password$/i), offlineSecret);
      await user.click(screen.getByRole('button', { name: /^Sign In$/i }));

      await waitFor(
        () => {
          expect(useAuthStore.getState().profile?.id).toBe('user-focal-1');
          expect(screen.getByText('Focal Person Competency Workspace')).toBeInTheDocument();
        },
        { timeout: 6000 },
      );
    },
    15000,
  );
});
