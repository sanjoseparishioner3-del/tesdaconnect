import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScholarHome, type ScholarHomeProps } from '@/features/learner/home/ScholarHome';

const base: ScholarHomeProps = {
  fullName: 'Juan Dela Cruz',
  roleLabel: 'Scholar',
  campusName: 'Balli School of Technology',
  campusCode: 'BST',
  isOnline: true,
  photoUrl: null,
  appStatus: 'draft',
  referenceNo: null,
  completeness: 40,
  remarks: null,
  docsSubmitted: 1,
  docsRequired: 6,
  docsWaiting: 0,
  courseName: null,
  scholarId: null,
  uli: null,
  nextClass: null,
  latestAnnouncement: null,
  isLoading: false,
  onNavigate: vi.fn(),
  onCopy: vi.fn(),
  idCardProps: { fullName: 'Juan Dela Cruz', systemAccountId: 'uid-1' },
};

describe('Scholar home', () => {
  it('greets by first name and shows real empty states instead of invented records', () => {
    render(<ScholarHome {...base} />);
    expect(screen.getByRole('heading', { name: 'Juan' })).toBeInTheDocument();
    expect(screen.getByText('No upcoming classes yet.')).toBeInTheDocument();
    expect(screen.getByText('No announcements yet.')).toBeInTheDocument();
    expect(screen.getByText('Assigned after confirmation')).toBeInTheDocument();
  });

  it('points to the registration form first, then documents, based on actual progress', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ScholarHome {...base} onNavigate={onNavigate} />);
    expect(screen.getByText('Finish your registration form')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue form/i }));
    expect(onNavigate).toHaveBeenCalledWith('intake');

    rerender(<ScholarHome {...base} completeness={100} onNavigate={onNavigate} />);
    expect(screen.getByText('Upload your documents')).toBeInTheDocument();
    expect(screen.getByText(/5 required documents still missing/i)).toBeInTheDocument();
  });

  it('tells the learner when files are saved on the device waiting to be sent', () => {
    render(<ScholarHome {...base} completeness={100} docsWaiting={2} />);
    expect(screen.getByText(/2 file\(s\) saved on this device will be sent when you are online/i)).toBeInTheDocument();
  });

  it('shows registrar remarks and real class and announcement data', () => {
    render(
      <ScholarHome
        {...base}
        isOnline={false}
        appStatus="returned"
        remarks="Please upload a clearer PSA copy."
        nextClass={{ title: 'SMAW-B1: SMAW NC II', startsAt: '2026-12-01T08:00:00.000Z', venue: 'Welding Shop' }}
        latestAnnouncement={{ title: 'Orientation', body: 'Bring your valid ID.', date: null }}
      />,
    );
    expect(screen.getByText('Please upload a clearer PSA copy.')).toBeInTheDocument();
    expect(screen.getByText('Your registration was returned')).toBeInTheDocument();
    expect(screen.getByText('SMAW-B1: SMAW NC II')).toBeInTheDocument();
    expect(screen.getByText('Orientation')).toBeInTheDocument();
  });

  it('keeps the heavy digital ID card collapsed until the learner asks for it', async () => {
    const user = userEvent.setup();
    render(<ScholarHome {...base} />);
    const toggle = screen.getByRole('button', { name: /Digital ID/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the ULI only after the enrollment is confirmed', () => {
    const { rerender } = render(<ScholarHome {...base} uli="ULI-123" appStatus="submitted" />);
    expect(screen.queryByText('ULI-123')).not.toBeInTheDocument();
    rerender(<ScholarHome {...base} uli="ULI-123" appStatus="confirmed" completeness={100} docsSubmitted={6} />);
    expect(screen.getByText('ULI-123')).toBeInTheDocument();
  });
});
