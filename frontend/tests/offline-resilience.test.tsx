import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { OfflineReadyBadge } from '@/components/pwa/OfflineReadyBadge';
import { useOfflineReadinessStore } from '@/lib/pwa/offlineReadiness';

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

describe('Offline resilience', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useOfflineReadinessStore.getState().setReadiness('checking');
  });

  it('shows an offline-specific screen instead of a blank page when a page chunk cannot load', () => {
    render(
      <AppErrorBoundary>
        <Boom message="Failed to fetch dynamically imported module: https://app/assets/ReportsPage-x.js" />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: /not saved for offline use yet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go to my home screen/i })).toBeInTheDocument();
  });

  it('shows a generic recovery screen for other errors', () => {
    render(
      <AppErrorBoundary>
        <Boom message="Cannot read properties of undefined" />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: /Something went wrong/i })).toBeInTheDocument();
  });

  it('tells the user when the app is saved for offline use', () => {
    const { rerender } = render(<OfflineReadyBadge />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    useOfflineReadinessStore.getState().setReadiness('preparing');
    rerender(<OfflineReadyBadge />);
    expect(screen.getByRole('status')).toHaveTextContent('Saving for offline');

    useOfflineReadinessStore.getState().setReadiness('ready');
    rerender(<OfflineReadyBadge />);
    expect(screen.getByRole('status')).toHaveTextContent('Ready offline');
  });
});
