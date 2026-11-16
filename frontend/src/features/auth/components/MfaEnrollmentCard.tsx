import { useCallback, useEffect, useState } from 'react';
import type { Factor } from '@supabase/supabase-js';
import { Loader2, QrCode, ShieldCheck, Trash2, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import type { AppRole } from '@/types/auth';

const PRIVILEGED_MFA_ROLES: ReadonlySet<AppRole> = new Set([
  'system_administrator',
  'institutional_administrator',
  'registrar',
  'focal_person',
]);

interface PendingTotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export function MfaEnrollmentCard() {
  const profile = useAuthStore((state) => state.profile);
  const isOfflineSession = useAuthStore((state) => state.isOfflineSession);
  const isOnline = useConnectivityStore((state) => state.isOnline);

  const [factors, setFactors] = useState<Factor[]>([]);
  const [loadingFactors, setLoadingFactors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingEnroll, setPendingEnroll] = useState<PendingTotpEnrollment | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const isPrivileged = profile ? PRIVILEGED_MFA_ROLES.has(profile.role) : false;
  const isOfflineOrUnconfigured = isOfflineSession || !isOnline || !getSupabaseClient();

  const loadFactors = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || isOfflineSession || !isOnline) {
      return;
    }

    setLoadingFactors(true);
    setErrorMsg(null);
    try {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      const verifiedTotp = (data?.totp ?? []).filter((factor) => factor.status === 'verified');
      setFactors(verifiedTotp);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to check enrolled MFA factors.');
    } finally {
      setLoadingFactors(false);
    }
  }, [isOnline, isOfflineSession]);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  async function handleStartEnrollment() {
    const client = getSupabaseClient();
    if (!client || isOfflineSession || !isOnline) {
      setErrorMsg('Reconnect to the internet to enroll an authenticator app.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const existing = await client.auth.mfa.listFactors();
      const staleUnverified = (existing.data?.all ?? []).filter(
        (f) => f.factor_type === 'totp' && f.status === 'unverified',
      );
      for (const stale of staleUnverified) {
        await client.auth.mfa.unenroll({ factorId: stale.id }).catch(() => undefined);
      }

      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `TCTESDAConnect (${profile?.role ?? 'user'})`,
      });

      if (error || !data || data.type !== 'totp') {
        setErrorMsg(error?.message ?? 'Could not initialize TOTP enrollment.');
        return;
      }

      setPendingEnroll({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setVerificationCode('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'TOTP setup failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyEnrollment(event: React.FormEvent) {
    event.preventDefault();
    const client = getSupabaseClient();
    if (!client || !pendingEnroll) {
      return;
    }

    const sanitized = verificationCode.replace(/\s+/g, '');
    if (sanitized.length !== 6) {
      setErrorMsg('Enter the 6-digit code displayed in your authenticator app.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId: pendingEnroll.factorId,
        code: sanitized,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setPendingEnroll(null);
      setVerificationCode('');
      setStatusMsg('Two-Factor Authentication (TOTP MFA) is now active on your account.');
      await loadFactors();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'MFA verification failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelPending() {
    const client = getSupabaseClient();
    if (client && pendingEnroll) {
      await client.auth.mfa.unenroll({ factorId: pendingEnroll.factorId }).catch(() => undefined);
    }
    setPendingEnroll(null);
    setVerificationCode('');
    setErrorMsg(null);
  }

  async function handleUnenroll(factorId: string) {
    const client = getSupabaseClient();
    if (!client || isOfflineSession || !isOnline) {
      setErrorMsg('Online authentication is required to remove an MFA factor.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const { error } = await client.auth.mfa.unenroll({ factorId });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      setStatusMsg('Authenticator factor removed from your account.');
      await loadFactors();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to remove MFA factor.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
            Two-Factor Authentication (TOTP MFA)
          </CardTitle>
          <Badge variant={isPrivileged ? 'warning' : 'secondary'}>
            {isPrivileged ? 'Privileged Account Policy' : 'Optional Security'}
          </Badge>
        </div>
        <CardDescription>
          {isPrivileged
            ? 'System Admins, Institutional Admins, Registrars, and Focal Persons are strongly advised to protect sign-ins with a 6-digit authenticator app.'
            : 'Protect your TCTESDAConnect account with time-based one-time passwords (TOTP).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMsg && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {errorMsg}
          </div>
        )}
        {statusMsg && (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
            {statusMsg}
          </div>
        )}

        {isOfflineOrUnconfigured ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-medium">MFA setup unavailable in offline mode</p>
              <p className="mt-0.5 text-xs text-amber-800">
                Two-Factor Authentication enrollment and removal require an active online Supabase session. Your local offline workspace remains protected by device unlock credentials.
              </p>
            </div>
          </div>
        ) : loadingFactors ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-700" />
            Checking enrolled authenticator factors...
          </div>
        ) : (
          <>
            {factors.length > 0 && (
              <div className="space-y-2">
                {factors.map((factor) => (
                  <div
                    key={factor.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {factor.friendly_name || 'Authenticator App (TOTP)'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Verified factor · Added {new Date(factor.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={submitting}
                      onClick={() => void handleUnenroll(factor.id)}
                      className="text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {pendingEnroll ? (
              <form onSubmit={handleVerifyEnrollment} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <img
                    src={pendingEnroll.qrCode}
                    alt="Scan QR code with your TOTP authenticator app"
                    className="h-36 w-36 shrink-0 rounded-lg border border-slate-200 bg-white p-2"
                  />
                  <div className="space-y-2 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">1. Scan with Authenticator App</p>
                    <p className="text-xs text-slate-600">
                      Open Google Authenticator, Microsoft Authenticator, or Authy and scan the QR code, or enter this secret key manually:
                    </p>
                    <code className="block break-all rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 select-all">
                      {pendingEnroll.secret}
                    </code>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mfa-enroll-code">2. Enter 6-Digit Verification Code</Label>
                  <Input
                    id="mfa-enroll-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value)}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="secondary" disabled={submitting}>
                    {submitting ? 'Verifying...' : 'Verify & Activate MFA'}
                  </Button>
                  <Button type="button" variant="outline" disabled={submitting} onClick={() => void handleCancelPending()}>
                    Cancel Setup
                  </Button>
                </div>
              </form>
            ) : (
              factors.length === 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-slate-900">No authenticator app enrolled</p>
                    <p className="text-xs text-slate-600">
                      Add a TOTP app to require a 6-digit security code when authenticating.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submitting}
                    onClick={() => void handleStartEnrollment()}
                  >
                    <QrCode className="h-4 w-4" />
                    Enable Authenticator App
                  </Button>
                </div>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
