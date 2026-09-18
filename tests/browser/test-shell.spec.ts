import { readFile, writeFile } from 'node:fs/promises';

import { expect, test as browserTest } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';

const test = browserTest.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await use(errors);
      expect(errors, 'The shell and remotes must not produce browser errors').toEqual([]);
    },
    { auto: true },
  ],
});

const shellHeader = (page: Page) => page.getByRole('banner', { name: 'Application shell' });

async function switchApp(page: Page, name: 'Discovery' | 'Geology') {
  await page.getByRole('button', { name: /^Switch application, current:/ }).click();
  const finder = page.getByRole('dialog', { name: 'Applications' });
  await finder.getByPlaceholder('Search applications…').fill(name);
  await finder.getByRole('menuitem', { name: new RegExp(name) }).click();
  await expect(finder).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}/$`));
  await expect(
    page.getByRole('heading', {
      name: name === 'Discovery' ? 'Orion Discovery' : 'Geologic Background',
      exact: true,
    }),
  ).toBeVisible();
}

async function appearance(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      height: style.height,
      padding: style.padding,
    };
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function assertBelowHeader(page: Page, appName: 'Discovery' | 'Geology') {
  const header = await shellHeader(page).boundingBox();
  const workspace = await page.getByRole('main', { name: `${appName} workspace` }).boundingBox();
  expect(header).not.toBeNull();
  expect(workspace).not.toBeNull();
  if (!header || !workspace) throw new Error('The shell header and workspace must be visible.');
  expect(header.y).toBe(0);
  expect(header.height).toBeGreaterThanOrEqual(48);
  expect(workspace.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  expect(workspace.height).toBeGreaterThan(300);
}

test('loads both real remotes beneath one persistent Tecton header', async ({ page }, testInfo) => {
  const loadedScripts = new Set<string>();
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (response.ok() && url.pathname.endsWith('.js')) loadedScripts.add(url.origin);
  });

  await page.goto('/discovery/');
  await expect(page.getByRole('heading', { name: 'Orion Discovery', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Project details' })).toBeVisible();
  await assertBelowHeader(page, 'Discovery');
  const originalHeader = await shellHeader(page).elementHandle();
  const headerStyle = await appearance(shellHeader(page));
  const documentStart = await page.evaluate(() => performance.timeOrigin);
  await capture(page, testInfo, 'discovery-desktop');

  await switchApp(page, 'Geology');
  await assertBelowHeader(page, 'Geology');
  await expect(shellHeader(page)).toHaveCount(1);
  expect(await originalHeader?.evaluate((node) => node.isConnected)).toBe(true);
  expect(await appearance(shellHeader(page))).toEqual(headerStyle);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);
  await expect.poll(() => loadedScripts.has('http://localhost:4101')).toBe(true);
  await expect.poll(() => loadedScripts.has('http://localhost:4102')).toBe(true);
  await capture(page, testInfo, 'geology-desktop');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByText('125% zoom', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset map view', exact: true }).click();
  await expect(page.getByText('100% zoom', { exact: true })).toBeVisible();

  await switchApp(page, 'Discovery');
  expect(await appearance(shellHeader(page))).toEqual(headerStyle);
  expect(await originalHeader?.evaluate((node) => node.isConnected)).toBe(true);
});

test('supports deep links, native app links and browser back and forward across apps', async ({
  page,
}) => {
  await page.goto('/discovery/framing');
  const framing = page.getByRole('region', { name: 'Project framing' });
  await expect(framing).toBeVisible();
  const documentStart = await page.evaluate(() => performance.timeOrigin);

  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page).toHaveURL(/\/discovery\/$/);
  await expect(page.getByRole('region', { name: 'Concept summary' })).toBeVisible();
  await page.getByRole('link', { name: 'Framing', exact: true }).click();
  await expect(page).toHaveURL(/\/discovery\/framing$/);
  await expect(framing).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/discovery\/$/);
  await expect(page.getByRole('region', { name: 'Concept summary' })).toBeVisible();
  await page.goForward();
  await expect(framing).toBeVisible();

  await switchApp(page, 'Geology');
  await page.goBack();
  await expect(page).toHaveURL(/\/discovery\/framing$/);
  await expect(framing).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole('heading', { name: 'Geologic Background', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);

  await page.reload();
  await expect(page).toHaveURL(/\/geology\/$/);
  await expect(
    page.getByRole('heading', { name: 'Geologic Background', exact: true }),
  ).toBeVisible();
});

test('propagates theme changes into the app and keeps the preference after reload', async ({
  page,
}) => {
  await page.goto('/discovery/');
  const app = page.getByTestId('discovery-app');
  await expect(app).toBeVisible();
  await expect(page.getByTestId('discovery-session')).toHaveText('Sarah Elliott · Dark theme');
  const darkApp = await appearance(app);
  const darkHeader = await appearance(shellHeader(page));

  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Switch to dark theme', exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await appearance(app)).background).not.toBe(darkApp.background);
  await expect(page.getByTestId('discovery-session')).toHaveText('Sarah Elliott · Light theme');
  const lightApp = await appearance(app);
  const lightHeader = await appearance(shellHeader(page));
  expect(lightHeader.background).not.toBe(darkHeader.background);

  await page.reload();
  await expect(app).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Switch to dark theme', exact: true }),
  ).toBeVisible();
  expect(await appearance(app)).toEqual(lightApp);
  await expect(page.getByTestId('discovery-session')).toHaveText('Sarah Elliott · Light theme');
  expect(await appearance(shellHeader(page))).toEqual(lightHeader);

  await switchApp(page, 'Geology');
  await expect(page.getByTestId('geology-session')).toHaveText('Sarah Elliott · Light theme');
  await expect(
    page.getByRole('button', { name: 'Switch to dark theme', exact: true }),
  ).toBeVisible();
  expect(await appearance(shellHeader(page))).toEqual(lightHeader);
});

test('searches apps with the command keyboard shortcut and exposes shortcut help', async ({
  page,
}) => {
  await page.goto('/discovery/');
  await expect(page.getByRole('heading', { name: 'Orion Discovery', exact: true })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  const palette = page.getByRole('dialog', { name: 'Command Palette' });
  await expect(palette).toBeVisible();
  const search = palette.getByPlaceholder('Search apps and commands…');
  await search.fill('Geology');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page).toHaveURL(/\/geology\/$/);
  await expect(
    page.getByRole('heading', { name: 'Geologic Background', exact: true }),
  ).toBeVisible();

  // A literal '/' alias stays '/' even with Shift in Playwright. The physical
  // Slash key produces the '?' symbol used by the real keyboard shortcut.
  await page.keyboard.press('Shift+Slash');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await expect(help.getByText('Open geological map', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(page).toHaveURL(/\/discovery\/$/);
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  for (const appName of ['Discovery', 'Geology'] as const) {
    test(`${appName} fits the viewport and keeps shell actions reachable`, async ({
      page,
    }, testInfo) => {
      await page.goto(`/${appName.toLowerCase()}/`);
      await expect(
        page.getByRole('heading', {
          name: appName === 'Discovery' ? 'Orion Discovery' : 'Geologic Background',
          exact: true,
        }),
      ).toBeVisible();
      await assertBelowHeader(page, appName);
      await expect(
        page.getByRole('button', { name: /^Switch application, current:/ }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Search or jump to…', exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360,
      );
      const workspace = page.getByRole('main', { name: `${appName} workspace` });
      expect(await workspace.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(360);
      await capture(page, testInfo, `${appName.toLowerCase()}-mobile`);

      if (appName === 'Discovery') {
        await page.getByRole('button', { name: 'Toggle project details' }).click();
        const sidebar = page.getByRole('complementary', { name: 'Project details' });
        await expect(sidebar).toBeVisible();
        await sidebar.getByRole('button', { name: 'Satellite drill locations 1.02' }).click();
        await expect(sidebar).toBeHidden();
        await expect(
          page.getByRole('button', { name: /Satellite drill locations FDA 1.02/ }),
        ).toBeVisible();
      }
    });
  }
});

browserTest('recovers from a failed remote entry when Try again is pressed', async ({ page }) => {
  const remoteEntry = 'http://localhost:4101/remoteEntry.js';
  const pageErrors: string[] = [];
  const unexpectedConsoleErrors: string[] = [];
  let retrying = false;
  let blockedRequests = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Only the intentionally aborted script request is an expected error.
    const expectedFailure =
      !retrying &&
      (message.location().url === remoteEntry ||
        /remoteEntry\.js|Failed to load resource: net::ERR_FAILED/.test(message.text()));
    if (!expectedFailure) unexpectedConsoleErrors.push(message.text());
  });
  await page.route(
    remoteEntry,
    async (route) => {
      blockedRequests += 1;
      await route.abort('failed');
    },
    { times: 1 },
  );

  await page.goto('/discovery/');
  await expect(page.getByRole('heading', { name: 'Unable to open Discovery' })).toBeVisible();
  expect(blockedRequests).toBe(1);
  const header = await shellHeader(page).elementHandle();
  const documentStart = await page.evaluate(() => performance.timeOrigin);
  await page.unroute(remoteEntry);
  retrying = true;

  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Orion Discovery', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await header?.evaluate((node) => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);
  expect(pageErrors).toEqual([]);
  expect(unexpectedConsoleErrors).toEqual([]);
});

test('loads the manifest URL supplied by a local development override', async ({ page }) => {
  const manifest = 'http://localhost:4101/mf-manifest.json?override=browser-proof';
  await page.addInitScript((url: string) => {
    localStorage.setItem('mfe.test-shell.overrides', JSON.stringify({ discovery: url }));
  }, manifest);
  const overrideResponse = page.waitForResponse((response) => response.url() === manifest);

  await page.goto('/discovery/');
  expect((await overrideResponse).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Orion Discovery', exact: true })).toBeVisible();
  await expect(page.getByTestId('discovery-session')).toHaveText('Sarah Elliott · Dark theme');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

// Keep this last: Playwright runs one worker, so its temporary source edit cannot
// reload pages belonging to another test. Always restore the original bytes.
test('reloads a changed remote route while preserving its URL and shell theme', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const routeFile = new URL('../../fixtures/discovery-app/src/routes/framing.tsx', import.meta.url);
  const original = await readFile(routeFile, 'utf8');
  const marker = 'Updated framing route — browser reload proof';
  const originalComponent = 'return <DiscoveryScreen framing />;';
  expect(original).toContain(originalComponent);
  const updated = original.replace(
    originalComponent,
    `return <><p role="status">${marker}</p><DiscoveryScreen framing /></>;`,
  );
  const rebuildStream = page.waitForResponse(
    (response) => response.url() === 'http://localhost:4101/__mfe_events',
  );
  await page.goto('/discovery/framing');
  expect((await rebuildStream).ok()).toBe(true);
  await expect(page.getByRole('region', { name: 'Project framing' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await expect(page.getByTestId('discovery-session')).toHaveText('Sarah Elliott · Light theme');
  const originalUrl = page.url();
  const documentStart = await page.evaluate(() => performance.timeOrigin);

  try {
    await writeFile(routeFile, updated);
    await expect(page.getByText(marker, { exact: true })).toBeVisible({ timeout: 45_000 });
    expect(await page.evaluate(() => performance.timeOrigin)).toBeGreaterThan(documentStart);
    await expect(page).toHaveURL(originalUrl);
    await expect(page.getByRole('region', { name: 'Project framing' })).toBeVisible();
    await expect(page.getByTestId('discovery-session')).toHaveText('Sarah Elliott · Light theme');
    await expect(
      page.getByRole('button', { name: 'Switch to dark theme', exact: true }),
    ).toBeVisible();
  } finally {
    await writeFile(routeFile, original);
    await expect(page.getByText(marker, { exact: true })).toHaveCount(0, { timeout: 45_000 });
  }
  await expect(page.getByRole('region', { name: 'Project framing' })).toBeVisible();
});
