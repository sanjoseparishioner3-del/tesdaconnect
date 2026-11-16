import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpandedDashboardPreview } from '@/components/landing/ExpandedDashboardPreview';
import { LandingPage } from '@/features/landing/LandingPage';
import {
  detectLandingCapabilities,
  HERO_PRESETS,
  MORPH_MODULE_CARDS,
} from '@/lib/landing/laptopMetrics';

function installMatchMediaStub(prefersReducedMotion = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: prefersReducedMotion
        ? query.includes('prefers-reduced-motion')
        : query.includes('min-width: 1024px'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('Scroll-Driven 3D Laptop Morph Landing Experience', () => {
  beforeEach(() => {
    installMatchMediaStub(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders institutional white/emerald hero, CTAs, all 6 workflow modules, and zero dark full-page wrapper', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <LandingPage />
      </MemoryRouter>,
    );

    const rootWrapper = container.firstElementChild as HTMLElement | null;
    expect(rootWrapper?.className).toContain('bg-white');
    expect(rootWrapper?.className).not.toContain('bg-slate-950');

    expect(
      screen.getByRole('heading', { name: /Modernized TESDA Training Operations/i }),
    ).toBeInTheDocument();

    // Verify top institutional nav links & Login CTA
    expect(screen.getByRole('link', { name: /Workflow Morph/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Supported Institutions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Technology/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /About/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Staff & Scholar Login/i })).toBeInTheDocument();

    // Verify preset buttons switch live dashboard content cleanly
    const bstButton = screen.getByRole('button', { name: /Balli School of Tech \(BST\)/i });
    await user.click(bstButton);
    expect(bstButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(/SMAW-NCII Workshop Orientation/i).length).toBeGreaterThan(0);

    // Verify all 6 separated modular workflow cards are rendered without deprecated modules
    for (const mod of MORPH_MODULE_CARDS) {
      expect(screen.getAllByText(mod.title).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText(/Competency & Attendance/i)).not.toBeInTheDocument();

    // Verify Stage 5 sections & 8 institutional gallery images remain intact
    expect(
      screen.getByRole('heading', { name: /Two Occidental Mindoro Campuses/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Built for Offline Reliability/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Designed Around Philippine TVET Operational Realities/i }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('img[src*="/images/landing/"]').length).toBe(8);
  }, 15000);

  it('switches ExpandedDashboardPreview metrics cleanly across all presets', () => {
    const { rerender } = render(<ExpandedDashboardPreview activePreset="core" />);
    expect(screen.getByText(HERO_PRESETS.core.headline)).toBeInTheDocument();

    rerender(<ExpandedDashboardPreview activePreset="mif" />);
    expect(screen.getByText(HERO_PRESETS.mif.headline)).toBeInTheDocument();
    expect(screen.getByText(/Organic Agriculture Competency Tasks/i)).toBeInTheDocument();

    rerender(<ExpandedDashboardPreview activePreset="sync" />);
    expect(screen.getByText(HERO_PRESETS.sync.headline)).toBeInTheDocument();
  });

  it('activates simplified fallback when prefers-reduced-motion or low-core hardware is detected', () => {
    installMatchMediaStub(true);

    const cap = detectLandingCapabilities();
    expect(cap.prefersReducedMotion).toBe(true);
    expect(cap.useSimplifiedMorph).toBe(true);
  });
});
