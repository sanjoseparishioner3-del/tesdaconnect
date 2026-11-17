import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import gsap from 'gsap';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { LoginBrandingPanel } from '@/features/auth/components/LoginBrandingPanel';
import { LoginForm, type MfaChallengePrompt } from '@/features/auth/components/LoginForm';
import { isNetworkOrServerOutage } from '@/features/auth/authErrors';
import { loginFormSchema, type LoginFormValues } from '@/features/auth/loginSchema';
import { fetchAuthenticatedProfile, refreshOfflineCachesForUser } from '@/lib/authProfile';
import {
  offlineDb,
  pruneExpiredOfflineData,
  purgeOtherUsersCachedData,
  safeDexieWrite,
} from '@/lib/db/dexie';
import { isSupabaseConfigured } from '@/lib/env';
import type { HeroPresetKey } from '@/lib/landing/laptopMetrics';
import {
  revokeOfflineUnlockCredential,
  saveOfflineUnlockCredential,
  verifyOfflineUnlockCredential,
} from '@/lib/offline/offlineAuth';
import { offlineTtlHoursForRole } from '@/lib/offline/offlinePolicy';
import { resolveAuthorizedPostLoginRoute } from '@/lib/rbac';
import { getSupabaseClient } from '@/lib/supabase';
import { refreshReactiveQueueCounts } from '@/lib/sync/connectivityMonitor';
import { triggerForegroundSync } from '@/lib/sync/supabaseTransport';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { useDeviceLockStore } from '@/stores/deviceLockStore';
import type { UserProfile } from '@/types/auth';

interface LoginRouteState {
  from?: string;
  morphFromLaptop?: boolean;
  preset?: HeroPresetKey;
}

interface PendingAuthCompletion {
  profile: UserProfile;
  password: string;
  isOfflineSession: boolean;
  offlineExpiresAt?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setOfflineOptIn = useAuthStore((s) => s.setOfflineOptIn);

  const routeState = (location.state as LoginRouteState | null) ?? null;

  const [authError, setAuthError] = React.useState<string | null>(null);
  const [mfaChallenge, setMfaChallenge] = React.useState<{
    prompt: MfaChallengePrompt;
    profile: UserProfile;
    password: string;
  } | null>(null);
  const [pendingWorkspace, setPendingWorkspace] = React.useState<PendingAuthCompletion | null>(
    null,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Smooth GSAP Laptop-to-Login Morph entrance when arriving from landing or loading /login
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return undefined;

    const fromLanding = Boolean(routeState?.morphFromLaptop);

    const ctx = gsap.context(() => {
      const laptopStage = root.querySelector('[data-login-laptop-stage]');
      const authCard = root.querySelector('[data-login-auth-card]');
      const floatBadges = gsap.utils.toArray<HTMLElement>('[data-login-float-badge]', root);

      if (laptopStage) {
        gsap.fromTo(
          laptopStage,
          {
            opacity: 0,
            x: fromLanding ? 72 : 0,
            y: fromLanding ? 0 : 18,
            scale: fromLanding ? 1.07 : 0.96,
          },
          {
            opacity: 1,
            x: 0,
            y: 0,
            scale: 1,
            duration: 0.65,
            ease: 'power3.out',
          },
        );
      }

      if (authCard) {
        gsap.fromTo(
          authCard,
          {
            opacity: 0,
            x: fromLanding ? -80 : -28,
            scale: 0.94,
          },
          {
            opacity: 1,
            x: 0,
            scale: 1,
            duration: 0.65,
            ease: 'power3.out',
            delay: fromLanding ? 0.06 : 0.04,
          },
        );
      }

      if (floatBadges.length > 0) {
        gsap.fromTo(
          floatBadges,
          { opacity: 0, scale: 0.9, y: 12 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: 0.45,
            stagger: 0.06,
            ease: 'power2.out',
            delay: 0.22,
          },
        );
      }
    }, root);

    return () => {
      ctx.revert();
    };
  }, [routeState?.morphFromLaptop]);

  async function finalizeSessionAndRedirect(
    completion: PendingAuthCompletion,
    selectedInstitutionId: string | null,
  ) {
    const { profile: userProfile, password, isOfflineSession, offlineExpiresAt } = completion;

    setOfflineOptIn(true);
    await pruneExpiredOfflineData().catch(() => undefined);
    const { otherUserPendingCount } = await purgeOtherUsersCachedData(userProfile.id).catch(
      () => ({ otherUserPendingCount: 0 }),
    );

    if (isOfflineSession) {
      await safeDexieWrite(() =>
        offlineDb.syncMeta.put({
          key: `user:${userProfile.id}`,
          userId: userProfile.id,
          lastSyncedAt: new Date().toISOString(),
          offlineEnabledForUser: true,
          offlineExpiresAt: offlineExpiresAt ?? null,
          deviceId: 'browser-client',
        }),
      );
      useDeviceLockStore.getState().unlockDevice();
      setProfile(userProfile, {
        isOfflineSession: true,
        activeInstitutionId: selectedInstitutionId,
      });
      await refreshReactiveQueueCounts(userProfile.id);
      if (otherUserPendingCount > 0) {
        toast.info('Previous account cached records cleared; any other user pending queue stays isolated.');
      }
      toast.success(`Unlocked offline workspace for ${userProfile.fullName}`);
      void navigate(resolveAuthorizedPostLoginRoute(userProfile, routeState?.from));
      return;
    }

    const client = getSupabaseClient();
    const offlineTtlHours = offlineTtlHoursForRole(userProfile.role);
    const expiresAt = new Date(Date.now() + offlineTtlHours * 3600 * 1000).toISOString();

    await saveOfflineUnlockCredential(userProfile.email, password, userProfile, offlineTtlHours);
    await safeDexieWrite(
      () =>
        offlineDb.syncMeta.put({
          key: `user:${userProfile.id}`,
          userId: userProfile.id,
          lastSyncedAt: new Date().toISOString(),
          offlineEnabledForUser: true,
          offlineExpiresAt: expiresAt,
          deviceId: 'browser-client',
        }),
      { onQuotaWarning: (msg) => useConnectivityStore.getState().setStorageWarning(msg) },
    );

    useDeviceLockStore.getState().unlockDevice();
    setProfile(userProfile, {
      isOfflineSession: false,
      activeInstitutionId: selectedInstitutionId,
    });

    if (client) {
      void Promise.resolve(
        client
          .from('profiles')
          .update({ last_login_at: new Date().toISOString() })
          .eq('id', userProfile.id),
      ).catch(() => undefined);

      void Promise.resolve(
        client.from('security_audit_logs').insert({
          actor_user_id: userProfile.id,
          institution_id: selectedInstitutionId,
          event: 'auth_login_succeeded',
          description: `Unified sign-in succeeded as ${userProfile.role}.`,
          metadata: {
            role: userProfile.role,
            institution_id: selectedInstitutionId,
          },
        }),
      ).catch(() => undefined);

      void Promise.resolve(refreshOfflineCachesForUser(client, userProfile.id, userProfile.role))
        .then(() => refreshReactiveQueueCounts(userProfile.id))
        .then(() => triggerForegroundSync(userProfile.id))
        .catch(() => undefined);
    }

    toast.success(`Signed in as ${userProfile.fullName}`);
    void navigate(resolveAuthorizedPostLoginRoute(userProfile, routeState?.from));
  }

  async function continueAfterMfaOrProfile(completion: PendingAuthCompletion) {
    if (completion.profile.institutions.length > 1) {
      setPendingWorkspace(completion);
      return;
    }
    const defaultInstId =
      completion.profile.institutions[0]?.institutionId ?? null;
    await finalizeSessionAndRedirect(completion, defaultInstId);
  }

  async function handleSubmit(values: LoginFormValues) {
    setAuthError(null);
    setMfaChallenge(null);
    setPendingWorkspace(null);

    const attemptOfflineUnlock = async () => {
      const offlineResult = await verifyOfflineUnlockCredential(values.email, values.password);
      if (!offlineResult.ok) {
        setAuthError(offlineResult.reason);
        return;
      }

      await continueAfterMfaOrProfile({
        profile: offlineResult.profile,
        password: values.password,
        isOfflineSession: true,
        offlineExpiresAt: offlineResult.expiresAt,
      });
    };

    if (!isOnline) {
      await attemptOfflineUnlock();
      return;
    }

    const client = getSupabaseClient();

    if (!isSupabaseConfigured || !client) {
      setAuthError(
        'Supabase environment keys (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY) are not configured yet. Configure .env.local to authenticate.',
      );
      return;
    }

    let data: { user: { id: string } | null } = { user: null };
    let error: { message: string; status?: number } | null = null;
    try {
      const res = await client.auth.signInWithPassword({
        email: values.email.trim(),
        password: values.password,
      });
      data = { user: res.data?.user ?? null };
      error = res.error;
    } catch (caught) {
      useConnectivityStore.getState().setReachability(
        typeof navigator !== 'undefined' ? navigator.onLine : false,
        false,
      );
      await attemptOfflineUnlock();
      if (caught instanceof Error && !useAuthStore.getState().profile) {
        setAuthError(caught.message);
      }
      return;
    }

    // Only a network/server outage may fall back to the offline vault. A definitive
    // rejection from the server (wrong or changed password, banned/inactive account)
    // must never be overridden by a previously cached credential.
    if (error && isNetworkOrServerOutage(error)) {
      useConnectivityStore.getState().setReachability(
        typeof navigator !== 'undefined' ? navigator.onLine : false,
        false,
      );
      await attemptOfflineUnlock();
      return;
    }

    if (error || !data.user) {
      await revokeOfflineUnlockCredential(values.email);
      setAuthError(error?.message ?? 'Invalid login credentials.');
      return;
    }

    const { profile: userProfile, inactiveReason } = await fetchAuthenticatedProfile(
      client,
      data.user.id,
    );

    if (!userProfile) {
      await revokeOfflineUnlockCredential(values.email);
      await client.auth.signOut().catch(() => undefined);
      setAuthError(
        inactiveReason ??
          'Your account is inactive, pending approval, or could not be verified. Contact the System Administrator.',
      );
      return;
    }

    // Check Supabase Auth MFA assurance when TOTP factors are enrolled
    if (
      client.auth.mfa &&
      typeof client.auth.mfa.getAuthenticatorAssuranceLevel === 'function' &&
      typeof client.auth.mfa.listFactors === 'function' &&
      typeof client.auth.mfa.challenge === 'function'
    ) {
      const aalRes = await client.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => null);
      if (
        aalRes &&
        !aalRes.error &&
        aalRes.data.currentLevel === 'aal1' &&
        aalRes.data.nextLevel === 'aal2'
      ) {
        const factorsRes = await client.auth.mfa.listFactors().catch(() => null);
        const totpFactor = factorsRes?.data?.totp?.find((f) => f.status === 'verified');
        if (totpFactor) {
          const chal = await client.auth.mfa.challenge({ factorId: totpFactor.id });
          if (chal.error || !chal.data) {
            await client.auth.signOut().catch(() => undefined);
            setAuthError(chal.error?.message ?? 'Unable to initialize MFA challenge.');
            return;
          }
          setMfaChallenge({
            prompt: {
              factorId: totpFactor.id,
              challengeId: chal.data.id,
              email: userProfile.email,
            },
            profile: userProfile,
            password: values.password,
          });
          return;
        }
      }
    }

    await continueAfterMfaOrProfile({
      profile: userProfile,
      password: values.password,
      isOfflineSession: false,
    });
  }

  async function handleSubmitMfa(code: string) {
    if (!mfaChallenge) return;
    setAuthError(null);
    const client = getSupabaseClient();
    if (!client || typeof client.auth.mfa?.verify !== 'function') {
      setAuthError('MFA verification client unavailable.');
      return;
    }

    const res = await client.auth.mfa.verify({
      factorId: mfaChallenge.prompt.factorId,
      challengeId: mfaChallenge.prompt.challengeId,
      code,
    });

    if (res.error) {
      setAuthError(res.error.message || 'Invalid MFA verification code.');
      return;
    }

    const completed: PendingAuthCompletion = {
      profile: mfaChallenge.profile,
      password: mfaChallenge.password,
      isOfflineSession: false,
    };
    setMfaChallenge(null);
    await continueAfterMfaOrProfile(completed);
  }

  async function handleCancelMfa() {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut().catch(() => undefined);
    }
    setMfaChallenge(null);
    setAuthError(null);
  }

  async function handleSelectWorkspace(institutionId: string | null) {
    if (!pendingWorkspace) return;
    const chosen = pendingWorkspace;
    setPendingWorkspace(null);
    await finalizeSessionAndRedirect(chosen, institutionId);
  }

  async function handleCancelWorkspace() {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut().catch(() => undefined);
    }
    setPendingWorkspace(null);
    setAuthError(null);
  }

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-white px-4 py-6 text-[#0F172A] sm:px-6 lg:bg-[#F8FAFC] lg:px-8"
    >
      {/* Subtle light emerald ambient sweep across top-right corner inspired by reference design */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_92%_10%,rgba(16,185,129,0.09),transparent_42%),radial-gradient(circle_at_8%_88%,rgba(4,120,87,0.06),transparent_44%)]"
      />

      <main className="relative z-10 mx-auto grid w-full max-w-7xl items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
        {/* Left Panel (~58% / 7 cols on desktop): Institutional Branding + 3D Laptop Presentation */}
        <LoginBrandingPanel initialPreset={routeState?.preset} />

        {/* Right Panel (~42% / 5 cols on desktop; primary centered column on mobile/tablet) */}
        <section
          aria-label="Authentication Credentials"
          className="flex items-center justify-center lg:col-span-5"
        >
          <LoginForm
            form={form}
            onSubmit={handleSubmit}
            isOnline={isOnline}
            authError={authError}
            onClearError={() => setAuthError(null)}
            mfaPrompt={mfaChallenge?.prompt ?? null}
            onSubmitMfa={handleSubmitMfa}
            onCancelMfa={() => void handleCancelMfa()}
            pendingWorkspaceProfile={pendingWorkspace?.profile ?? null}
            onSelectWorkspace={handleSelectWorkspace}
            onCancelWorkspace={() => void handleCancelWorkspace()}
          />
        </section>
      </main>
    </div>
  );
}
