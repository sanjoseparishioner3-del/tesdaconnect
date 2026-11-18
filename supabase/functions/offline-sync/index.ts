// Supabase Edge Function: Idempotent Offline Sync Endpoint
// Enforces server authorization, mutation_id idempotency, and optimistic version conflict detection.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncMutationPayload {
  mutationId: string;
  entityType: 'trainee_intake' | 'trainee_profile' | 'announcement_draft' | 'announcement_read' | 'competency_progress';
  entityId: string;
  operation: 'upsert' | 'mark_read' | 'submit';
  baseVersion: number | null;
  payload: Record<string, unknown>;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user.id;
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, role, account_status')
      .eq('id', userId)
      .single();

    if (!profile || profile.account_status !== 'active') {
      return new Response(JSON.stringify({ error: 'Account inactive or pending approval' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mutation = (await req.json()) as SyncMutationPayload;
    if (!mutation.mutationId || !mutation.entityType) {
      return new Response(JSON.stringify({ error: 'mutationId and entityType are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Idempotency check against offline_sync_mutations
    const payloadHash = await sha256Hex(JSON.stringify(mutation.payload ?? {}));
    const { data: existing } = await adminClient
      .from('offline_sync_mutations')
      .select('id, payload_hash, result')
      .eq('user_id', userId)
      .eq('mutation_id', mutation.mutationId)
      .maybeSingle();

    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        return new Response(
          JSON.stringify({ status: 'failed', message: 'Mutation ID reused with different payload.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(existing.result ?? { status: 'synced', deduplicated: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Optimistic version check & execution using caller-scoped RLS client
    let resultPayload: Record<string, unknown> = { status: 'synced' };

    if (mutation.entityType === 'announcement_read') {
      const { error } = await callerClient.from('announcement_views').upsert(
        {
          announcement_id: mutation.entityId,
          user_id: userId,
          read_at: new Date().toISOString(),
        },
        { onConflict: 'announcement_id,user_id' },
      );
      if (error) {
        return new Response(JSON.stringify({ status: 'failed', message: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (mutation.entityType === 'trainee_profile') {
      const { data: currentRow, error: fetchErr } = await callerClient
        .from('learner_profiles')
        .select('*')
        .or(`id.eq.${mutation.entityId},user_id.eq.${mutation.entityId}`)
        .maybeSingle();

      if (fetchErr) {
        return new Response(
          JSON.stringify({ status: 'failed', retryable: false, message: fetchErr.message }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      if (!currentRow) {
        return new Response(
          JSON.stringify({
            status: 'failed',
            retryable: false,
            message: 'Learner profile not found or access denied by RLS.',
          }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      if (mutation.baseVersion !== null && currentRow.version !== mutation.baseVersion) {
        return new Response(
          JSON.stringify({
            status: 'conflict',
            message: 'Record updated on server after offline snapshot.',
            serverData: currentRow,
            serverModifiedAt: currentRow.updated_at,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (mutation.payload && 'uli_number' in mutation.payload) {
        if (!['system_administrator', 'institutional_administrator', 'registrar'].includes(profile.role)) {
          return new Response(
            JSON.stringify({
              status: 'failed',
              retryable: false,
              message: 'Only Admin or Registrar may modify ULI.',
            }),
            {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }

      const updateQuery = callerClient.from('learner_profiles').update(mutation.payload).eq('id', currentRow.id);
      const { data: updated, error: updateErr } = await (
        mutation.baseVersion !== null ? updateQuery.eq('version', mutation.baseVersion) : updateQuery
      )
        .select()
        .single();

      if (updateErr || !updated) {
        const isPermission = Boolean(updateErr?.code === '42501' || /permission|policy|rls/i.test(updateErr?.message ?? ''));
        return new Response(
          JSON.stringify({
            status: isPermission ? 'failed' : 'conflict',
            retryable: false,
            message: updateErr?.message ?? 'Concurrent update conflict detected.',
            serverData: currentRow ?? {},
            serverModifiedAt: currentRow?.updated_at ?? null,
          }),
          { status: isPermission ? 403 : 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      resultPayload = { status: 'synced', record: updated };
    } else if (mutation.entityType === 'competency_progress') {
      if (!['focal_person', 'institutional_administrator', 'system_administrator'].includes(profile.role)) {
        return new Response(
          JSON.stringify({
            status: 'failed',
            retryable: false,
            message: 'Only authorized Focal Person accounts may sync competency charts.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const payloadAppId =
        typeof mutation.payload.enrollment_application_id === 'string'
          ? mutation.payload.enrollment_application_id
          : null;
      const payloadTaskId =
        typeof mutation.payload.competency_task_id === 'string'
          ? mutation.payload.competency_task_id
          : null;

      let lookup = callerClient.from('competency_progress').select('*');
      if (payloadAppId && payloadTaskId) {
        lookup = lookup
          .eq('enrollment_application_id', payloadAppId)
          .eq('competency_task_id', payloadTaskId);
      } else {
        lookup = lookup.eq('id', mutation.entityId);
      }

      const { data: currentRow, error: fetchErr } = await lookup.maybeSingle();
      if (fetchErr) {
        return new Response(
          JSON.stringify({ status: 'failed', retryable: false, message: fetchErr.message }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (currentRow && mutation.baseVersion !== null && currentRow.version !== mutation.baseVersion) {
        return new Response(
          JSON.stringify({
            status: 'conflict',
            message: 'Competency progress record updated on server after offline snapshot.',
            serverData: currentRow,
            serverModifiedAt: currentRow.updated_at,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (currentRow) {
        const updateQuery = callerClient
          .from('competency_progress')
          .update({
            status: mutation.payload.status ?? currentRow.status,
            remarks: mutation.payload.remarks ?? currentRow.remarks,
            assessed_at: mutation.payload.assessed_at ?? new Date().toISOString(),
            assessed_by: userId,
          })
          .eq('id', currentRow.id);

        const { data: updated, error: updateErr } = await (
          mutation.baseVersion !== null ? updateQuery.eq('version', mutation.baseVersion) : updateQuery
        )
          .select()
          .single();

        if (updateErr || !updated) {
          const isPermission = Boolean(updateErr?.code === '42501' || /locked|finalized|permission|rls/i.test(updateErr?.message ?? ''));
          return new Response(
            JSON.stringify({
              status: isPermission ? 'failed' : 'conflict',
              retryable: false,
              message: updateErr?.message ?? 'Concurrent competency update detected.',
              serverData: currentRow,
              serverModifiedAt: currentRow.updated_at,
            }),
            { status: isPermission ? 403 : 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        resultPayload = { status: 'synced', record: updated };
      } else {
        if (!payloadAppId || !payloadTaskId) {
          return new Response(
            JSON.stringify({
              status: 'failed',
              retryable: false,
              message: 'enrollment_application_id and competency_task_id are required.',
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        const { data: upserted, error: upsertErr } = await callerClient
          .from('competency_progress')
          .upsert(
            {
              enrollment_application_id: payloadAppId,
              competency_task_id: payloadTaskId,
              status: mutation.payload.status ?? 'competent',
              remarks: mutation.payload.remarks ?? null,
              assessed_at: mutation.payload.assessed_at ?? new Date().toISOString(),
              assessed_by: userId,
            },
            { onConflict: 'enrollment_application_id,competency_task_id' },
          )
          .select()
          .single();

        if (upsertErr || !upserted) {
          const isPermission = Boolean(upsertErr?.code === '42501' || /locked|finalized|permission|rls/i.test(upsertErr?.message ?? ''));
          return new Response(
            JSON.stringify({
              status: 'failed',
              retryable: false,
              message: upsertErr?.message ?? 'Unable to save competency progress.',
            }),
            { status: isPermission ? 403 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        resultPayload = { status: 'synced', record: upserted };
      }
    } else if (mutation.entityType === 'trainee_intake') {
      // Idempotent trainee intake creation via stable client_draft_id (MIS 03-01 ver. 2021)
      const p = mutation.payload;
      let institutionId = typeof p.institution_id === 'string' ? p.institution_id : '';
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (institutionId && !uuidPattern.test(institutionId)) {
        const { data: inst } = await adminClient
          .from('institutions')
          .select('id')
          .eq('code', institutionId.toUpperCase())
          .maybeSingle();
        if (inst?.id) institutionId = inst.id;
      }

      if (!institutionId || !uuidPattern.test(institutionId)) {
        return new Response(JSON.stringify({ status: 'failed', message: 'Valid institution_id UUID required.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const staffCanTargetOther = ['system_administrator', 'institutional_administrator', 'registrar'].includes(profile.role);
      const learnerUserId =
        staffCanTargetOther && typeof p.target_learner_user_id === 'string' && uuidPattern.test(p.target_learner_user_id)
          ? p.target_learner_user_id
          : userId;

      if (staffCanTargetOther && learnerUserId === userId) {
        return new Response(JSON.stringify({ status: 'failed', message: 'Select a learner account before submitting intake.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: hasAccess, error: accessError } = await callerClient.rpc('has_institution_access', { target_institution_id: institutionId });
      if (accessError || !hasAccess) {
        return new Response(JSON.stringify({ status: 'failed', message: 'Institution access could not be verified.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const fullName = [p.first_name, p.middle_name, p.last_name, p.extension_name]
        .filter((x) => typeof x === 'string' && x.trim().length > 0)
        .join(' ')
        .trim() || 'Unnamed Trainee';

      let courseId = typeof p.course_id === 'string' && uuidPattern.test(p.course_id) ? p.course_id : null;
      if (!courseId && typeof p.course_id === 'string' && p.course_id.trim().length > 0) {
        const { data: courseRow } = await adminClient
          .from('courses')
          .select('id')
          .eq('institution_id', institutionId)
          .eq('code', p.course_id.trim().toUpperCase())
          .maybeSingle();
        if (courseRow?.id) courseId = courseRow.id;
      }

      const completeness = Math.max(0, Math.min(100, Number(p.record_completeness ?? 0)));

      // Editing registration must retain the enrollment's review/confirmation state.
      const { data: priorApplication, error: priorError } = await adminClient
        .from('enrollment_applications').select('learner_user_id, application_status')
        .eq('client_draft_id', mutation.entityId).maybeSingle();
      if (priorError) throw new Error(priorError.message);
      if (priorApplication && priorApplication.learner_user_id !== learnerUserId) {
        return new Response(JSON.stringify({ status: 'failed', message: 'Registration belongs to another learner.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const nextApplicationStatus = priorApplication &&
        !['draft', 'returned'].includes(priorApplication.application_status)
        ? priorApplication.application_status
        : mutation.operation === 'submit' ? 'submitted' : 'draft';

      // Never allow setting ULI during trainee intake; ULI is encoded strictly post-confirmation by Admin/Registrar
      const { error: profileError } = await adminClient.from('learner_profiles').upsert(
        {
          user_id: learnerUserId,
          institution_id: institutionId,
          entry_date: p.entry_date || null,
          id_picture_url: p.id_picture_url || null,
          last_name: String(p.last_name ?? 'Pending'),
          first_name: String(p.first_name ?? 'Pending'),
          middle_name: p.middle_name ?? null,
          extension_name: p.extension_name ?? null,
          address_line: p.address_line ?? null,
          barangay: p.barangay ?? null,
          district: p.district ?? null,
          city_municipality: p.city_municipality ?? null,
          province: p.province ?? null,
          region: p.region ?? null,
          email_or_facebook: p.email_or_facebook ?? null,
          contact_number: p.contact_number ?? null,
          nationality: p.nationality ?? null,
          sex: p.sex ?? null,
          civil_status: p.civil_status ?? null,
          employment_status: p.employment_status ?? null,
          employment_type: p.employment_type ?? null,
          birthdate: p.birthdate || null,
          birthplace_city: p.birthplace_city ?? null,
          birthplace_province: p.birthplace_province ?? null,
          birthplace_region: p.birthplace_region ?? null,
          educational_attainment: p.educational_attainment ?? null,
          guardian_name: p.guardian_name ?? null,
          guardian_address: p.guardian_address ?? null,
          classifications: Array.isArray(p.classifications) ? p.classifications : [],
          classification_other: p.classification_other ?? null,
          disability_types: Array.isArray(p.disability_types) ? p.disability_types : [],
          disability_other: p.disability_other ?? null,
          disability_cause: p.disability_cause ?? null,
          course_id: courseId,
          scholarship_package: p.scholarship_package ?? null,
          privacy_consent: Boolean(p.privacy_consent),
          applicant_signature_name: p.applicant_signature_name ?? null,
          date_accomplished: p.date_accomplished || null,
          noted_by_name: staffCanTargetOther ? (p.noted_by_name ?? null) : null,
          date_received: staffCanTargetOther ? (p.date_received || null) : null,
          submitted_at: mutation.operation === 'submit' ? new Date().toISOString() : null,
        },
        { onConflict: 'user_id' },
      );

      if (profileError) {
        return new Response(JSON.stringify({ status: 'failed', message: profileError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const referenceNo = `TC-${new Date().getUTCFullYear()}-${mutation.entityId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}`;

      const { error: upsertErr, data: upserted } = await adminClient
        .from('enrollment_applications')
        .upsert(
          {
            client_draft_id: mutation.entityId,
            reference_no: referenceNo,
            learner_user_id: learnerUserId,
            institution_id: institutionId,
            course_id: courseId,
            learner_name: fullName,
            email: typeof p.email_or_facebook === 'string' && p.email_or_facebook.includes('@')
              ? p.email_or_facebook
              : (authData.user.email ?? null),
            contact_number: typeof p.contact_number === 'string' ? p.contact_number : null,
            application_status: nextApplicationStatus,
            record_completeness: completeness,
            submitted_at: mutation.operation === 'submit' ? new Date().toISOString() : null,
          },
          { onConflict: 'client_draft_id' },
        )
        .select()
        .single();

      if (upsertErr) {
        return new Response(JSON.stringify({ status: 'failed', message: upsertErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: duplicates } = await callerClient.rpc('detect_duplicate_learner_candidates', {
        p_institution_id: institutionId,
        p_first_name: String(p.first_name ?? ''),
        p_last_name: String(p.last_name ?? ''),
        p_birthdate: p.birthdate || null,
        p_email: authData.user.email ?? null,
        p_exclude_user_id: learnerUserId,
      });

      resultPayload = { status: 'synced', record: upserted, duplicateWarnings: duplicates ?? [] };
    } else if (mutation.entityType === 'announcement_draft') {
      const p = mutation.payload;
      const canPublish = ['system_administrator', 'institutional_administrator', 'registrar'].includes(profile.role);
      if (!canPublish) {
        return new Response(JSON.stringify({ status: 'failed', message: 'Forbidden: only Admins or Registrars may author announcements.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const rawTargets = Array.isArray(p.target_roles)
        ? p.target_roles.filter((r): r is string => typeof r === 'string')
        : ['scholar', 'applicant', 'focal_person'];
      const filteredTargets =
        profile.role === 'registrar'
          ? rawTargets.filter((r) => ['scholar', 'applicant', 'focal_person'].includes(r))
          : rawTargets.filter((r) => ['scholar', 'applicant', 'focal_person', 'registrar'].includes(r));

      if (filteredTargets.length === 0) {
        return new Response(JSON.stringify({ status: 'failed', message: 'Forbidden target roles for your role.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const publishNow = canPublish && mutation.operation === 'submit' && p.is_draft !== true;

      const { data: upsertedAnn, error: annErr } = await callerClient
        .from('announcements')
        .upsert(
          {
            client_draft_id: mutation.entityId,
            author_user_id: userId,
            institution_id: p.institution_id ?? null,
            title: String(p.title ?? 'Untitled Draft'),
            body: String(p.body ?? ''),
            audience: profile.role === 'registrar' ? (filteredTargets.includes('scholar') ? 'scholar' : 'focal_person') : (p.audience ?? 'all'),
            target_roles: filteredTargets,
            announcement_type: typeof p.announcement_type === 'string' ? p.announcement_type : 'general',
            event_date: p.event_date ?? null,
            event_time: p.event_time ?? null,
            is_draft: !publishNow,
            published_at: publishNow ? new Date().toISOString() : null,
          },
          { onConflict: 'client_draft_id' },
        )
        .select()
        .single();

      if (annErr) {
        return new Response(JSON.stringify({ status: 'failed', message: annErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      resultPayload = { status: 'synced', record: upsertedAnn };
    }

    // 3. Record processed mutation key
    await adminClient.from('offline_sync_mutations').insert({
      user_id: userId,
      mutation_id: mutation.mutationId,
      entity_type: mutation.entityType,
      entity_id: mutation.entityId,
      operation: mutation.operation,
      payload_hash: payloadHash,
      result: resultPayload,
    });

    return new Response(JSON.stringify(resultPayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ status: 'failed', message: err instanceof Error ? err.message : 'Sync failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
