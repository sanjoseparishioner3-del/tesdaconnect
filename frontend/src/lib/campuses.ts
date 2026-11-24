import type { SupabaseClient } from '@supabase/supabase-js';

export type CampusStatus = 'active' | 'upcoming';

export interface CampusRow {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  contact_email?: string | null;
  contact_number?: string | null;
  is_active?: boolean;
  operating_status?: CampusStatus | null;
  display_order?: number | null;
}

export const CAMPUS_STATUS_LABEL: Record<CampusStatus, string> = {
  active: 'Active now',
  upcoming: 'Opening next year',
};

/** Active campus first, then by display order, then by code. */
export function sortCampuses<T extends { code: string; operating_status?: CampusStatus | null; display_order?: number | null }>(list: T[]): T[] {
  const rank = (c: T) => (c.operating_status === 'upcoming' ? 1 : 0);
  return [...list].sort(
    (a, b) => rank(a) - rank(b) || (a.display_order ?? 100) - (b.display_order ?? 100) || a.code.localeCompare(b.code),
  );
}

/** The campus new registrations should default to: the active one (MIF today), never an upcoming one. */
export function defaultCampus<T extends { code: string; operating_status?: CampusStatus | null; display_order?: number | null }>(list: T[]): T | undefined {
  const sorted = sortCampuses(list);
  return sorted.find((c) => c.operating_status !== 'upcoming') ?? sorted[0];
}

/**
 * Loads campuses with their status. If the database does not have the status columns yet
 * (older schema), it falls back to the basic columns so nothing breaks.
 */
export async function loadCampuses(client: SupabaseClient): Promise<{ data: CampusRow[]; error: string | null }> {
  const full = await client
    .from('institutions')
    .select('id, code, name, address, contact_email, contact_number, is_active, operating_status, display_order')
    .returns<CampusRow[]>();
  if (!full.error) return { data: sortCampuses(full.data ?? []), error: null };

  const basic = await client
    .from('institutions')
    .select('id, code, name, address, contact_email, contact_number, is_active')
    .returns<CampusRow[]>();
  if (basic.error) return { data: [], error: basic.error.message };
  return { data: sortCampuses(basic.data ?? []), error: null };
}
