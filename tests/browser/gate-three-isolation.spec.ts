import { expect, test } from '@playwright/test';

/**
 * Gate 3 browser evidence. The fixture uses the real development shell, two App
 * mounts, and the 50 Widget/100-key scale route. It deliberately records
 * observations instead of inventing timing budgets. The production config runs
 * the same spec against compiled assets.
 */
test('records runtime mount metadata and independently cleans up one App mount', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script' || request.resourceType() === 'stylesheet')
      requests.push(request.url());
  });
  await page.goto('/discovery/project/?dual=1');
  await expect(page.getByTestId('dual-first')).toBeVisible();
  await expect(page.getByTestId('dual-second')).toBeVisible();
  const warmup = await page.evaluate(() => {
    const target = window as Window & { __gateThreeLongTasks?: number[] };
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) target.__gateThreeLongTasks?.push(entry.duration);
    });
    target.__gateThreeLongTasks = [];
    try {
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      /* unsupported */
    }
    return {
      timeOrigin: performance.timeOrigin,
      navigation: performance.getEntriesByType('navigation')[0]?.name,
    };
  });

  const first = page.getByTestId('dual-first');
  await first.getByRole('button', { name: 'Dispose first mount' }).click();
  await expect(first.getByRole('heading', { name: 'Orion Discovery', exact: true })).toHaveCount(0);
  await expect(
    page.getByTestId('dual-second').getByRole('heading', { name: 'Orion Discovery', exact: true }),
  ).toBeVisible();

  const evidence = await page.evaluate(() => ({
    device: navigator.userAgent,
    browser:
      (navigator as Navigator & { userAgentData?: { brands: unknown } }).userAgentData?.brands ??
      navigator.userAgent,
    network: (() => {
      const connection = (
        navigator as Navigator & {
          connection?: { effectiveType?: string; rtt?: number; downlink?: number };
        }
      ).connection;
      return connection
        ? {
            effectiveType: connection.effectiveType ?? null,
            rtt: connection.rtt ?? null,
            downlink: connection.downlink ?? null,
          }
        : null;
    })(),
    sampleCount: 1,
    longTasks: (window as Window & { __gateThreeLongTasks?: number[] }).__gateThreeLongTasks ?? [],
    resourceCount: performance.getEntriesByType('resource').length,
  }));
  await testInfo.attach('gate-three-runtime-evidence.json', {
    body: JSON.stringify({ ...evidence, warmup, requests }, null, 2),
    contentType: 'application/json',
  });
});

test('isolates one Widget key update across the 50 Widget, 100 key fixture', async ({ page }) => {
  await page.goto('/discovery/project/?dual=1&gate3=scale');
  await expect(
    page.getByTestId('dual-first').getByRole('heading', { name: 'Orion Discovery', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('dual-second').getByRole('heading', { name: 'Orion Discovery', exact: true }),
  ).toBeVisible();
  const grid = page.getByTestId('gate-three-widget-grid');
  await expect(grid).toHaveAttribute('data-widget-count', '50');
  const widgets = grid.locator('[data-gate-three-widget]');
  await expect(widgets).toHaveCount(50);
  await expect
    .poll(
      async () =>
        await widgets.evaluateAll((nodes) =>
          nodes.every((node) => Number(node.getAttribute('data-commits') ?? 0) > 0),
        ),
    )
    .toBe(true);
  const before = await widgets.evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-gate-three-widget'),
      commits: node.getAttribute('data-commits'),
      keys: node.getAttribute('data-key-values'),
    })),
  );
  await widgets.nth(0).getByRole('button').click();
  await expect(widgets.nth(0)).toHaveAttribute('data-key-values', '1,0');
  const after = await widgets.evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-gate-three-widget'),
      commits: node.getAttribute('data-commits'),
      keys: node.getAttribute('data-key-values'),
    })),
  );
  expect(Number(after[0]?.commits ?? 0)).toBeGreaterThan(Number(before[0]?.commits ?? 0));
  expect(after[0]?.keys).toBe('1,0');
  expect(after.slice(1)).toEqual(before.slice(1));
});
