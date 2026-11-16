import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompetencyAndAttendancePage } from '@/features/competency/CompetencyAndAttendancePage';
import { DigitalSystemIdCard } from '@/features/learner/DigitalSystemIdCard';
import { TrainingSchedulesPage } from '@/features/schedules/TrainingSchedulesPage';
import {
  canRolePublishAnnouncements,
  expandAndSanitizeTargetRoles,
  getAllowedAnnouncementTargetsForRole,
} from '@/lib/announcements/audienceRules';
import { offlineDb } from '@/lib/db/dexie';
import { normalizeDocumentTypeKey, TESDA_REQUIRED_DOCUMENTS } from '@/lib/documents/requiredDocuments';
import { saveOfflineUnlockCredential, verifyOfflineUnlockCredential } from '@/lib/offline/offlineAuth';
import { useAuthStore } from '@/stores/authStore';
import type { UserProfile } from '@/types/auth';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

function makeTestProfile(role: UserProfile['role'], overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: `user-${role}`,
    email: `${role}@tesda-connect.ph`,
    fullName: `Test ${role}`,
    username: role,
    role,
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: false,
    lastLoginAt: null,
    institutions: [{ institutionId: 'bst-1', code: 'BST', name: 'Balli School of Technology', isPrimary: true }],
    ...overrides,
  };
}

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TESDA Connect 11 Domain & Offline Refinements', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it('enforces all 8 exact TESDA documentary requirements and legacy aliases', () => {
    expect(TESDA_REQUIRED_DOCUMENTS).toHaveLength(8);
    expect(TESDA_REQUIRED_DOCUMENTS.map((d) => d.label)).toEqual([
      'Application / Registration Form',
      'PSA Birth Certificate',
      'Educational Records',
      'ID Pictures',
      'Valid Government-Issued ID',
      'Medical Certificate',
      'Marriage Certificate',
      'Additional Documents',
    ]);
    expect(normalizeDocumentTypeKey('birth_certificate')).toBe('psa_birth_certificate');
    expect(normalizeDocumentTypeKey('form_137')).toBe('educational_records');
    expect(normalizeDocumentTypeKey('id_photo')).toBe('id_pictures');
    expect(normalizeDocumentTypeKey('valid_id')).toBe('government_id');
    expect(normalizeDocumentTypeKey('barangay_clearance')).toBe('additional_documents');
  });

  it('restricts Announcement composer audiences strictly by Admin, Registrar, Focal Person, and Scholar roles', () => {
    expect(canRolePublishAnnouncements('system_administrator')).toBe(true);
    expect(canRolePublishAnnouncements('institutional_administrator')).toBe(true);
    expect(canRolePublishAnnouncements('registrar')).toBe(true);
    expect(canRolePublishAnnouncements('focal_person')).toBe(false);
    expect(canRolePublishAnnouncements('scholar')).toBe(false);

    expect(getAllowedAnnouncementTargetsForRole('system_administrator').map((t) => t.id)).toEqual([
      'scholars',
      'registrar',
      'focal_person',
    ]);

    const regTargets = getAllowedAnnouncementTargetsForRole('registrar').map((t) => t.id);
    expect(regTargets).toEqual(['focal_person', 'scholars']);
    expect(regTargets).not.toContain('registrar');

    // Even if tampered input passes 'registrar', registrar sanitization strips it
    const sanitized = expandAndSanitizeTargetRoles('registrar', ['registrar', 'focal_person', 'scholars']);
    expect(sanitized.targetRoles).not.toContain('registrar');
    expect(sanitized.targetRoles).toContain('focal_person');
    expect(sanitized.targetRoles).toContain('scholar');
    expect(sanitized.targetRoles).toContain('applicant');
  });

  it('renders Digital System Account ID with woven school lanyard, system disclaimer, and post-confirmation ULI gate', () => {
    const { rerender } = render(
      <DigitalSystemIdCard
        fullName="Kyla Marie Marturillas"
        systemAccountId="abcdef12-3456-7890"
        institutionCode="BST"
        institutionName="Balli School of Technology"
        courseName="Visual Graphic Design NC III"
        scholarId="BST-2026-0001"
        enrollmentStatus="verified"
        uliNumber="0487713087-001"
      />,
    );

    expect(screen.getByText(/SYSTEM ACCOUNT DIGITAL ID ONLY/i)).toBeInTheDocument();
    expect(screen.getByText(/TC-ABCDEF12/i)).toBeInTheDocument();
    // ULI stays hidden before enrollment confirmation
    expect(screen.getByText(/Pending TESDA Main ULI/i)).toBeInTheDocument();
    expect(screen.queryByText('0487713087-001')).not.toBeInTheDocument();

    rerender(
      <DigitalSystemIdCard
        fullName="Kyla Marie Marturillas"
        systemAccountId="abcdef12-3456-7890"
        institutionCode="BST"
        institutionName="Balli School of Technology"
        courseName="Visual Graphic Design NC III"
        scholarId="BST-2026-0001"
        enrollmentStatus="confirmed"
        uliNumber="0487713087-001"
      />,
    );
    expect(screen.getByText('0487713087-001')).toBeInTheDocument();
  });

  it('removes Attendance and Certificate tabs and restricts Progress & Achievement Charts editing to Focal Person', () => {
    useAuthStore.getState().setProfile(makeTestProfile('system_administrator'));
    const { rerender } = renderWithQuery(<CompetencyAndAttendancePage />);

    expect(screen.getByText(/Progress & Achievement Charts/i)).toBeInTheDocument();
    expect(screen.getByText(/Read-only oversight view/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Configure Tasks & Units/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Daily Attendance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Certification/i })).not.toBeInTheDocument();

    useAuthStore.getState().setProfile(makeTestProfile('focal_person'));
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <CompetencyAndAttendancePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: /Configure Tasks & Units/i })).toBeInTheDocument();
    expect(screen.queryByText(/Read-only oversight view/i)).not.toBeInTheDocument();
  });

  it('restricts Training Schedule & Batch management to Admin while Focal Person, Registrar, and Scholars see read-only Calendar', () => {
    useAuthStore.getState().setProfile(makeTestProfile('focal_person'));
    const { rerender } = renderWithQuery(<TrainingSchedulesPage />);
    expect(screen.getByText(/Read-only Schedules View/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Schedules & Announcements Calendar/i })).toBeInTheDocument();

    useAuthStore.getState().setProfile(makeTestProfile('system_administrator'));
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <TrainingSchedulesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: /Scheduling & Batch Management \(Admin\)/i })).toBeInTheDocument();
    expect(screen.queryByText(/Read-only Schedules View/i)).not.toBeInTheDocument();
  });

  it('stores and verifies PBKDF2 offline login unlock credentials and rejects wrong passwords', async () => {
    const profile = makeTestProfile('scholar');
    await saveOfflineUnlockCredential('Scholar@TESDA-Connect.ph', 'StrongPass123!', profile, 12);

    const ok = await verifyOfflineUnlockCredential('scholar@tesda-connect.ph', 'StrongPass123!');
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.profile.role).toBe('scholar');
    }

    const bad = await verifyOfflineUnlockCredential('scholar@tesda-connect.ph', 'WrongPassword99');
    expect(bad.ok).toBe(false);

    await offlineDb.offlineVault.clear();
  });
});
