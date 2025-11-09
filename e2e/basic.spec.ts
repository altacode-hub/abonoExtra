import { test, expect } from '@playwright/test';

test('Home renderiza e navega para Login', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /missões de serviço extras/i })).toBeVisible();
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page).toHaveURL(/admin/);
});