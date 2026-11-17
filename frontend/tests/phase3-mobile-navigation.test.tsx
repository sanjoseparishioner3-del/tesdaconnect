import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LearnerBottomNav } from '@/components/layout/LearnerBottomNav';
import { learnerTabHref, parseLearnerTab } from '@/features/learner/learnerTabs';

function renderNavAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LearnerBottomNav />
    </MemoryRouter>,
  );
}

describe('Phase 3: scholar mobile navigation', () => {
  it('parses and builds portal tab URLs, falling back to the overview', () => {
    expect(parseLearnerTab('progress')).toBe('progress');
    expect(parseLearnerTab('not-a-tab')).toBe('overview');
    expect(parseLearnerTab(null)).toBe('overview');
    expect(learnerTabHref('overview')).toBe('/learner');
    expect(learnerTabHref('requirements')).toBe('/learner?tab=requirements');
  });

  it('shows five thumb-reachable sections linking into the portal', () => {
    renderNavAt('/learner');
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Home', 'Form', 'Docs', 'Progress', 'Schedule']);
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/learner?tab=requirements');
  });

  it('marks the current portal section as active', () => {
    renderNavAt('/learner?tab=progress');
    expect(screen.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('marks nothing active outside the portal (e.g. announcements)', () => {
    renderNavAt('/announcements');
    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current');
    }
  });
});
