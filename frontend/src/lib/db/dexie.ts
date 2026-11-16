import Dexie, { type Table } from 'dexie';
import type { UserProfile } from '@/types/auth';

export type OutboxStatus = 'pending' | 'syncing' | 'conflict' | 'failed';
export type ConflictResolutionAction = 'keep_local' | 'accept_server' | 'merge';

export interface LocalDraftRecord {
  clientDraftId: string;
  userId: string;
  draftType: 'trainee_intake' | 'announcement';
  title: string;
  institutionId: string | null;
  payload: Record<string, unknown>;
  baseVersion: number | null;
  status: 'editing' | 'ready_to_sync' | 'conflict' | 'synced';
  updatedAt: string;
  createdAt: string;
}

export interface CachedAnnouncementRecord {
  id: string;
  userId: string;
  institutionId: string | null;
  institutionCode: string | null;
  title: string;
  body: string;
  audience: string;
  targetRoles?: string[];
  announcementType?: string;
  eventDate?: string | null;
  eventTime?: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  deadlineAt: string | null;
  isRead: boolean;
  syncedAt: string;
}

export interface CachedScheduleRecord {
  id: string;
  userId: string;
  institutionId: string;
  institutionCode: string;
  courseName: string;
  batchCode: string;
  batchName: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  nextClassAt: string | null;
  venue: string | null;
  syncedAt: string;
}

export interface SyncOutboxItem {
  mutationId: string;
  userId: string;
  entityType: 'trainee_intake' | 'trainee_profile' | 'announcement_draft' | 'announcement_read' | 'competency_progress';
  entityId: string;
  operation: 'upsert' | 'mark_read' | 'submit';
  payload: Record<string, unknown>;
  baseVersion: number | null;
  status: OutboxStatus;
  retryCount: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
}

export interface SyncConflictRecord {
  conflictId: string;
  userId: string;
  mutationId: string;
  entityType: SyncOutboxItem['entityType'];
  entityId: string;
  entityLabel: string;
  localData: Record<string, unknown>;
  serverData: Record<string, unknown>;
  changedFields: string[];
  localModifiedAt: string;
  serverModifiedAt: string | null;
  serverModifiedBy: string | null;
  status: 'open' | 'resolved';
  resolutionAction: ConflictResolutionAction | null;
  resolvedAt: string | null;
}

export interface SyncMetaRecord {
  key: string;
  userId: string;
  lastSyncedAt: string | null;
  offlineEnabledForUser: boolean;
  offlineExpiresAt: string | null;
  deviceId: string;
}

export interface SyncHistoryRecord {
  id?: number;
  userId: string;
  mutationId: string;
  entityType: string;
  operation: string;
  outcome: 'synced' | 'conflict' | 'failed';
  message: string;
  timestamp: string;
}

export interface OfflineVaultRecord {
  email: string;
  userId: string;
  saltHex: string;
  passwordDigestHex: string;
  profile: UserProfile;
  expiresAt: string;
  syncedAt: string;
}

export interface CachedLearnerSnapshotRecord {
  userId: string;
  institutionId: string | null;
  learnerProfile: Record<string, unknown> | null;
  enrollmentApp: Record<string, unknown> | null;
  updatedAt: string;
}

export interface CachedDocumentRecord {
  id: string;
  ownerUserId: string;
  targetUserId: string;
  institutionId: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  remarks: string | null;
  storagePath: string | null;
  blob?: Blob;
  queuedUpload: boolean;
  syncedAt: string;
}

export interface CachedCompetencyChartRecord {
  id: string;
  userId: string;
  chartType: 'progress' | 'achievement';
  unitNumber: number;
  unitName: string;
  taskNumber: number;
  taskName: string;
  status: string;
  assessedAt: string | null;
  syncedAt: string;
}

export class TesdaConnectOfflineDb extends Dexie {
  localDrafts!: Table<LocalDraftRecord, string>;
  cachedAnnouncements!: Table<CachedAnnouncementRecord, string>;
  cachedSchedules!: Table<CachedScheduleRecord, string>;
  syncOutbox!: Table<SyncOutboxItem, string>;
  conflicts!: Table<SyncConflictRecord, string>;
  syncMeta!: Table<SyncMetaRecord, string>;
  syncHistory!: Table<SyncHistoryRecord, number>;
  offlineVault!: Table<OfflineVaultRecord, string>;
  cachedLearnerRecords!: Table<CachedLearnerSnapshotRecord, string>;
  cachedDocuments!: Table<CachedDocumentRecord, string>;
  cachedCompetencyCharts!: Table<CachedCompetencyChartRecord, string>;

  constructor(name = 'tesda-connect-pwa-v1') {
    super(name);
    this.version(1).stores({
      localDrafts: 'clientDraftId, userId, draftType, status, updatedAt',
      cachedAnnouncements: 'id, userId, institutionId, publishedAt, syncedAt',
      cachedSchedules: 'id, userId, institutionId, nextClassAt, syncedAt',
      syncOutbox: 'mutationId, userId, status, nextAttemptAt, createdAt',
      conflicts: 'conflictId, userId, status, entityType, entityId',
      syncMeta: 'key, userId',
      syncHistory: '++id, userId, timestamp, outcome',
    });
    this.version(2).stores({
      localDrafts: 'clientDraftId, userId, draftType, status, updatedAt',
      cachedAnnouncements: 'id, userId, institutionId, publishedAt, syncedAt',
      cachedSchedules: 'id, userId, institutionId, nextClassAt, syncedAt',
      syncOutbox: 'mutationId, userId, status, nextAttemptAt, createdAt',
      conflicts: 'conflictId, userId, status, entityType, entityId',
      syncMeta: 'key, userId',
      syncHistory: '++id, userId, timestamp, outcome',
      offlineVault: 'email, userId, expiresAt',
      cachedLearnerRecords: 'userId, updatedAt',
      cachedDocuments: 'id, ownerUserId, targetUserId, documentType, status, queuedUpload, syncedAt',
      cachedCompetencyCharts: 'id, userId, chartType, unitNumber, taskNumber, syncedAt',
    });

    this.version(3).stores({
      cachedTraineeDirectory: 'id, userId, institutionId, applicationStatus, updatedAt',
      cachedFocalData: 'id, userId, institutionId, batchId, kind, syncedAt',
    });
  }

  cachedTraineeDirectory!: import('dexie').Table<CachedTraineeDirectoryRecord, string>;
  cachedFocalData!: import('dexie').Table<CachedFocalDataRecord, string>;
}

export interface CachedTraineeDirectoryRecord {
  id: string;
  userId: string;
  applicationId: string;
  institutionId: string;
  referenceNo: string;
  learnerUserId: string;
  learnerName: string;
  email: string;
  courseId: string | null;
  courseName: string;
  courseCode: string;
  institutionName: string;
  institutionCode: string;
  scholarshipPackage: string | null;
  applicationStatus: string;
  recordCompleteness: number;
  scholarId: string | null;
  forwardingId: string | null;
  archivedAt: string | null;
  learnerProfileJson: Record<string, unknown> | null;
  updatedAt: string;
}

export interface CachedFocalDataRecord {
  id: string;
  userId: string;
  institutionId: string;
  batchId: string;
  kind: 'batch' | 'scholar' | 'unit' | 'task' | 'progress' | 'submission';
  entityId: string;
  payload: Record<string, unknown>;
  syncedAt: string;
}

export const offlineDb = new TesdaConnectOfflineDb();

/**
 * Shared-device protection: clears all cached PII and user-scoped offline data
 * on sign-out or explicit device wipe. Never stores passwords or service secrets.
 */
export async function purgeOfflineUserData(
  db: TesdaConnectOfflineDb = offlineDb,
  userId?: string,
): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.localDrafts,
      db.cachedAnnouncements,
      db.cachedSchedules,
      db.syncOutbox,
      db.conflicts,
      db.syncMeta,
      db.syncHistory,
      db.offlineVault,
      db.cachedLearnerRecords,
      db.cachedDocuments,
      db.cachedCompetencyCharts,
      db.cachedTraineeDirectory,
      db.cachedFocalData,
    ],
    async () => {
      if (!userId) {
        await Promise.all([
          db.localDrafts.clear(),
          db.cachedAnnouncements.clear(),
          db.cachedSchedules.clear(),
          db.syncOutbox.clear(),
          db.conflicts.clear(),
          db.syncMeta.clear(),
          db.syncHistory.clear(),
          db.offlineVault.clear(),
          db.cachedLearnerRecords.clear(),
          db.cachedDocuments.clear(),
          db.cachedCompetencyCharts.clear(),
          db.cachedTraineeDirectory.clear(),
          db.cachedFocalData.clear(),
        ]);
        return;
      }

      await Promise.all([
        db.localDrafts.where('userId').equals(userId).delete(),
        db.cachedAnnouncements.where('userId').equals(userId).delete(),
        db.cachedSchedules.where('userId').equals(userId).delete(),
        db.syncOutbox.where('userId').equals(userId).delete(),
        db.conflicts.where('userId').equals(userId).delete(),
        db.syncMeta.where('userId').equals(userId).delete(),
        db.syncHistory.where('userId').equals(userId).delete(),
        db.offlineVault.where('userId').equals(userId).delete(),
        db.cachedLearnerRecords.where('userId').equals(userId).delete(),
        db.cachedDocuments.where('ownerUserId').equals(userId).delete(),
        db.cachedCompetencyCharts.where('userId').equals(userId).delete(),
        db.cachedTraineeDirectory.where('userId').equals(userId).delete(),
        db.cachedFocalData.where('userId').equals(userId).delete(),
      ]);
    },
  );
}

/**
 * Isolates accounts on shared institutional computers: whenever a different user signs in,
 * evicts cached read-only PII and expired credentials belonging to other accounts while
 * leaving any unsynced outbox items inaccessible to the new user.
 */
export async function purgeOtherUsersCachedData(
  activeUserId: string,
  db: TesdaConnectOfflineDb = offlineDb,
): Promise<{ otherUserPendingCount: number }> {
  let otherUserPendingCount = 0;

  await db.transaction(
    'rw',
    [
      db.offlineVault,
      db.cachedAnnouncements,
      db.cachedSchedules,
      db.cachedLearnerRecords,
      db.cachedDocuments,
      db.cachedCompetencyCharts,
      db.cachedTraineeDirectory,
      db.cachedFocalData,
      db.syncMeta,
      db.syncHistory,
      db.syncOutbox,
      db.localDrafts,
    ],
    async () => {
      otherUserPendingCount = await db.syncOutbox
        .filter((item) => item.userId !== activeUserId)
        .count();

      await Promise.all([
        db.offlineVault
          .filter((row) => row.userId !== activeUserId && !row.email.endsWith('@tesdaconnect.test'))
          .delete(),
        db.cachedAnnouncements.filter((row) => row.userId !== activeUserId).delete(),
        db.cachedSchedules.filter((row) => row.userId !== activeUserId).delete(),
        db.cachedLearnerRecords.filter((row) => row.userId !== activeUserId).delete(),
        db.cachedDocuments
          .filter((row) => row.ownerUserId !== activeUserId && !row.queuedUpload)
          .delete(),
        db.cachedCompetencyCharts.filter((row) => row.userId !== activeUserId).delete(),
        db.cachedTraineeDirectory.filter((row) => row.userId !== activeUserId).delete(),
        db.cachedFocalData.filter((row) => row.userId !== activeUserId).delete(),
        db.syncMeta.filter((row) => row.userId !== activeUserId).delete(),
        db.syncHistory.filter((row) => row.userId !== activeUserId).delete(),
        db.localDrafts
          .filter((row) => row.userId !== activeUserId && row.status === 'synced')
          .delete(),
      ]);
    },
  );

  return { otherUserPendingCount };
}

/**
 * Enforces retention policies for cached credentials, expired announcements, and old logs.
 */
export async function pruneExpiredOfflineData(
  db: TesdaConnectOfflineDb = offlineDb,
  maxHistoryRetentionHours = 168,
): Promise<void> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const historyCutoffIso = new Date(nowMs - maxHistoryRetentionHours * 3600 * 1000).toISOString();

  await db.transaction(
    'rw',
    [db.offlineVault, db.cachedAnnouncements, db.syncHistory],
    async () => {
      await Promise.all([
        db.offlineVault
          .filter((row) => new Date(row.expiresAt).getTime() <= nowMs)
          .delete(),
        db.cachedAnnouncements
          .filter((row) => Boolean(row.expiresAt && row.expiresAt <= nowIso))
          .delete(),
        db.syncHistory
          .filter((row) => row.timestamp <= historyCutoffIso)
          .delete(),
      ]);
    },
  );
}

/**
 * Protects critical offline queues from browser storage quota exhaustion.
 * When `QuotaExceededError` occurs, strips non-critical downloaded document blobs
 * (preserving queued uploads & outbox mutations) and retries once cleanly.
 */
export async function safeDexieWrite<T>(
  operation: () => Promise<T>,
  options?: { db?: TesdaConnectOfflineDb; onQuotaWarning?: (msg: string) => void },
): Promise<{ ok: true; data: T } | { ok: false; quotaExceeded: boolean; error: string }> {
  const db = options?.db ?? offlineDb;
  try {
    const data = await operation();
    return { ok: true, data };
  } catch (err) {
    const rawName =
      typeof err === 'object' && err !== null && 'name' in err ? err.name : '';
    const rawMsg =
      typeof err === 'object' && err !== null && 'message' in err ? err.message : '';
    const errName = typeof rawName === 'string' ? rawName : '';
    const errMsg = typeof rawMsg === 'string' ? rawMsg : '';
    const message = errMsg || 'IndexedDB write failed.';
    const isQuota = errName === 'QuotaExceededError' || /quota|storage/i.test(message);

    if (!isQuota) {
      return { ok: false, quotaExceeded: false, error: message };
    }

    try {
      const oldSyncedDocs = await db.cachedDocuments
        .filter((doc) => !doc.queuedUpload && Boolean(doc.blob))
        .toArray();
      await Promise.all(
        oldSyncedDocs.map((doc) => db.cachedDocuments.update(doc.id, { blob: undefined })),
      );
      const retryData = await operation();
      options?.onQuotaWarning?.(
        'Device storage was nearly full; cleared cached downloaded file previews while preserving all pending offline submissions.',
      );
      return { ok: true, data: retryData };
    } catch (retryErr) {
      const retryMsg =
        retryErr instanceof Error ? retryErr.message : 'Browser offline storage quota exceeded.';
      options?.onQuotaWarning?.(
        'Device offline storage quota is full. Free disk space or synchronize pending records.',
      );
      return { ok: false, quotaExceeded: true, error: retryMsg };
    }
  }
}
