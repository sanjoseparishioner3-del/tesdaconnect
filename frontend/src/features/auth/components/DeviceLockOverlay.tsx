import React from 'react';
import { AlertTriangle, KeyRound, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { purgeOfflineUserData } from '@/lib/db/dexie';
import { verifySessionLockPassword } from '@/lib/offline/offlineAuth';
import { getSupabaseClient } from '@/lib/supabase';
import { triggerForegroundSync } from '@/lib/sync/supabaseTransport';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { useDeviceLockStore } from '@/stores/deviceLockStore';
import { ROLE_LABELS } from '@/types/auth';

export function DeviceLockOverlay() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { pendingCount } = useConnectivityStore();
  const { isLocked, lockedReason, unlockDevice } = useDeviceLockStore();

  const [password, setPassword] = React.useState('');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [unlocking, setUnlocking] = React.useState(false);
  const [confirmWipe, setConfirmWipe] = React.useState(false);

  React.useEffect(() => {
    if (!isLocked) {
      setPassword('');
      setErrorMsg(null);
      setConfirmWipe(false);
    }
  }, [isLocked]);

  if (!isLocked || !profile) {
    return null;
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setErrorMsg(null);
    if (!password) {
      setErrorMsg('Enter your institutional password to resume your session.');
      return;
    }

    setUnlocking(true);
    try {
      const check = await verifySessionLockPassword(profile.email, password);
      if (check.ok) {
        unlockDevice();
        toast.success('Device session unlocked.');
        void triggerForegroundSync(profile.id);
        return;
      }

      // If no offline vault was cached yet or expired, allow live online Supabase re-verify
      const client = getSupabaseClient();
      if (client && navigator.onLine) {
        const { data, error } = await client.auth.signInWithPassword({
          email: profile.email,
          password,
        });
        if (!error && data.user?.id === profile.id) {
          unlockDevice();
          toast.success('Verified online credentials and unlocked session.');
          void triggerForegroundSync(profile.id);
          return;
        }
      }

      setErrorMsg(check.reason ?? 'Incorrect password or expired offline window.');
    } finally {
      setUnlocking(false);
    }
  }

  async function handleSignOutAndWipe() {
    if (!profile) return;
    if (pendingCount > 0 && !confirmWipe) {
      setConfirmWipe(true);
      return;
    }
    const client = getSupabaseClient();
    if (client && navigator.onLine) {
      await client.auth.signOut().catch(() => undefined);
    }
    await purgeOfflineUserData(undefined, profile.id).catch(() => undefined);
    unlockDevice();
    clearAuth();
    toast.success('Signed out and wiped cached records for this account.');
    void navigate('/login');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-lock-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-md"
    >
      <Card className="w-full max-w-md border-emerald-200 shadow-2xl">
        <CardHeader className="space-y-2 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <CardTitle id="device-lock-title" className="text-lg text-slate-900">
                Session Locked — Shared PC Protection
              </CardTitle>
              <CardDescription className="text-xs">
                {lockedReason ?? 'Re-enter your password to access cached training operations.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
            <p className="font-semibold text-slate-900">{profile.fullName}</p>
            <p className="text-slate-600">
              {ROLE_LABELS[profile.role]} • {profile.email}
            </p>
            {pendingCount > 0 && (
              <p className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                <ShieldCheck className="h-3.5 w-3.5" />
                {pendingCount} pending offline change(s) safely preserved in encrypted device queue
              </p>
            )}
          </div>

          <form onSubmit={(e) => void handleUnlock(e)} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lock_screen_password">Password</Label>
              <Input
                id="lock_screen_password"
                type="password"
                autoComplete="current-password"
                autoFocus
                placeholder="Enter password to unlock..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {errorMsg && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {errorMsg}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={unlocking}>
              <KeyRound className="h-4 w-4" />
              {unlocking ? 'Verifying...' : 'Unlock Session'}
            </Button>
          </form>

          {confirmWipe && pendingCount > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <p className="flex items-start gap-1.5 font-semibold">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {pendingCount} unsynced change(s) will be discarded if you wipe now!
              </p>
              <p className="mt-1">
                Reconnect and sync first, or click Sign Out &amp; Wipe again to proceed on a shared terminal.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-[11px] text-slate-500">Not {profile.fullName.split(' ')[0]}?</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void handleSignOutAndWipe()}>
              <LogOut className="h-3.5 w-3.5" />
              {confirmWipe ? 'Confirm Sign Out & Wipe' : 'Switch Account / Wipe Device'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
