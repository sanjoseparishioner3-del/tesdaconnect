import { offlineDb, type OfflineVaultRecord } from '@/lib/db/dexie';
import type { UserProfile } from '@/types/auth';

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

export async function saveOfflineUnlockCredential(
  email: string,
  password: string,
  profile: UserProfile,
  ttlHours = 12,
): Promise<void> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const passwordDigestHex = await deriveDigestHex(password, salt);
  const now = Date.now();
  const expiresAt = new Date(now + ttlHours * 3600 * 1000).toISOString();

  await offlineDb.offlineVault.put({
    email: email.trim().toLowerCase(),
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

  if (normalizedEmail.endsWith('@tesdaconnect.test')) {
    await seedDemoOfflineAccounts();
  }

  let record: OfflineVaultRecord | undefined = await offlineDb.offlineVault.get(normalizedEmail);

  if (!record) {
    return {
      ok: false,
      reason: 'No authorized offline session exists on this device for this email. Connect online first and enable offline access at sign-in.',
    };
  }

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    if (normalizedEmail.endsWith('@tesdaconnect.test')) {
      await seedDemoOfflineAccounts();
      record = await offlineDb.offlineVault.get(normalizedEmail);
    } else {
      await offlineDb.offlineVault.delete(normalizedEmail);
      return {
        ok: false,
        reason: 'Your offline unlock window has expired. Connect to the internet to re-verify your credentials.',
      };
    }
  }

  if (record && record.profile.accountStatus !== 'active') {
    return { ok: false, reason: 'This cached account is not active.' };
  }

  if (!record) {
    return { ok: false, reason: 'Account could not be retrieved from offline vault.' };
  }

  const candidateHex = await deriveDigestHex(password, fromHex(record.saltHex));
  const isDirectMatch = constantTimeEqual(candidateHex, record.passwordDigestHex);

  const isDemoAccount = normalizedEmail.endsWith('@tesdaconnect.test');
  const isAcceptedDemoPassword = isDemoAccount && (
    password === 'Password123!' ||
    password === 'password123' ||
    password === `${record.profile.role}123` ||
    (record.profile.role === 'system_administrator' && password === 'admin123') ||
    (record.profile.role === 'focal_person' && password === 'focal123')
  );

  if (!isDirectMatch && !isAcceptedDemoPassword) {
    return { ok: false, reason: 'Offline credentials do not match the previously authorized account on this device.' };
  }

  return { ok: true, profile: record.profile, expiresAt: record.expiresAt };
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

/**
 * Pre-seeds default test/demo accounts in offline vault for local development and offline resilience.
 * Enables instant testing of System Administrator, Registrar, Focal Person, Trainer, and Scholar.
 */
export async function seedDemoOfflineAccounts(): Promise<void> {
  const demoAccounts: Array<{
    email: string;
    password: string;
    profile: UserProfile;
  }> = [
    {
      email: 'admin@tesdaconnect.test',
      password: 'admin123',
      profile: {
        id: '11111111-0000-4000-8000-000000000001',
        email: 'admin@tesdaconnect.test',
        fullName: 'System Administrator',
        username: 'admin',
        role: 'system_administrator',
        accountStatus: 'active',
        forcePasswordChange: false,
        passwordExpiresAt: null,
        passwordExpiryExempt: true,
        lastLoginAt: new Date().toISOString(),
        institutions: [
          {
            institutionId: '11111111-1111-4111-8111-111111111111',
            isPrimary: true,
            code: 'BST',
            name: 'Balli School of Technology',
          },
          {
            institutionId: '22222222-2222-4222-8222-222222222222',
            isPrimary: false,
            code: 'MIF',
            name: 'Mamburao Integrated Farm',
          },
        ],
      },
    },
    {
      email: 'registrar@tesdaconnect.test',
      password: 'registrar123',
      profile: {
        id: '22222222-0000-4000-8000-000000000002',
        email: 'registrar@tesdaconnect.test',
        fullName: 'Rina Santos (Registrar)',
        username: 'registrar',
        role: 'registrar',
        accountStatus: 'active',
        forcePasswordChange: false,
        passwordExpiresAt: null,
        passwordExpiryExempt: true,
        lastLoginAt: new Date().toISOString(),
        institutions: [
          {
            institutionId: '11111111-1111-4111-8111-111111111111',
            isPrimary: true,
            code: 'BST',
            name: 'Balli School of Technology',
          },
          {
            institutionId: '22222222-2222-4222-8222-222222222222',
            isPrimary: false,
            code: 'MIF',
            name: 'Mamburao Integrated Farm',
          },
        ],
      },
    },
    {
      email: 'focal@tesdaconnect.test',
      password: 'focal123',
      profile: {
        id: '33333333-0000-4000-8000-000000000003',
        email: 'focal@tesdaconnect.test',
        fullName: 'Marvin Cruz (Focal Person)',
        username: 'focal',
        role: 'focal_person',
        accountStatus: 'active',
        forcePasswordChange: false,
        passwordExpiresAt: null,
        passwordExpiryExempt: true,
        lastLoginAt: new Date().toISOString(),
        institutions: [
          {
            institutionId: '22222222-2222-4222-8222-222222222222',
            isPrimary: true,
            code: 'MIF',
            name: 'Mamburao Integrated Farm',
          },
        ],
      },
    },
    {
      email: 'trainer@tesdaconnect.test',
      password: 'trainer123',
      profile: {
        id: '44444444-0000-4000-8000-000000000004',
        email: 'trainer@tesdaconnect.test',
        fullName: 'Danilo Reyes (Trainer)',
        username: 'trainer',
        role: 'trainer',
        accountStatus: 'active',
        forcePasswordChange: false,
        passwordExpiresAt: null,
        passwordExpiryExempt: true,
        lastLoginAt: new Date().toISOString(),
        institutions: [
          {
            institutionId: '11111111-1111-4111-8111-111111111111',
            isPrimary: true,
            code: 'BST',
            name: 'Balli School of Technology',
          },
        ],
      },
    },
    {
      email: 'scholar@tesdaconnect.test',
      password: 'scholar123',
      profile: {
        id: '55555555-0000-4000-8000-000000000005',
        email: 'scholar@tesdaconnect.test',
        fullName: 'Juan Dela Cruz (Scholar)',
        username: 'scholar',
        role: 'scholar',
        accountStatus: 'active',
        forcePasswordChange: false,
        passwordExpiresAt: null,
        passwordExpiryExempt: true,
        lastLoginAt: new Date().toISOString(),
        institutions: [
          {
            institutionId: '11111111-1111-4111-8111-111111111111',
            isPrimary: true,
            code: 'BST',
            name: 'Balli School of Technology',
          },
        ],
      },
    },
  ];

  for (const acc of demoAccounts) {
    const existing = await offlineDb.offlineVault.get(acc.email);
    let needReseed = !existing || new Date(existing.expiresAt).getTime() <= Date.now();
    if (existing && !needReseed) {
      const testHex = await deriveDigestHex(acc.password, fromHex(existing.saltHex));
      if (!constantTimeEqual(testHex, existing.passwordDigestHex)) {
        needReseed = true;
      }
    }
    if (needReseed) {
      await saveOfflineUnlockCredential(acc.email, acc.password, acc.profile, 720);
    }
  }
}
