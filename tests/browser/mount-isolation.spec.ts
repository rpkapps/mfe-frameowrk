import { expect, test } from '@playwright/test';

/**
 * Mount-isolation browser evidence. The fixture uses the real development shell,
 * two App mounts, and the 50 Widget/100-key scaling route. It deliberately records
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
    const target = window as Window & { __mountIsolationLongTasks?: number[] };
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries())
        target.__mountIsolationLongTasks?.push(entry.duration);
    });
    target.__mountIsolationLongTasks = [];
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
    longTasks:
      (window as Window & { __mountIsolationLongTasks?: number[] }).__mountIsolationLongTasks ?? [],
    resourceCount: performance.getEntriesByType('resource').length,
  }));
  await testInfo.attach('mount-isolation-runtime-evidence.json', {
    body: JSON.stringify({ ...evidence, warmup, requests }, null, 2),
    contentType: 'application/json',
  });
});

test('isolates one Widget key update across the 50 Widget, 100 key fixture', async ({ page }) => {
  await page.goto('/discovery/project/?dual=1&fixture=widget-storage-scaling');
  await expect(
    page.getByTestId('dual-first').getByRole('heading', { name: 'Orion Discovery', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('dual-second').getByRole('heading', { name: 'Orion Discovery', exact: true }),
  ).toBeVisible();
  const grid = page.getByTestId('widget-scaling-grid');
  await expect(grid).toHaveAttribute('data-widget-count', '50');
  const widgets = grid.locator('[data-widget-scaling-id]');
  await expect(widgets).toHaveCount(50);

  const layout = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      return rect
        ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
        : null;
    };
    const pane = document.querySelector('[data-testid="widget-scaling-pane"]');
    return {
      first: box('[data-testid="dual-first"]'),
      second: box('[data-testid="dual-second"]'),
      pane: box('[data-testid="widget-scaling-pane"]'),
      firstWidget: box('[data-widget-scaling-id="widget-scaling-1"]'),
      secondWidget: box('[data-widget-scaling-id="widget-scaling-2"]'),
      scrollHeight: pane?.scrollHeight ?? 0,
      clientHeight: pane?.clientHeight ?? 0,
    };
  });
  expect(layout.first).not.toBeNull();
  expect(layout.second).not.toBeNull();
  expect(layout.pane).not.toBeNull();
  expect(layout.first!.bottom).toBeLessThanOrEqual(layout.pane!.top);
  expect(layout.second!.bottom).toBeLessThanOrEqual(layout.pane!.top);
  expect(layout.secondWidget!.left).toBeGreaterThan(layout.firstWidget!.left);
  expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
  await page.locator('[data-testid="widget-scaling-pane"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const lastWidgetReachable = await page.evaluate(() => {
    const pane = document.querySelector('[data-testid="widget-scaling-pane"]');
    const last = document.querySelector('[data-widget-scaling-id="widget-scaling-50"]');
    if (!pane || !last) return false;
    const paneRect = pane.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();
    return lastRect.top >= paneRect.top && lastRect.bottom <= paneRect.bottom;
  });
  expect(lastWidgetReachable).toBe(true);

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
      id: node.getAttribute('data-widget-scaling-id'),
      commits: node.getAttribute('data-commits'),
      keys: node.getAttribute('data-key-values'),
    })),
  );
  await widgets.nth(0).getByRole('button').click();
  await expect(widgets.nth(0)).toHaveAttribute('data-key-values', '1,0');
  const after = await widgets.evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-widget-scaling-id'),
      commits: node.getAttribute('data-commits'),
      keys: node.getAttribute('data-key-values'),
    })),
  );
  expect(Number(after[0]?.commits ?? 0)).toBeGreaterThan(Number(before[0]?.commits ?? 0));
  expect(after[0]?.keys).toBe('1,0');
  expect(after.slice(1)).toEqual(before.slice(1));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId('widget-scaling-grid')).toHaveAttribute('data-widget-count', '50');
  await expect(page.locator('[data-widget-scaling-id]')).toHaveCount(50);
  await expect(page.locator('[data-widget-scaling-id="widget-scaling-50"]')).toBeAttached();
  const mobileLayout = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const first = rect('[data-testid="dual-first"]');
    const second = rect('[data-testid="dual-second"]');
    const pane = rect('[data-testid="widget-scaling-pane"]');
    return {
      viewportFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      panesStacked:
        first !== undefined &&
        second !== undefined &&
        second.top >= first.bottom &&
        first.height > 0 &&
        second.height > 0,
      paneBelowPanes:
        second !== undefined && pane !== undefined && pane.top >= second.bottom && pane.height > 0,
    };
  });
  expect(mobileLayout.viewportFits).toBe(true);
  expect(mobileLayout.panesStacked).toBe(true);
  expect(mobileLayout.paneBelowPanes).toBe(true);
  await page.locator('[data-testid="widget-scaling-pane"]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(
    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="widget-scaling-pane"]');
      const last = document.querySelector('[data-widget-scaling-id="widget-scaling-50"]');
      if (!pane || !last) return false;
      const paneRect = pane.getBoundingClientRect();
      const lastRect = last.getBoundingClientRect();
      return lastRect.top >= paneRect.top && lastRect.bottom <= paneRect.bottom;
    }),
  ).toBe(true);
});
