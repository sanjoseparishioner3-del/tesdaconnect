import { LEGACY_DEMO_EMAIL_DOMAIN, offlineDb, type OfflineVaultRecord } from '@/lib/db/dexie';
import { offlineExpiryIsoForRole } from '@/lib/offline/offlinePolicy';
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

  if (normalizedEmail.endsWith(LEGACY_DEMO_EMAIL_DOMAIN)) {
    await offlineDb.offlineVault.delete(normalizedEmail).catch(() => undefined);
    return { ok: false, reason: 'Demo accounts are not available. Sign in with your institutional account.' };
  }

  const record: OfflineVaultRecord | undefined = await offlineDb.offlineVault.get(normalizedEmail);

  if (!record) {
    return {
      ok: false,
      reason: 'No authorized offline session exists on this device for this email. Connect online first and enable offline access at sign-in.',
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
  await offlineDb.offlineVault.delete(email.trim().toLowerCase()).catch(() => undefined);
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
