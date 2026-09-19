import { expect, test } from '@playwright/test';

test('toggles map presets while preserving the selected preset', async ({ page }) => {
  await page.goto('/geology/');

  const sidebar = page.getByRole('complementary', { name: 'Map presets' });
  const disclosure = sidebar.getByRole('button', { name: 'Pre-sets', exact: true });
  const selected = sidebar.getByRole('button', { name: /Framework Model/ });

  await selected.click();
  await expect(page.getByRole('heading', { name: 'Framework Model', exact: true })).toBeVisible();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');

  await disclosure.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar.getByRole('button', { name: /Framework Model/ })).toBeHidden();

  await disclosure.press(' ');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar.getByRole('button', { name: /Framework Model/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('opens the preset disclosure from the mobile map presets drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/geology/');

  await page.getByRole('button', { name: 'Toggle map presets', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Map presets' });
  const disclosure = sidebar.getByRole('button', { name: 'Pre-sets', exact: true });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');

  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar.getByRole('button', { name: /Geologic Background/ })).toBeHidden();
});
