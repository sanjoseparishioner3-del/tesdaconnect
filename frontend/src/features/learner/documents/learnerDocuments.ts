import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { offlineDb, type DocumentUploadState } from '@/lib/db/dexie';
import { normalizeDocumentTypeKey, TESDA_REQUIRED_DOCUMENTS } from '@/lib/documents/requiredDocuments';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';

/** One learner document, merged from the server (authoritative) and this device. */
export interface LearnerDocumentFile {
  id: string;
  document_type: string;
  original_name: string;
  mime_type?: string;
  size_bytes?: number;
  /** Server review status: pending (submitted), approved, rejected. */
  status: string;
  remarks: string | null;
  storage_path: string | null;
  /** True while the file exists only on this device. */
  queuedUpload?: boolean;
  uploadState?: DocumentUploadState;
  uploadError?: string | null;
  localBlob?: Blob;
  createdAt?: string | null;
}

/** What a requirement row shows, from the newest file for that requirement. */
export type RequirementStatus =
  | 'missing'
  | 'saved_offline'
  | 'pending_sync'
  | 'uploading'
  | 'failed'
  | 'auth_required'
  | 'submitted'
  | 'verified'
  | 'returned';

export type RequirementFilter = 'all' | 'missing' | 'pending' | 'submitted' | 'verified';

/** Requirements that are always needed; the others apply only to some learners. */
export const OPTIONAL_REQUIREMENT_KEYS = new Set(['marriage_certificate', 'additional_documents']);

export function fileRequirementStatus(file: LearnerDocumentFile): RequirementStatus {
  if (file.queuedUpload) {
    switch (file.uploadState ?? 'pending') {
      case 'uploading':
        return 'uploading';
      case 'failed':
        return 'failed';
      case 'auth_required':
        return 'auth_required';
      case 'saved_offline':
        return 'saved_offline';
      default:
        return 'pending_sync';
    }
  }
  if (file.status === 'approved') return 'verified';
  if (file.status === 'rejected') return 'returned';
  return 'submitted';
}

export function matchesFilter(status: RequirementStatus, filter: RequirementFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'missing':
      return status === 'missing' || status === 'returned';
    case 'pending':
      return ['saved_offline', 'pending_sync', 'uploading', 'failed', 'auth_required'].includes(status);
    case 'submitted':
      return status === 'submitted';
    case 'verified':
      return status === 'verified';
  }
}

export interface RequirementRow {
  key: string;
  label: string;
  description: string;
  optional: boolean;
  files: LearnerDocumentFile[];
  status: RequirementStatus;
}

export function buildRequirementRows(files: LearnerDocumentFile[]): RequirementRow[] {
  return TESDA_REQUIRED_DOCUMENTS.map((spec) => {
    const matched = files
      .filter((f) => normalizeDocumentTypeKey(f.document_type) === spec.key)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return {
      key: spec.key,
      label: spec.label,
      description: spec.description,
      optional: OPTIONAL_REQUIREMENT_KEYS.has(spec.key),
      files: matched,
      status: matched[0] ? fileRequirementStatus(matched[0]) : 'missing',
    };
  });
}

/** Compliance counts only server-confirmed submissions for the always-required documents. */
export function computeCompliance(rows: RequirementRow[]) {
  const required = rows.filter((r) => !r.optional);
  const submitted = required.filter((r) => r.status === 'submitted' || r.status === 'verified').length;
  const verified = required.filter((r) => r.status === 'verified').length;
  const waiting = rows.filter((r) => matchesFilter(r.status, 'pending')).length;
  return { requiredTotal: required.length, submitted, verified, waiting, complete: submitted === required.length };
}

interface ServerDocRow {
  id: string;
  document_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  remarks: string | null;
  storage_path: string;
  created_at: string;
}

export const LEARNER_DOCUMENTS_QUERY_KEY = 'learner-own-documents';

/**
 * The learner's documents: server rows when online (cached to IndexedDB by the sync
 * engine for offline use) plus files still waiting on this device.
 */
export function useLearnerDocuments(userId: string | undefined, isOnline: boolean) {
  const serverQuery = useQuery<ServerDocRow[]>({
    queryKey: [LEARNER_DOCUMENTS_QUERY_KEY, userId],
    enabled: isSupabaseConfigured && isOnline && Boolean(userId),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !userId) return [];
      const { data, error } = await client
        .from('learner_documents')
        .select('id, document_type, original_name, mime_type, size_bytes, status, remarks, storage_path, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .returns<ServerDocRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const cached = useLiveQuery(
    () => (userId ? offlineDb.cachedDocuments.where('ownerUserId').equals(userId).toArray() : []),
    [userId],
    [],
  );

  const files = React.useMemo<LearnerDocumentFile[]>(() => {
    const cachedById = new Map(cached.map((c) => [c.id, c]));
    const fromCache = (c: (typeof cached)[number]): LearnerDocumentFile => ({
      id: c.id,
      document_type: c.documentType,
      original_name: c.originalName,
      mime_type: c.mimeType,
      size_bytes: c.sizeBytes,
      status: c.status,
      remarks: c.remarks,
      storage_path: c.storagePath,
      queuedUpload: c.queuedUpload,
      uploadState: c.queuedUpload ? c.uploadState : 'submitted',
      uploadError: c.uploadError ?? null,
      localBlob: c.blob,
      createdAt: c.createdAt ?? c.syncedAt,
    });

    if (!serverQuery.data) return cached.map(fromCache);

    const serverIds = new Set(serverQuery.data.map((d) => d.id));
    const fromServer: LearnerDocumentFile[] = serverQuery.data.map((d) => ({
      ...d,
      queuedUpload: false,
      uploadState: 'submitted',
      localBlob: cachedById.get(d.id)?.blob,
      createdAt: d.created_at,
    }));
    const localOnly = cached.filter((c) => c.queuedUpload && !serverIds.has(c.id)).map(fromCache);
    return [...localOnly, ...fromServer];
  }, [cached, serverQuery.data]);

  const rows = React.useMemo(() => buildRequirementRows(files), [files]);
  const compliance = React.useMemo(() => computeCompliance(rows), [rows]);

  return { files, rows, compliance, isLoading: isOnline && serverQuery.isLoading && cached.length === 0, refetch: serverQuery.refetch };
}
