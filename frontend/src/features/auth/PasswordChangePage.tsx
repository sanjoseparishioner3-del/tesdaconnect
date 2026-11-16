import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { MfaEnrollmentCard } from './components/MfaEnrollmentCard';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isSupabaseConfigured } from '@/lib/env';
import { isPasswordUpdateRequired, resolveRoleDefaultRoute } from '@/lib/rbac';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_LABELS } from '@/types/auth';

const passwordSchema = z
  .object({
    newPassword: z
      .string()
      .min(12, 'Password must be at least 12 characters.')
      .regex(/[A-Z]/, 'Include at least one uppercase letter.')
      .regex(/[a-z]/, 'Include at least one lowercase letter.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export function PasswordChangePage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: PasswordForm) {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured || !profile) {
      toast.error('Supabase session is required to update credentials.');
      return;
    }

    const { error } = await client.auth.updateUser({ password: values.newPassword });
    if (error) {
      toast.error(error.message);
      return;
    }

    const rpcRes = (await client.rpc('complete_own_password_change')) as {
      data: string | null;
      error: { message: string } | null;
    };
    if (rpcRes.error) {
      toast.error(rpcRes.error.message);
      return;
    }

    const nextExpiry = rpcRes.data ?? new Date(Date.now() + 90 * 86_400_000).toISOString();

    setProfile({
      ...profile,
      forcePasswordChange: false,
      passwordExpiresAt: nextExpiry,
    });
    toast.success('Password updated cleanly.');
    void navigate(resolveRoleDefaultRoute(profile.role));
  }

  const mustRotate = isPasswordUpdateRequired(profile);

  return (
    <div className="mx-auto max-w-xl space-y-6 py-4">
      {profile && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5 text-teal-700" /> Account Profile &amp; Security Policy
              </CardTitle>
              <Badge variant={profile.accountStatus === 'active' ? 'success' : 'warning'}>{profile.accountStatus}</Badge>
            </div>
            <CardDescription>
              Authorization roles are enforced server-side by PostgreSQL RLS and cannot be self-modified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <p><span className="font-medium text-slate-500">Full Name:</span> {profile.fullName}</p>
            <p><span className="font-medium text-slate-500">Email:</span> {profile.email}</p>
            <p><span className="font-medium text-slate-500">Assigned Role:</span> {ROLE_LABELS[profile.role]}</p>
            <p>
              <span className="font-medium text-slate-500">Institutions:</span>{' '}
              {profile.institutions.length > 0 ? profile.institutions.map((i) => `${i.code} (${i.name})`).join(', ') : 'None assigned'}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-teal-700" />
            {mustRotate ? 'Password Update Required' : 'Account Password Security'}
          </CardTitle>
          <CardDescription>
            {mustRotate
              ? 'Temporary or expired passwords must be rotated before accessing institutional records.'
              : 'Update your credential using a 12+ character strong password meeting institutional security policy.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New Strong Password (12+ chars)</Label>
              <Input id="newPassword" type="password" {...form.register('newPassword')} />
              {form.formState.errors.newPassword && (
                <p className="text-xs text-red-600">{form.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input id="confirmPassword" type="password" {...form.register('confirmPassword')} />
              {form.formState.errors.confirmPassword && (
                <p className="text-xs text-red-600">{form.formState.errors.confirmPassword.message}</p>
              )}
            </div>
            <Button type="submit" variant="secondary" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Updating...' : 'Save New Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <MfaEnrollmentCard />
    </div>
  );
}
