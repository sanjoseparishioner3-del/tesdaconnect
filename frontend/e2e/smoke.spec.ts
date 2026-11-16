import { expect, test } from '@playwright/test';

test.describe('TCTESDAConnect Public, 3D Morph, PWA Precaching & Auth Guard Smoke', () => {
  test('renders light white/emerald landing page, interactive presets, 8 TESDA images, and login route', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Modernized TESDA Training Operations/i })).toBeVisible();

    const bstBtn = page.getByRole('button', { name: /Balli School of Tech/i });
    await expect(bstBtn).toBeVisible();
    await bstBtn.click();
    await expect(bstBtn).toHaveAttribute('aria-pressed', 'true');

    const landingImages = page.locator('img[src*="/images/landing/"]');
    const imgCount = await landingImages.count();
    expect(imgCount).toBe(8);

    // Verify desktop layout renders 3D canvas or accessible fallback cleanly without overflow
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    // Trigger scroll-driven morph stage progression when desktop HUD buttons are available
    const stage3Btn = page.getByRole('button', { name: /3\. Live Dashboard/i });
    if (await stage3Btn.isVisible()) {
      await stage3Btn.click();
      await page.waitForTimeout(450);
      await expect(page.getByText(/Live Workspace Architecture/i).first()).toBeVisible();

      await page.getByRole('button', { name: /4\. Core Modules/i }).click();
      await page.waitForTimeout(450);
      await expect(page.getByRole('heading', { name: /Six Unified Training Operations Modules/i })).toBeVisible();
    }

    // Scroll cleanly down through morph showcase into Stage 5 Institutional & Technology sections
    await page.locator('#institutions').scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: /Two Occidental Mindoro Campuses/i })).toBeVisible();
    await page.locator('#technology').scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: /Built for Offline Reliability/i })).toBeVisible();
    await page.locator('#about').scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: /Designed Around Philippine TVET/i })).toBeVisible();

    await page.getByRole('link', { name: /Staff & Scholar Login/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel(/Permit authorized offline cache/i)).toHaveCount(0);
  await expect(page.getByText(/Offline access prepares automatically per signed-in role/i)).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('renders mobile simplified morph cleanly and respects reduced motion', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();

    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Modernized TESDA Training Operations/i })).toBeVisible();
    await expect(page.getByText(/Unified Institutional Dashboard/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /Trainee Intake/i }).first()).toBeVisible();

    const hasMobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasMobileOverflow).toBe(false);
    await context.close();
  });

  test('serves PWA manifest, Workbox service worker, and offline procedural laptop GLB in built preview bundle', async ({ page }) => {
    const manifestRes = await page.request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifestJson = (await manifestRes.json()) as { short_name?: string; start_url?: string };
    expect(manifestJson.short_name).toBe('TESDA Connect');
    expect(manifestJson.start_url).toBe('/dashboard');

    const swRes = await page.request.get('/sw.js');
    expect(swRes.status()).toBe(200);

    const glbRes = await page.request.get('/models/tesda-laptop.glb');
    expect(glbRes.status()).toBe(200);
  });

  test('redirects unauthenticated requests from protected routes cleanly to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('validates unified login fields, password visibility toggle, no role tabs, recovery flow, and mobile responsiveness without crashing', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Welcome Back/i })).toBeVisible();
    await expect(page.getByText(/Unified Institutional Gateway/i)).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Sign in with Google/i })).toHaveCount(0);

    // Verify Show/Hide password visibility button toggles input type cleanly
    const pwdInput = page.locator('#password');
    await expect(pwdInput).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: /Show password/i }).click();
    await expect(pwdInput).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: /Hide password/i }).click();
    await expect(pwdInput).toHaveAttribute('type', 'password');

    // Validation errors on empty submit
    await page.getByRole('button', { name: /^Sign In$/i }).click();
    await expect(page.getByText(/Enter a valid institutional email address/i)).toBeVisible();
    await expect(page.getByText(/Password must be at least 8 characters/i)).toBeVisible();

    // Verify Forgot Password view & Back to Sign In
    await page.getByRole('button', { name: /Forgot Password\?/i }).click();
    await expect(page.getByRole('heading', { name: /Reset Password/i })).toBeVisible();
    await page.getByRole('button', { name: /Back to Sign In/i }).click();
    await expect(page.getByRole('heading', { name: /Welcome Back/i })).toBeVisible();

    // Mobile viewport check on /login (no horizontal overflow)
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(mobileOverflow).toBe(false);
  });
});

test('transitions seamlessly to automatic offline UI state when browser loses network without manual opt-in buttons', async ({
  page,
  context,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/login');
  await expect(page.getByRole('button', { name: /Enable Offline Mode/i })).toHaveCount(0);
  await expect(page.getByLabel(/Permit authorized offline cache/i)).toHaveCount(0);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));

  await expect(page.getByText(/Offline mode detected — automatic offline workspace ready/i)).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await page.goto('/');
  await expect(page.locator('header')).toBeVisible();

  const unexpectedErrors = consoleErrors.filter(
    (e) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::/i.test(e),
  );
  expect(unexpectedErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
