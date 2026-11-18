// Supabase Edge Function: Admin User & Role Management
// Enforces system_administrator / institutional_administrator boundaries server-side.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdminActionPayload {
  action: 'update_role_or_status' | 'create_staff_user';
  targetUserId?: string;
  role?: string;
  accountStatus?: 'active' | 'inactive' | 'pending_approval';
  email?: string;
  fullName?: string;
  institutionIds?: string[];
  forcePasswordChange?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    // New API keys: set APP_PUBLISHABLE_KEY (sb_publishable_...) and APP_SECRET_KEY (sb_secret_...)
    // as Edge Function secrets. They take priority so the functions keep working after the
    // legacy anon / service_role keys are disabled. The legacy variables remain a fallback.
    const anonKey = Deno.env.get('APP_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('APP_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('id, role, account_status')
      .eq('id', userData.user.id)
      .single();

    if (!callerProfile || callerProfile.account_status !== 'active') {
      return new Response(JSON.stringify({ error: 'Caller account is not active' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isSysAdmin = callerProfile.role === 'system_administrator';
    const isInstAdmin = callerProfile.role === 'institutional_administrator';
    if (!isSysAdmin && !isInstAdmin) {
      return new Response(JSON.stringify({ error: 'Insufficient role for user management' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as AdminActionPayload;

    if (body.action === 'update_role_or_status') {
      if (!body.targetUserId) {
        return new Response(JSON.stringify({ error: 'targetUserId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Hard rule: never allow any user to modify their own role or deactivate themselves
      if (body.targetUserId === callerProfile.id && (body.role || body.accountStatus)) {
        return new Response(JSON.stringify({ error: 'Users cannot modify their own authorization role or status.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (isInstAdmin && body.role === 'system_administrator') {
        return new Response(JSON.stringify({ error: 'Institutional Administrators cannot grant system_administrator role.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const updateFields: Record<string, unknown> = {};
      if (body.role) updateFields.role = body.role;
      if (body.accountStatus) updateFields.account_status = body.accountStatus;
      if (typeof body.forcePasswordChange === 'boolean') {
        updateFields.force_password_change = body.forcePasswordChange;
      }

      const { data: updated, error: updateErr } = await adminClient
        .from('profiles')
        .update(updateFields)
        .eq('id', body.targetUserId)
        .select()
        .single();

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (body.accountStatus === 'inactive') {
        await adminClient.auth.admin.updateUserById(body.targetUserId, { ban_duration: '876000h' });
      } else if (body.accountStatus === 'active') {
        await adminClient.auth.admin.updateUserById(body.targetUserId, { ban_duration: 'none' });
      }

      await adminClient.from('security_audit_logs').insert({
        actor_user_id: callerProfile.id,
        event: 'admin_account_updated',
        description: `Updated user ${body.targetUserId} authorization attributes.`,
        metadata: { target_user_id: body.targetUserId, changes: updateFields },
      });

      return new Response(JSON.stringify({ profile: updated }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unsupported action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
