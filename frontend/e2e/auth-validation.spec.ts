import { expect, test } from '@playwright/test';

test('shows validation errors before submitting an invalid registration', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Đăng ký' }).click();
  await expect(page.getByText('Email không hợp lệ')).toBeVisible();
  await expect(page.getByText('Mật khẩu tối thiểu 8 ký tự')).toBeVisible();
});
