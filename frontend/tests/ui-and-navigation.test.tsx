import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { FLAT_SIDEBAR_ITEMS } from '@/lib/rbac';
import { useAuthStore } from '@/stores/authStore';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('Converted UI & Flat Non-Collapsible Navigation', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it('omits manual offline checkbox, automatically enables offline support, and validates inputs', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText(/Permit authorized offline cache on this device/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enable Offline Mode/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Offline access prepares automatically per signed-in role/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Sign In$/i }));
    expect(await screen.findByText(/Enter a valid institutional email address/i)).toBeInTheDocument();
    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
  });

  it('renders flat non-collapsible sidebar links strictly matching user role', () => {
    useAuthStore.getState().setProfile({
      id: 'reg-1',
      email: 'registrar@bst.tesda.ph',
      fullName: 'Registrar BST',
      username: 'registrar_bst',
      role: 'registrar',
      accountStatus: 'active',
      forcePasswordChange: false,
      passwordExpiresAt: null,
      passwordExpiryExempt: false,
      lastLoginAt: null,
      institutions: [{ institutionId: 'bst-1', code: 'BST', name: 'Balli School of Technology', isPrimary: true }],
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<div>Dashboard Workspace</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const registrarExpected = FLAT_SIDEBAR_ITEMS.filter((i) => i.roles.includes('registrar'));
    for (const item of registrarExpected) {
      const escaped = item.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(screen.getByRole('link', { name: new RegExp(`^${escaped}$`, 'i') })).toBeInTheDocument();
    }

    // Scholar-only or sysadmin-only items are hidden from Registrar nav
    expect(screen.queryByRole('link', { name: /Security & Audit Logs/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /My Learning Portal/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /User Guide & Role Handbook/i })).toBeInTheDocument();

    // Verify no accordion dropdown toggles exist inside sidebar nav
    const nav = screen.getByRole('navigation', { name: /Primary navigation/i });
    expect(nav.querySelectorAll('[aria-expanded]')).toHaveLength(0);
  });

  it('exposes operational docs & courses to focal_person and isolates admin audit & registrar routes', () => {
    useAuthStore.getState().setProfile({
      id: 'fp-1',
      email: 'focal@bst.tesda.ph',
      fullName: 'Focal BST',
      username: 'focal_bst',
      role: 'focal_person',
      accountStatus: 'active',
      forcePasswordChange: false,
      passwordExpiresAt: null,
      passwordExpiryExempt: false,
      lastLoginAt: null,
      institutions: [{ institutionId: 'bst-1', code: 'BST', name: 'Balli School of Technology', isPrimary: true }],
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<div>Focal Workspace</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Operational Docs & Forms/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Courses & Materials/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Progress & Achievement Charts/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Attendance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Certificate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Enrollment Review/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Security & Audit Logs/i })).not.toBeInTheDocument();
  });

  it('purges offline user IndexedDB caches safely on clearDeviceData', async () => {
    const { offlineDb, purgeOfflineUserData } = await import('@/lib/db/dexie');
    await offlineDb.cachedAnnouncements.put({
      id: 'ann-shared-device',
      userId: 'user-shared',
      institutionId: 'inst-1',
      institutionCode: 'BST',
      title: 'Orientation Schedule',
      body: 'Room 101 at 08:00 AM',
      audience: 'all',
      publishedAt: '2026-11-16T00:00:00Z',
      expiresAt: null,
      deadlineAt: null,
      isRead: false,
      syncedAt: '2026-11-16T00:00:00Z',
    });

    expect(await offlineDb.cachedAnnouncements.where('userId').equals('user-shared').count()).toBe(1);
    await purgeOfflineUserData(offlineDb, 'user-shared');
    expect(await offlineDb.cachedAnnouncements.where('userId').equals('user-shared').count()).toBe(0);
  });
});
