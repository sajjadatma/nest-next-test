import { expect, test } from '@playwright/test';

test('registers, updates a profile, signs out, and signs back in', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'password123';

  await page.goto('/register');
  await page.getByLabel('Full name').fill('E2E Member');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await page.getByRole('button', { name: 'My account' }).click();
  await page.getByLabel('Full name').fill('Updated E2E Member');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile updated.')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Drive.' })).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});
