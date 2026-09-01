import { expect, test } from '@playwright/test';

test('shows validation errors before submitting an invalid registration', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('That email address is not valid')).toBeVisible();
  await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
});
