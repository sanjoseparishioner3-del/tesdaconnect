import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  CheckCircle2,
  HelpCircle,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthStatusMessage } from '@/features/auth/components/AuthStatusMessage';
import { PasswordInput } from '@/features/auth/components/PasswordInput';
import type { LoginFormValues } from '@/features/auth/loginSchema';
import { OfflineReadyBadge } from '@/components/pwa/OfflineReadyBadge';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { ROLE_LABELS, type UserProfile } from '@/types/auth';

export interface MfaChallengePrompt {
  factorId: string;
  challengeId: string;
  email: string;
}

interface LoginFormProps {
  form: UseFormReturn<LoginFormValues>;
  onSubmit: (values: LoginFormValues) => Promise<void>;
  isOnline: boolean;
  authError: string | null;
  onClearError: () => void;
  mfaPrompt?: MfaChallengePrompt | null;
  onSubmitMfa?: (code: string) => Promise<void>;
  onCancelMfa?: () => void;
  pendingWorkspaceProfile?: UserProfile | null;
  onSelectWorkspace?: (institutionId: string | null) => Promise<void>;
  onCancelWorkspace?: () => void;
}

export function LoginForm({
  form,
  onSubmit,
  isOnline,
  authError,
  onClearError,
  mfaPrompt = null,
  onSubmitMfa,
  onCancelMfa,
  pendingWorkspaceProfile = null,
  onSelectWorkspace,
  onCancelWorkspace,
}: LoginFormProps) {
  const [recoveryMode, setRecoveryMode] = React.useState(false);
  const [recoveryEmail, setRecoveryEmail] = React.useState('');
  const [recoveryPending, setRecoveryPending] = React.useState(false);
  const [recoveryNotice, setRecoveryNotice] = React.useState<{
    variant: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [supportTopic, setSupportTopic] = React.useState<'none' | 'admin' | 'guide'>('none');
  const [mfaCode, setMfaCode] = React.useState('');
  const [mfaPending, setMfaPending] = React.useState(false);
  const [workspacePendingId, setWorkspacePendingId] = React.useState<string | null>(null);

  function openRecoveryView() {
    onClearError();
    setRecoveryNotice(null);
    setRecoveryEmail(form.getValues('email') || '');
    setRecoveryMode(true);
  }

  async function handleSendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setRecoveryNotice(null);

    const parsedEmail = z.string().email().safeParse(recoveryEmail.trim());
    if (!parsedEmail.success) {
      setRecoveryNotice({
        variant: 'error',
        text: 'Enter a valid institutional email address to receive a recovery link.',
      });
      return;
    }

    if (!isOnline) {
      setRecoveryNotice({
        variant: 'error',
        text: 'Internet connection is required to send a password recovery email.',
      });
      return;
    }

    const client = getSupabaseClient();
    if (!isSupabaseConfigured || !client) {
      setRecoveryNotice({
        variant: 'error',
        text: 'Supabase authentication keys are not configured yet in .env.local.',
      });
      return;
    }

    setRecoveryPending(true);
    try {
      const { error } = await client.auth.resetPasswordForEmail(parsedEmail.data, {
        redirectTo: `${window.location.origin}/settings/password`,
      });
      if (error) {
        setRecoveryNotice({ variant: 'error', text: error.message });
        return;
      }
      setRecoveryNotice({
        variant: 'success',
        text: `If an account exists for ${parsedEmail.data}, a recovery link has been sent to that email address.`,
      });
      toast.success('Password recovery request dispatched.');
    } finally {
      setRecoveryPending(false);
    }
  }

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!onSubmitMfa) return;
    setMfaPending(true);
    try {
      await onSubmitMfa(mfaCode.trim());
    } finally {
      setMfaPending(false);
    }
  }

  async function handleChooseWorkspace(institutionId: string | null) {
    if (!onSelectWorkspace) return;
    setWorkspacePendingId(institutionId ?? '__all__');
    try {
      await onSelectWorkspace(institutionId);
    } finally {
      setWorkspacePendingId(null);
    }
  }

  const cardHeading = recoveryMode
    ? 'Reset Password'
    : mfaPrompt
      ? 'Multi-Factor Verification'
      : pendingWorkspaceProfile
        ? 'Select Authorized Workspace'
        : 'Welcome Back';

  const cardSubheading = recoveryMode
    ? 'Enter your institutional email address to receive a secure password reset link.'
    : mfaPrompt
      ? `Enter the 6-digit authenticator code for ${mfaPrompt.email} before continuing.`
      : pendingWorkspaceProfile
        ? `Verified as ${pendingWorkspaceProfile.fullName} (${ROLE_LABELS[pendingWorkspaceProfile.role]}). Choose a campus workspace to enter.`
        : 'Sign in once with your institutional email and password. You will be routed automatically to your authorized workspace.';

  return (
    <div
      data-login-auth-card
      className="w-full max-w-[460px] rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.12)] sm:p-8"
    >
      {/* Mobile-visible + Desktop Brand Lockup */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white p-1 shadow-sm border border-slate-200">
            <img src="/tesda-logo.png" alt="TESDA Seal" className="h-full w-full object-contain" />
          </div>
          <div className="text-left">
            <p className="text-base font-extrabold tracking-tight text-[#0F172A]">
              TCTESDA<span className="text-[#047857]">Connect</span>
            </p>
            <p className="text-[11px] font-medium text-slate-500">
              TESDA Training Operations Workflow Support
            </p>
          </div>
        </div>

        <h2 className="text-2xl font-extrabold tracking-tight text-[#0F172A]">{cardHeading}</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{cardSubheading}</p>
      </div>

      {/* Offline Status Banner */}
      {!isOnline && (
        <AuthStatusMessage
          variant="offline"
          className="mb-4"
          message="You are offline. You can still sign in if you have signed in on this device before while connected."
        />
      )}

      {pendingWorkspaceProfile ? (
        <div className="space-y-4">
          {authError && <AuthStatusMessage variant="error" message={authError} />}

          <div className="rounded-xl border border-emerald-200 bg-[#ECFDF5] px-3.5 py-2.5 text-xs text-emerald-950">
            <p className="font-semibold text-[#047857]">
              Verified Role: {ROLE_LABELS[pendingWorkspaceProfile.role]}
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-800">
              Campus assignments are enforced server-side via PostgreSQL Row-Level Security.
            </p>
          </div>

          <div className="space-y-2.5">
            {pendingWorkspaceProfile.institutions.map((inst) => (
              <button
                key={inst.institutionId}
                type="button"
                disabled={workspacePendingId !== null}
                onClick={() => void handleChooseWorkspace(inst.institutionId)}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-[#10B981] hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-[#047857]">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-[#0F172A]">{inst.name}</p>
                    <p className="text-xs text-slate-500">
                      Campus Code: {inst.code} {inst.isPrimary ? '· Primary' : ''}
                    </p>
                  </div>
                </div>
                {workspacePendingId === inst.institutionId ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#047857]" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}
              </button>
            ))}

            {pendingWorkspaceProfile.role === 'system_administrator' && (
              <button
                type="button"
                disabled={workspacePendingId !== null}
                onClick={() => void handleChooseWorkspace(null)}
                className="flex w-full items-center justify-between rounded-2xl border border-[#047857]/30 bg-emerald-50/60 px-4 py-3 text-left transition hover:border-[#047857] hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#047857] text-white">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-[#0F172A]">Unified Oversight (All Campuses)</p>
                    <p className="text-xs text-slate-600">System-wide governance across BST &amp; MIF</p>
                  </div>
                </div>
                {workspacePendingId === '__all__' && (
                  <Loader2 className="h-4 w-4 animate-spin text-[#047857]" />
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onCancelWorkspace?.()}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Use Another Account
          </button>
        </div>
      ) : mfaPrompt ? (
        <form onSubmit={handleVerifyMfa} className="space-y-4" noValidate>
          {authError && <AuthStatusMessage variant="error" message={authError} />}

          <div className="space-y-1.5">
            <Label htmlFor="mfa-code" className="text-xs font-semibold text-[#0F172A]">
              Authenticator Code (6 digits)
            </Label>
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="123456"
              className="h-11 rounded-xl border-slate-200 text-center font-mono text-base tracking-[0.35em] focus-visible:ring-emerald-600"
            />
          </div>

          <Button
            type="submit"
            disabled={mfaPending || mfaCode.trim().length < 6}
            className="h-11 w-full rounded-xl bg-[#047857] text-sm font-semibold text-white shadow-sm hover:bg-[#065f46]"
          >
            {mfaPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Verifying MFA Token...
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Verify &amp; Continue
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setMfaCode('');
              onCancelMfa?.();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Sign In
          </button>
        </form>
      ) : !recoveryMode ? (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200/80 bg-[#ECFDF5] px-3 py-2 text-[11px] font-semibold text-[#047857]">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Unified Institutional Gateway · Server-Verified Role Routing</span>
          </div>

          {authError && <AuthStatusMessage variant="error" message={authError} />}

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-[#0F172A]">
                Email Address
              </Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@tesda-connect.ph"
                  className="h-11 rounded-xl border-slate-200 pl-10 text-sm focus-visible:ring-emerald-600"
                  {...form.register('email')}
                />
              </div>
              {form.formState.errors.email && (
                <p className="text-xs font-medium text-red-600">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-[#0F172A]">
                Password
              </Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                hasError={Boolean(form.formState.errors.password)}
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-xs font-medium text-red-600">{form.formState.errors.password.message}</p>
              )}
            </div>

            {/* Automatic Offline Security Notice & Forgot Password Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <p className="inline-flex max-w-[265px] items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#047857]" aria-hidden="true" />
                <span>
                  Offline access prepares automatically per signed-in role; lock screen or sign out on shared PCs.
                  <OfflineReadyBadge className="ml-1 align-middle" />
                </span>
              </p>

              <button
                type="button"
                onClick={openRecoveryView}
                className="rounded text-xs font-semibold text-[#047857] transition hover:text-[#065f46] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                Forgot Password?
              </button>
            </div>

            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="h-11 w-full rounded-xl bg-[#047857] text-sm font-semibold text-white shadow-sm transition hover:bg-[#065f46] focus-visible:ring-emerald-600"
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying account &amp; role...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  Sign In
                </>
              )}
            </Button>

            {/* Secure Institutional Access & Offline Guidance */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-slate-600">
              <div className="flex items-center gap-2 font-semibold text-emerald-950">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Opisyal na Institutional Authentication</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                Gamitin ang inyong opisyal na email at password na nakatalaga sa database. Kapag nakapag-sign in na nang kahit isang beses sa device na ito, awtomatikong magagamit ang inyong workspace kahit walang internet o data connection.
              </p>
            </div>
          </form>
        </div>
      ) : (
        <form onSubmit={handleSendResetEmail} className="space-y-4" noValidate>
          {recoveryNotice && (
            <AuthStatusMessage variant={recoveryNotice.variant} message={recoveryNotice.text} />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="recovery-email" className="text-xs font-semibold text-[#0F172A]">
              Registered Institutional Email
            </Label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <Input
                id="recovery-email"
                type="email"
                autoComplete="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder="name@tesda-connect.ph"
                className="h-11 rounded-xl border-slate-200 pl-10 text-sm focus-visible:ring-emerald-600"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={recoveryPending}
            className="h-11 w-full rounded-xl bg-[#047857] text-sm font-semibold text-white hover:bg-[#065f46]"
          >
            {recoveryPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending Reset Link...
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Send Password Reset Link
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setRecoveryMode(false);
              setRecoveryNotice(null);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Sign In
          </button>
        </form>
      )}

      {/* Support Resources Strip */}
      <div className="mt-6 border-t border-slate-200 pt-4">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setSupportTopic((prev) => (prev === 'admin' ? 'none' : 'admin'))}
            aria-expanded={supportTopic === 'admin'}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-emerald-50 hover:text-[#047857] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <HelpCircle className="h-3.5 w-3.5 text-[#047857]" aria-hidden="true" />
            Contact System Administrator
          </button>

          <button
            type="button"
            onClick={() => setSupportTopic((prev) => (prev === 'guide' ? 'none' : 'guide'))}
            aria-expanded={supportTopic === 'guide'}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-emerald-50 hover:text-[#047857] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <BookOpen className="h-3.5 w-3.5 text-[#047857]" aria-hidden="true" />
            User Guide
          </button>

          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition hover:bg-emerald-50 hover:text-[#047857] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[#047857]" aria-hidden="true" />
            Back to Home
          </Link>
        </div>

        {supportTopic === 'admin' && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-[#F8FAFC] p-3 text-xs leading-relaxed text-slate-600">
            <strong className="block text-[#0F172A]">Need Account Activation or Role Changes?</strong>
            Reach your campus Registrar or System Administrator at Balli School of Technology (BST) or Mamburao Integrated Farm (MIF) to provision your email account and institution access. All roles are enforced server-side.
          </div>
        )}

        {supportTopic === 'guide' && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-[#ECFDF5] p-3 text-xs leading-relaxed text-emerald-950">
            <strong className="block text-[#047857]">Unified Sign-In &amp; Automatic Routing</strong>
            Sign in with your assigned email and password. TCTESDAConnect verifies your active role and campus access from Supabase PostgreSQL, routes you straight to your authorized dashboard, and prepares offline workspaces automatically.
          </div>
        )}
      </div>
    </div>
  );
}
