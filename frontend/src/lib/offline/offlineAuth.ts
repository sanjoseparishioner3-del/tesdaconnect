import { LEGACY_DEMO_EMAIL_DOMAIN, offlineDb, type OfflineVaultRecord } from '@/lib/db/dexie';
import { offlineExpiryIsoForRole, offlineTtlHoursForRole } from '@/lib/offline/offlinePolicy';
import type { InstitutionAssignment, UserProfile } from '@/types/auth';

const BST_INSTITUTION: InstitutionAssignment = {
  institutionId: '36bbf5ad-fb78-4b41-b01e-5845327e44cb',
  code: 'BST',
  name: 'Balli School of Technology',
  isPrimary: true,
};

const MIF_INSTITUTION: InstitutionAssignment = {
  institutionId: 'ec8f8edf-51f7-4d99-91b1-b09a6237f536',
  code: 'MIF',
  name: 'Mamburao Integrated Farm',
  isPrimary: false,
};

const LIVE_DEFAULT_PASSWORD = 'Password123!';

/**
 * Verified live accounts seeded in Supabase so any phone/laptop that has already loaded
 * the PWA can also sign in offline even before completing an online session for each role.
 */
const PREVERIFIED_LIVE_PROFILES: Record<string, UserProfile> = {
  'admin@tesdaconnect.ph': {
    id: '6ecc6d97-df24-4a7e-af50-2e0536fa9746',
    email: 'admin@tesdaconnect.ph',
    fullName: 'System Administrator',
    username: 'admin_sys',
    role: 'system_administrator',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION, MIF_INSTITUTION],
  },
  'registrar@tesdaconnect.ph': {
    id: '88820095-945b-4295-9ada-b1c4b54fd2ba',
    email: 'registrar@tesdaconnect.ph',
    fullName: 'Rina Santos',
    username: 'registrar_rina',
    role: 'registrar',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION, MIF_INSTITUTION],
  },
  'focal@tesdaconnect.ph': {
    id: 'f5addbc0-4919-4033-bd98-412abd9d9c4d',
    email: 'focal@tesdaconnect.ph',
    fullName: 'Marvin Cruz',
    username: 'focal_marvin',
    role: 'focal_person',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION, MIF_INSTITUTION],
  },
  'scholar@tesdaconnect.ph': {
    id: 'b957220f-afc5-4662-8ca5-3c26d51d3c2e',
    email: 'scholar@tesdaconnect.ph',
    fullName: 'Juan Dela Cruz',
    username: 'scholar_juan',
    role: 'scholar',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION],
  },
  'demo.sysadmin@tesda-connect.local': {
    id: '7128a5c0-892b-497c-9753-a501d49991ba',
    email: 'demo.sysadmin@tesda-connect.local',
    fullName: 'Roberto Mendoza',
    username: 'sysadmin_roberto',
    role: 'system_administrator',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION, MIF_INSTITUTION],
  },
  'demo.instadmin@tesda-connect.local': {
    id: '963a8eca-16bf-4f81-abc6-5fb8989691fe',
    email: 'demo.instadmin@tesda-connect.local',
    fullName: 'Elena Reyes',
    username: 'instadmin_elena',
    role: 'institutional_administrator',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION],
  },
  'demo.registrar@tesda-connect.local': {
    id: '47ef20d5-33fa-4e48-b6bd-2c9d2b8f50a4',
    email: 'demo.registrar@tesda-connect.local',
    fullName: 'Lorna Villanueva',
    username: 'registrar_lorna',
    role: 'registrar',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION],
  },
  'demo.focal@tesda-connect.local': {
    id: 'ce34afa1-16cd-42bb-bb97-283237cb3917',
    email: 'demo.focal@tesda-connect.local',
    fullName: 'Carlo Aquino',
    username: 'focal_carlo',
    role: 'focal_person',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION],
  },
  'demo.trainer@tesda-connect.local': {
    id: 'bc957b46-ba40-4e3d-a597-2dcaa0a3e0f6',
    email: 'demo.trainer@tesda-connect.local',
    fullName: 'Ramon Bautista',
    username: 'trainer_ramon',
    role: 'trainer',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION],
  },
  'demo.applicant@tesda-connect.local': {
    id: '7ef3553b-27b5-4c93-8579-098353a8c2d3',
    email: 'demo.applicant@tesda-connect.local',
    fullName: 'Maria Clara Santos',
    username: 'applicant_maria',
    role: 'applicant',
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: true,
    lastLoginAt: null,
    institutions: [BST_INSTITUTION],
  },
};

const revokedOfflineEmails = new Set<string>();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function deriveDigestHex(password: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return toHex(new Uint8Array(derived));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function seedBaselineOfflineCachesForUser(profile: UserProfile): Promise<void> {
  const nowIso = new Date().toISOString();
  const userId = profile.id;
  const instIds = new Set(profile.institutions.map((i) => i.institutionId));

  try {
    const coursesCount = await offlineDb.cachedCourses.where('userId').equals(userId).count();
    if (coursesCount === 0) {
      const catalog = [
        {
          id: 'de56e9c4-1b60-4f1d-9aa3-df731c079129',
          userId,
          institutionId: BST_INSTITUTION.institutionId,
          code: 'SMAW-NCII',
          name: 'Shielded Metal Arc Welding (SMAW NC II)',
          qualificationLevel: 'NC II',
          trainingHours: 268,
          isActive: true,
          archivedAt: null,
          syncedAt: nowIso,
        },
        {
          id: '9d9b3104-7f7f-4344-aa36-34b3e237c212',
          userId,
          institutionId: MIF_INSTITUTION.institutionId,
          code: 'OAP-NCII',
          name: 'Organic Agriculture Production NC II',
          qualificationLevel: 'NC II',
          trainingHours: 232,
          isActive: true,
          archivedAt: null,
          syncedAt: nowIso,
        },
      ].filter((c) => instIds.size === 0 || instIds.has(c.institutionId));

      if (catalog.length > 0) {
        await offlineDb.cachedCourses.bulkPut(catalog);
      }
    }

    const annCount = await offlineDb.cachedAnnouncements.where('userId').equals(userId).count();
    if (annCount === 0) {
      await offlineDb.cachedAnnouncements.put({
        id: `${userId}:46987690-57fb-4dea-95b7-5885afaae928`,
        userId,
        institutionId: BST_INSTITUTION.institutionId,
        institutionCode: 'BST',
        title: 'TESDA Provincial Assessment & Orientation Schedule',
        body: 'All confirmed SMAW NC II and OAP NC II scholars are advised to review their training batch schedules and complete all 8 documentary requirements.',
        audience: 'all',
        targetRoles: ['scholar', 'applicant', 'focal_person', 'registrar'],
        announcementType: 'general',
        eventDate: null,
        eventTime: null,
        publishedAt: nowIso,
        expiresAt: null,
        deadlineAt: null,
        isRead: false,
        syncedAt: nowIso,
      });
    }

    const schedCount = await offlineDb.cachedSchedules.where('userId').equals(userId).count();
    if (schedCount === 0) {
      await offlineDb.cachedSchedules.bulkPut([
        {
          id: `${userId}:abef62b1-03c9-4fbd-b2ce-ea7921b54dd8`,
          userId,
          institutionId: BST_INSTITUTION.institutionId,
          institutionCode: 'BST',
          courseName: 'Shielded Metal Arc Welding (SMAW NC II)',
          batchCode: 'SMAW-B2026-01',
          batchName: 'SMAW NC II Batch 2026-A (Weekdays)',
          status: 'in_training',
          startsAt: '2026-11-01',
          endsAt: '2026-12-15',
          nextClassAt: '2026-11-18T08:00:00Z',
          venue: 'BST Practical Welding Workshop Lab 1',
          syncedAt: nowIso,
        },
        {
          id: `${userId}:a6dc23dd-78c3-48d4-a3f9-0cd28087c18b`,
          userId,
          institutionId: BST_INSTITUTION.institutionId,
          institutionCode: 'BST',
          courseName: 'Shielded Metal Arc Welding (SMAW NC II)',
          batchCode: 'DEMO-SMAW-B1',
          batchName: 'SMAW NC II Batch 2026-B',
          status: 'in_training',
          startsAt: '2026-11-01',
          endsAt: '2026-12-30',
          nextClassAt: '2026-11-19T08:00:00Z',
          venue: 'BST Welding Shop',
          syncedAt: nowIso,
        },
      ]);
    }

    if (profile.email.toLowerCase() === 'scholar@tesdaconnect.ph') {
      const existingSnap = await offlineDb.cachedLearnerRecords.get(userId);
      if (!existingSnap) {
        await offlineDb.cachedLearnerRecords.put({
          userId,
          institutionId: BST_INSTITUTION.institutionId,
          learnerProfile: {
            user_id: userId,
            institution_id: BST_INSTITUTION.institutionId,
            first_name: 'Juan',
            last_name: 'Dela Cruz',
            middle_name: 'Santos',
            birthdate: '2002-05-14',
            sex: 'male',
            civil_status: 'single',
            contact_number: '0917 123 4567',
            address_line: 'Purok Mangga',
            barangay: 'Brgy. Tangalan',
            city_municipality: 'Mamburao',
            province: 'Occidental Mindoro',
            region: 'MIMAROPA (Region IV-B)',
            educational_attainment: 'High School Graduate',
            employment_status: 'Unemployed',
            uli_number: 'ULI-2026-0458-BST',
            course_id: 'de56e9c4-1b60-4f1d-9aa3-df731c079129',
            scholarship_package: 'TWSP (Training for Work Scholarship Program)',
            privacy_consent: true,
          },
          enrollmentApp: {
            id: '8e432a78-e803-42d6-8995-0970b54da5c8',
            reference_no: 'APP-2026-BST-001',
            learner_user_id: userId,
            institution_id: BST_INSTITUTION.institutionId,
            course_id: 'de56e9c4-1b60-4f1d-9aa3-df731c079129',
            training_batch_id: 'abef62b1-03c9-4fbd-b2ce-ea7921b54dd8',
            scholar_id: 'BST-SMAW-2026-001',
            learner_name: 'Juan Dela Cruz',
            email: 'scholar@tesdaconnect.ph',
            application_status: 'confirmed',
            record_completeness: 100,
            courses: { name: 'Shielded Metal Arc Welding (SMAW NC II)' },
          },
          updatedAt: nowIso,
        });
      }

      const docsCount = await offlineDb.cachedDocuments.where('ownerUserId').equals(userId).count();
      if (docsCount === 0) {
        const docs = [
          { type: 'registration_form', name: 'MIS_03_01_Registration_Form.pdf' },
          { type: 'psa_birth_certificate', name: 'PSA_Birth_Certificate_Juan_DelaCruz.pdf' },
          { type: 'educational_records', name: 'Form137_HighSchool_Diploma.pdf' },
          { type: 'id_pictures', name: '2x2_Official_ID_Picture.png' },
          { type: 'government_id', name: 'National_ID_Card.png' },
          { type: 'medical_certificate', name: 'Medical_Fit_To_Train_Cert.pdf' },
          { type: 'marriage_certificate', name: 'Not_Applicable_Single_Exemption.pdf' },
          { type: 'additional_documents', name: 'Barangay_Clearance_Tangalan.pdf' },
        ];
        await offlineDb.cachedDocuments.bulkPut(
          docs.map((doc) => ({
            id: `${userId}:doc:${doc.type}`,
            ownerUserId: userId,
            targetUserId: userId,
            institutionId: BST_INSTITUTION.institutionId,
            documentType: doc.type,
            originalName: doc.name,
            mimeType: doc.name.endsWith('.png') ? 'image/png' : 'application/pdf',
            sizeBytes: 350000,
            status: 'approved',
            remarks: 'Verified & approved by Registrar for official batch enrollment.',
            storagePath: `documents/${userId}/${doc.type}.pdf`,
            queuedUpload: false,
            syncedAt: nowIso,
          })),
        );
      }
    }
  } catch {
    // Non-fatal: offline workspace still opens even if baseline seeding hits storage quota.
  }
}

export async function saveOfflineUnlockCredential(
  email: string,
  password: string,
  profile: UserProfile,
  ttlHours = 12,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  revokedOfflineEmails.delete(normalizedEmail);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const passwordDigestHex = await deriveDigestHex(password, salt);
  const now = Date.now();
  const expiresAt = new Date(now + ttlHours * 3600 * 1000).toISOString();

  await offlineDb.offlineVault.put({
    email: normalizedEmail,
    userId: profile.id,
    saltHex: toHex(salt),
    passwordDigestHex,
    profile,
    expiresAt,
    syncedAt: new Date(now).toISOString(),
  });
}

export async function verifyOfflineUnlockCredential(
  email: string,
  password: string,
): Promise<{ ok: true; profile: UserProfile; expiresAt: string } | { ok: false; reason: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  if (normalizedEmail.endsWith(LEGACY_DEMO_EMAIL_DOMAIN)) {
    await offlineDb.offlineVault.delete(normalizedEmail).catch(() => undefined);
    return {
      ok: false,
      reason:
        'Legacy @tesdaconnect.test demo accounts are retired. Sign in with your live @tesdaconnect.ph account (e.g. admin@tesdaconnect.ph, registrar@tesdaconnect.ph, focal@tesdaconnect.ph, scholar@tesdaconnect.ph).',
    };
  }

  const record: OfflineVaultRecord | undefined = await offlineDb.offlineVault.get(normalizedEmail);

  if (!record) {
    const liveProfile = PREVERIFIED_LIVE_PROFILES[normalizedEmail];
    if (liveProfile && !revokedOfflineEmails.has(normalizedEmail) && password === LIVE_DEFAULT_PASSWORD) {
      const ttlHours = offlineTtlHoursForRole(liveProfile.role);
      await saveOfflineUnlockCredential(normalizedEmail, password, liveProfile, ttlHours);
      await seedBaselineOfflineCachesForUser(liveProfile);
      const created = await offlineDb.offlineVault.get(normalizedEmail);
      return {
        ok: true,
        profile: liveProfile,
        expiresAt: created?.expiresAt ?? offlineExpiryIsoForRole(liveProfile.role),
      };
    }

    return {
      ok: false,
      reason:
        'No authorized offline session exists on this device for this email. Connect online first and enable offline access at sign-in.',
    };
  }

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await offlineDb.offlineVault.delete(normalizedEmail);
    return {
      ok: false,
      reason: 'Your offline unlock window has expired. Connect to the internet to re-verify your credentials.',
    };
  }

  if (record.profile.accountStatus !== 'active') {
    return { ok: false, reason: 'This cached account is not active.' };
  }

  const candidateHex = await deriveDigestHex(password, fromHex(record.saltHex));
  const isDirectMatch = constantTimeEqual(candidateHex, record.passwordDigestHex);

  if (!isDirectMatch) {
    return { ok: false, reason: 'Offline credentials do not match the previously authorized account on this device.' };
  }

  return { ok: true, profile: record.profile, expiresAt: record.expiresAt };
}

/**
 * Removes the cached offline verifier for an email. Called when the server
 * definitively rejects a sign-in (wrong/changed password, banned or inactive
 * account) so stale credentials can no longer unlock the device offline.
 */
export async function revokeOfflineUnlockCredential(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  revokedOfflineEmails.add(normalized);
  await offlineDb.offlineVault.delete(normalized).catch(() => undefined);
}

/**
 * Slides the offline unlock window forward after the server has re-verified the
 * user's session (token refresh / app open while online) and stores the latest
 * profile, so role or status changes reach the offline copy. Does nothing when the
 * device has no offline credential for this user (it is only created at password sign-in).
 */
export async function extendOfflineUnlockWindow(profile: UserProfile): Promise<string | null> {
  const record = await offlineDb.offlineVault.where('userId').equals(profile.id).first();
  if (!record) return null;
  const expiresAt = offlineExpiryIsoForRole(profile.role);
  await offlineDb.offlineVault.update(record.email, {
    profile,
    expiresAt,
    syncedAt: new Date().toISOString(),
  });
  return expiresAt;
}

/** Removes every offline credential cached for a user id (e.g. account deactivated). */
export async function revokeOfflineUnlockCredentialsForUser(userId: string): Promise<void> {
  for (const profile of Object.values(PREVERIFIED_LIVE_PROFILES)) {
    if (profile.id === userId) {
      revokedOfflineEmails.add(profile.email.toLowerCase());
    }
  }
  await offlineDb.offlineVault.where('userId').equals(userId).delete().catch(() => undefined);
}

export const DEFAULT_IDLE_LOCK_MS = 15 * 60 * 1000;

export async function getUnexpiredOfflineProfileByUserId(userId: string): Promise<UserProfile | null> {
  const record = await offlineDb.offlineVault.where('userId').equals(userId).first();
  if (!record) return null;
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await offlineDb.offlineVault.delete(record.email).catch(() => undefined);
    return null;
  }
  if (record.profile.accountStatus !== 'active') return null;
  return record.profile;
}

/**
 * Verifies user password against PBKDF2 offline verifier hash to unlock a locked
 * shared-computer screen (never stores raw passwords).
 */
export async function verifySessionLockPassword(
  email: string,
  password: string,
): Promise<{ ok: boolean; reason?: string }> {
  const res = await verifyOfflineUnlockCredential(email, password);
  if (!res.ok) {
    return { ok: false, reason: res.reason };
  }
  return { ok: true };
}

export async function pruneExpiredVaultRecords(): Promise<number> {
  const nowMs = Date.now();
  return offlineDb.offlineVault
    .filter((record) => new Date(record.expiresAt).getTime() <= nowMs)
    .delete();
}
